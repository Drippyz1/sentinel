import { constants, type BigIntStats, type Dir } from 'node:fs'
import { lstat, open, opendir, realpath, statfs, type FileHandle } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout } from 'node:timers/promises'
import { STORAGE_LIMITS, type StorageIssue } from '../../shared/contracts/storageExplorer'
import { classify } from './classify'
import { StorageIndex } from './index'
import { initialScanReading, isCloudPath, type ScanReading } from './protocol'
import type { AuthorizedScope } from './scope'

type PathIdentity = Pick<BigIntStats, 'dev' | 'ino'>
interface Frame {
  path: string
  id: number
  handle: FileHandle | null
  dir: Dir
  stats: PathIdentity
  access: string
}
interface ScanOptions {
  cancelled: () => boolean
  progress: (reading: ScanReading) => void
  maxEntries?: number
  observe?: (id: number, parent: number | null, name: string, stats: BigIntStats) => void
}

class ScopeChanged extends Error {}

function identityMatches(actual: PathIdentity, expected: PathIdentity): boolean {
  return actual.dev === expected.dev && actual.ino === expected.ino
}

function modifiedAt(stats: BigIntStats): number | null {
  const value = Number(stats.mtimeMs)
  return Number.isSafeInteger(value) && Math.abs(value) <= 8.64e15 ? value : null
}

function issue(error: unknown): StorageIssue {
  if (error instanceof ScopeChanged) return 'changed'
  const code = (error as NodeJS.ErrnoException | undefined)?.code
  if (code === 'EACCES' || code === 'EPERM') return 'permission'
  if (code === 'ENOENT' || code === 'ESTALE') return 'vanished'
  if (code === 'ELOOP' || code === 'ENOTDIR') return 'changed'
  return 'io'
}

async function checkPath(path: string, expected: PathIdentity): Promise<void> {
  const stats = await lstat(path, { bigint: true })
  if (
    !stats.isDirectory() ||
    stats.isSymbolicLink() ||
    !identityMatches(stats, expected) ||
    (await realpath(path)) !== path
  )
    throw new ScopeChanged()
}

