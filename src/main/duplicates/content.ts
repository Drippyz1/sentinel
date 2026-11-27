import { createHash } from 'node:crypto'
import { constants, type BigIntStats } from 'node:fs'
import { lstat, open, type FileHandle } from 'node:fs/promises'
import { join, sep } from 'node:path'
import { DUPLICATE_LIMITS, type DuplicateIssue } from '../../shared/contracts/duplicates'

interface Identity {
  dev: bigint
  ino: bigint
}
interface Directory extends Identity {
  parent: number | null
  name: string
}
export interface ContentFile extends Identity {
  id: number
  parent: number
  name: string
  size: bigint
  mtime: bigint
  ctime: bigint
  modifiedAt: number
  allocated: bigint | null
}

export class ContentIssue extends Error {
  constructor(readonly reason: DuplicateIssue) {
    super(reason)
  }
}

export class AnalysisStop extends Error {}

export function contentIssue(error: unknown): DuplicateIssue {
  if (error instanceof ContentIssue) return error.reason
  const code = (error as NodeJS.ErrnoException | undefined)?.code
  return ['ENOENT', 'ESTALE', 'ELOOP', 'ENOTDIR'].includes(code ?? '') ? 'changed' : 'unreadable'
}

const directoryFlags = constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
const fileFlags = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
const same = (a: Identity, b: Identity) => a.dev === b.dev && a.ino === b.ino && b.ino > 0n

function checkFile(s: BigIntStats, file: ContentFile): void {
  if (
    !s.isFile() ||
    !same(s, file) ||
    s.size !== file.size ||
    s.mtimeNs !== file.mtime ||
    s.ctimeNs !== file.ctime
  )
    throw new ContentIssue('changed')
  // POSIX cannot distinguish all offline stubs. Exclude obvious dataless files.
  if (s.size > 0n && s.blocks === 0n) throw new ContentIssue('unavailableData')
}

export class ContentIndex {
  readonly files: ContentFile[] = []
  private readonly directories = new Map<number, Directory>()

  constructor(
    readonly root: string,
    private readonly skip: (issue: DuplicateIssue) => void
  ) {}

  observe(id: number, parent: number | null, name: string, s: BigIntStats): void {
    if (s.isDirectory()) this.directories.set(id, { parent, name, dev: s.dev, ino: s.ino })
    else if (s.isFile() && parent !== null) {
      if (s.ino <= 0n) {
        this.skip('identityUnavailable')
        return
      }
      if (/\.icloud$/i.test(name) || (s.size > 0n && s.blocks === 0n)) {
        this.skip('unavailableData')
        return
      }
      this.files.push({
        id,
        parent,
        name,
        dev: s.dev,
        ino: s.ino,
        size: s.size,
        mtime: s.mtimeNs,
        ctime: s.ctimeNs,
        modifiedAt: Number(s.mtimeMs),
        allocated: s.blocks < 0n ? null : s.blocks * 512n
      })
    }
  }

  private ancestors(file: ContentFile): Directory[] {
    const dirs: Directory[] = []
    for (let id: number | null = file.parent; id !== null; ) {
      const dir = this.directories.get(id)
      if (!dir) throw new ContentIssue('changed')
      dirs.push(dir)
      id = dir.parent
    }
    return dirs.reverse()
  }

  location(file: ContentFile): string {
    return join(
      this.root,
      ...this.ancestors(file)
        .slice(1)
        .map((dir) => dir.name),
      file.name
    )
  }

  async withFile<T>(
    file: ContentFile,
    run: (handle: FileHandle) => Promise<T>,
    check: () => void
  ): Promise<T> {
    if (process.platform !== 'darwin' && process.platform !== 'linux')
      throw new ContentIssue('unreadable')
    const dirs = this.ancestors(file)
    const anchored = process.platform === 'linux'
    let parent: FileHandle | null = null
    let handle: FileHandle | null = null
    try {
      check()
      if (anchored) {
        parent = await open('/', directoryFlags)
        const descend = async (name: string, expected?: Directory) => {
          check()
          const next = await open(`/proc/self/fd/${parent!.fd}/${name}`, directoryFlags)
          try {
            if (expected && !same(await next.stat({ bigint: true }), expected))
              throw new ContentIssue('changed')
          } catch (error) {
            await next.close()
            throw error
          }
          const previous = parent
          parent = next
          await previous!.close()
        }
        for (const component of this.root.split(sep).filter(Boolean)) await descend(component)
        if (!same(await parent.stat({ bigint: true }), dirs[0])) throw new ContentIssue('changed')
        for (const dir of dirs.slice(1)) await descend(dir.name, dir)
        checkFile(await lstat(`/proc/self/fd/${parent.fd}/${file.name}`, { bigint: true }), file)
        handle = await open(`/proc/self/fd/${parent.fd}/${file.name}`, fileFlags)
      } else {
        await this.checkDarwinPath(dirs, check)
        const path = this.location(file)
        checkFile(await lstat(path, { bigint: true }), file)
        handle = await open(path, fileFlags)
        await this.checkDarwinPath(dirs, check)
      }
      checkFile(await handle.stat({ bigint: true }), file)
      check()
      const result = await run(handle)
      check()
      checkFile(await handle.stat({ bigint: true }), file)
      if (anchored)
        checkFile(await lstat(`/proc/self/fd/${parent!.fd}/${file.name}`, { bigint: true }), file)
      else {
        await this.checkDarwinPath(dirs, check)
        checkFile(await lstat(this.location(file), { bigint: true }), file)
      }
      return result
    } finally {
      await handle?.close().catch(() => {})
      await parent?.close().catch(() => {})
    }
  }

  private async checkDarwinPath(dirs: Directory[], check: () => void): Promise<void> {
    // Node exposes no directory-relative open on macOS. Check every lexical component.
    let path = '/'
    for (const name of this.root.split('/').filter(Boolean)) {
      check()
      path = join(path, name)
      if (!(await lstat(path, { bigint: true })).isDirectory()) throw new ContentIssue('changed')
    }
    for (const [i, dir] of dirs.entries()) {
      check()
      if (i) path = join(path, dir.name)
      const s = await lstat(path, { bigint: true })
      if (!s.isDirectory() || !same(s, dir)) throw new ContentIssue('changed')
    }
  }
}

export class ContentReads {
  private readonly lead = Buffer.allocUnsafe(DUPLICATE_LIMITS.chunk)
  private readonly peer = Buffer.allocUnsafe(DUPLICATE_LIMITS.chunk)
  bytes = 0

  constructor(
    readonly index: ContentIndex,
    readonly check: () => void,
    private readonly limit = DUPLICATE_LIMITS.totalBytes as number
  ) {}

  private async read(
    handle: FileHandle,
    buffer: Buffer,
    offset: number,
    length: number,
    position: number
  ): Promise<void> {
    let filled = 0
    while (filled < length) {
      this.check()
      if (this.bytes + length - filled > this.limit) throw new ContentIssue('resourceLimit')
      const { bytesRead } = await handle.read(
        buffer,
        offset + filled,
        length - filled,
        position + filled
      )
      if (!bytesRead) throw new ContentIssue('changed')
      this.bytes += bytesRead
      filled += bytesRead
    }
  }

  async digest(file: ContentFile): Promise<string> {
    return this.index.withFile(
      file,
      async (handle) => {
        const hash = createHash('sha256')
        const size = Number(file.size)
        for (let at = 0; at < size; ) {
          const length = Math.min(this.lead.length, size - at)
          await this.read(handle, this.lead, 0, length, at)
          hash.update(this.lead.subarray(0, length))
          at += length
        }
        return hash.digest('hex')
      },
      this.check
    )
  }

  async equal(a: ContentFile, b: ContentFile): Promise<boolean> {
    if (a.size !== b.size) return false
    return this.index.withFile(
      a,
      (left) =>
        this.index.withFile(
          b,
          async (right) => {
            const size = Number(a.size)
            for (let at = 0; at < size; ) {
              const length = Math.min(this.lead.length, size - at)
              await this.read(left, this.lead, 0, length, at)
              await this.read(right, this.peer, 0, length, at)
              if (!this.lead.subarray(0, length).equals(this.peer.subarray(0, length))) return false
              at += length
            }
            return true
          },
          this.check
        ),
      this.check
    )
  }

  loadPhoto(file: ContentFile): Promise<Buffer> {
    if (file.size <= 0n || file.size > BigInt(DUPLICATE_LIMITS.photoBytes))
      throw new ContentIssue('imageLimit')
    return this.index.withFile(
      file,
      async (handle) => {
        const data = Buffer.alloc(Number(file.size))
        await this.read(handle, data, 0, data.length, 0)
        return data
      },
      this.check
    )
  }
}