async function openDirectory(
  path: string,
  via: string,
  id: number,
  stats: PathIdentity
): Promise<Frame> {
  const anchored = process.platform === 'linux'
  let handle: FileHandle | null = null
  let dir: Dir | null = null
  try {
    if (!anchored) await checkPath(path, stats)
    if (process.platform !== 'win32') {
      handle = await open(via, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
      if (!identityMatches(await handle.stat({ bigint: true }), stats)) throw new ScopeChanged()
    }
    const access = anchored ? `/proc/self/fd/${handle!.fd}` : path
    dir = await opendir(access, { bufferSize: 32 })
    if (!anchored) await checkPath(path, stats)
    return { path, id, handle, dir, stats, access }
  } catch (error) {
    await dir?.close().catch(() => {})
    await handle?.close().catch(() => {})
    throw error
  }
}

async function closeDirectory(frame: Frame): Promise<void> {
  await frame.dir.close().catch(() => {})
  await frame.handle?.close().catch(() => {})
}

export async function scanStorage(
  scope: AuthorizedScope,
  { cancelled, progress, maxEntries = STORAGE_LIMITS.entries, observe }: ScanOptions
): Promise<{ index: StorageIndex; reading: ScanReading }> {
  const index = new StorageIndex(scope.display.location)
  const reading = initialScanReading()
  const start = performance.now()
  let reportedAt = -Infinity
  let outcome: ScanReading['state'] = 'complete'
  const links = new Set<string>()
  const stack: Frame[] = []
  const mountKey = (path: string) => (process.platform === 'darwin' ? path.toLowerCase() : path)
  const mountPoints = new Set(scope.boundaries.map(mountKey))
  const limit = Math.max(1, Math.min(maxEntries, STORAGE_LIMITS.entries))
  reading.state = 'scanning'

  function emit(force = false): void {
    reading.elapsedMs = Math.round(performance.now() - start)
    reading.indexed = index.size
    if (force || reading.elapsedMs - reportedAt >= 250) {
      reportedAt = reading.elapsedMs
      progress({ ...reading, skipped: { ...reading.skipped } })
    }
  }

  function skip(id: number, reason: StorageIssue): void {
    reading.skipped[reason]++
    index.markIncomplete(id, 1)
  }

  emit(true)
  try {
    const root = scope.display.location
    if (isCloudPath(root)) throw new ScopeChanged()
    await checkPath(root, scope)
    const stats = await lstat(root, { bigint: true })
    if (!identityMatches(stats, scope)) throw new ScopeChanged()
    const rootId = index.addDirectory(
      null,
      scope.display.name,
      classify(root, scope.display.name, true),
      modifiedAt(stats)
    )
    observe?.(rootId, null, scope.display.name, stats)
    stack.push(await openDirectory(root, root, rootId, scope))
    reading.peakOpenDirectories = 1
    // Use the authorized directory object on Linux for capacity as well as traversal.
    const volume = await statfs(stack[0].access, { bigint: true }).catch(() => null)
    if (
      volume &&
      volume.bsize > 0n &&
      volume.blocks > 0n &&
      volume.bavail >= 0n &&
      volume.bavail <= volume.blocks
    ) {
      reading.volume = {
        total: (volume.blocks * volume.bsize).toString(),
        available: (volume.bavail * volume.bsize).toString()
      }
    }
    while (stack.length && !cancelled()) {
      const frame = stack[stack.length - 1]
      let dirent
      try {
        if (process.platform !== 'linux') await checkPath(frame.path, frame.stats)
        dirent = await frame.dir.read()
      } catch (error) {
        skip(frame.id, issue(error))
        await closeDirectory(stack.pop()!)
        continue
      }
      if (!dirent) {
        await closeDirectory(stack.pop()!)
        continue
      }
      reading.processed++
      if (reading.processed % 128 === 0) {
        emit()
        await setTimeout(2)
      }
      if (cancelled()) {
        index.markIncomplete(frame.id)
        break
      }
      if (index.size >= limit || reading.processed > limit * 4) {
        skip(frame.id, 'entryLimit')
        outcome = 'partial'
        break
      }
      const name = dirent.name
      // Invalid byte names decoded with replacement cannot be looked up unambiguously.
      if (name.includes('\ufffd')) {
        skip(frame.id, 'special')
        continue
      }
      const path = join(frame.path, name)
      if (mountPoints.has(mountKey(path)) || isCloudPath(path)) {
        skip(frame.id, 'boundary')
        continue
      }
      if (dirent.isSymbolicLink()) {
        skip(frame.id, 'links')
        continue
      }
      const via = join(frame.access, name)
      try {
        const info = await lstat(via, { bigint: true })
        if (process.platform !== 'linux') await checkPath(frame.path, frame.stats)
        if (info.isSymbolicLink()) skip(frame.id, 'links')
        else if (info.dev !== scope.dev) skip(frame.id, 'boundary')
        else if (info.isDirectory()) {
          const id = index.addDirectory(
            frame.id,
            name,
            classify(path, name, true),
            modifiedAt(info)
          )
          observe?.(id, frame.id, name, info)
          if (stack.length >= STORAGE_LIMITS.depth) skip(id, 'depth')
          else {
            try {
              stack.push(await openDirectory(path, via, id, info))
              reading.peakOpenDirectories = Math.max(reading.peakOpenDirectories, stack.length)
            } catch (error) {
              skip(id, issue(error))
            }
          }
        } else if (info.isFile() && info.size >= 0n) {
          const key = info.nlink > 1n && info.ino > 0n ? `${info.dev}:${info.ino}` : null
          const alias = key !== null && links.has(key)
          if (key !== null) links.add(key)
          const knownBlocks =
            process.platform !== 'win32' && info.blocks >= 0n && (info.nlink <= 1n || key !== null)
          const id = index.size
          index.addFile(
            frame.id,
            name,
            classify(path, name, false),
            modifiedAt(info),
            info.size,
            alias ? 0n : knownBlocks ? info.blocks * 512n : null,
            alias
          )
          observe?.(id, frame.id, name, info)
        } else skip(frame.id, 'special')
      } catch (error) {
        skip(frame.id, issue(error))
      }
    }
  } catch (error) {
    reading.skipped[issue(error)]++
    reading.failure = error instanceof ScopeChanged ? 'scope-changed' : 'unavailable'
    outcome = 'failed'
  } finally {
    for (const frame of stack.reverse()) {
      if (outcome === 'partial' || cancelled()) index.markIncomplete(frame.id)
      await closeDirectory(frame)
    }
  }

  reading.state = cancelled()
    ? 'cancelled'
    : outcome === 'complete' && Object.values(reading.skipped).some(Boolean)
      ? 'partial'
      : outcome
  if (index.size && outcome !== 'failed') reading.totals = index.finish()
  reading.completedAt = Date.now()
  emit(true)
  return { index, reading }
}
