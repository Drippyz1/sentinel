import { execFile } from 'node:child_process'
import { lstat, readFile, realpath } from 'node:fs/promises'
import { basename, dirname, isAbsolute, normalize, parse, relative, sep } from 'node:path'
import { promisify } from 'node:util'
import type { StorageScope } from '../../shared/contracts/storageExplorer'
import { isCloudPath } from './protocol'

interface Mount {
  path: string
  local: boolean
}

export interface AuthorizedScope {
  display: StorageScope
  dev: bigint
  ino: bigint
  boundaries: string[]
}

const execute = promisify(execFile)
const linuxLocal = new Set([
  'ext2',
  'ext3',
  'ext4',
  'xfs',
  'btrfs',
  'f2fs',
  'ntfs',
  'ntfs3',
  'vfat',
  'exfat',
  'tmpfs',
  'overlay',
  'zfs',
  'iso9660',
  'udf',
  'hfs',
  'hfsplus',
  'bcachefs'
])
const macLocal = new Set(['apfs', 'hfs', 'msdos', 'exfat', 'ntfs', 'ufs', 'cd9660', 'udf'])

export function containsPath(
  root: string,
  path: string,
  foldCase = process.platform === 'darwin'
): boolean {
  const child = foldCase ? relative(root.toLowerCase(), path.toLowerCase()) : relative(root, path)
  return child === '' || (child !== '..' && !child.startsWith('..' + sep) && !isAbsolute(child))
}

export function parseLinuxMounts(content: string): Mount[] {
  return content.split('\n').flatMap((line) => {
    const [left, right] = line.split(' - ', 2)
    const field = left?.split(' ')[4]
    if (!field || !right || !field.startsWith('/')) return []
    const path = field.replace(/\\([0-7]{3})/g, (_, digits: string) =>
      String.fromCharCode(parseInt(digits, 8))
    )
    return [{ path, local: linuxLocal.has(right.split(' ')[0]) }]
  })
}

export function parseMacMounts(content: string): Mount[] {
  return content.split('\n').flatMap((line) => {
    const on = line.indexOf(' on /')
    const metadata = line.lastIndexOf(' (')
    if (on < 0 || metadata <= on || !line.endsWith(')')) return []
    const [type, ...flags] = line.slice(metadata + 2, -1).split(', ')
    return [
      { path: line.slice(on + 4, metadata), local: macLocal.has(type) && flags.includes('local') }
    ]
  })
}

async function approvedMounts(path: string): Promise<Mount[]> {
  if (process.platform === 'linux')
    return parseLinuxMounts(await readFile('/proc/self/mountinfo', 'utf8'))
  if (process.platform === 'darwin') {
    const { stdout } = await execute('/sbin/mount', [], { timeout: 2500, maxBuffer: 256 * 1024 })
    return parseMacMounts(stdout)
  }
  if (process.platform === 'win32') {
    const root = parse(path).root
    const drive = /^[A-Za-z]:\\$/.test(root) ? root[0].toUpperCase() : null
    if (!drive || !process.env.SystemRoot) return []
    // The only interpolated value is an ASCII drive letter, not a renderer-supplied path.
    const executable =
      process.env.SystemRoot + '\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
    const { stdout } = await execute(
      executable,
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `[int]([System.IO.DriveInfo]::new('${drive}:')).DriveType`
      ],
      { timeout: 3000, maxBuffer: 4096, windowsHide: true }
    )
    return [{ path: root, local: /^(2|3|5|6)$/.test(stdout.trim()) }]
  }
  return []
}

export async function authorizeStorageScope(path: string): Promise<AuthorizedScope | null> {
  if (!isAbsolute(path) || path.length > 4096) return null
  const location = normalize(path)
  if (isCloudPath(location)) return null
  try {
    // Check the mount before requesting metadata from the selected path.
    const mounts = await approvedMounts(location)
    const covering = mounts.filter((mount) => containsPath(mount.path, location))
    if (!covering.length || covering.some((mount) => !mount.local)) return null
    // Check parents first: realpath alone can resolve a link into a remote mount.
    const ancestors: string[] = []
    for (let parent = dirname(location); parent !== location; parent = dirname(parent)) {
      ancestors.push(parent)
      if (parent === dirname(parent)) break
    }
    for (const parent of ancestors.reverse()) {
      const stats = await lstat(parent, { bigint: true })
      if (stats.isSymbolicLink() || !stats.isDirectory()) return null
    }
    const before = await lstat(location, { bigint: true })
    if (before.isSymbolicLink() || !before.isDirectory()) return null
    const canonical = await realpath(location)
    if (canonical !== location) return null
    const stats = await lstat(canonical, { bigint: true })
    if (
      !stats.isDirectory() ||
      stats.isSymbolicLink() ||
      stats.dev !== before.dev ||
      stats.ino !== before.ino
    )
      return null
    return {
      display: { name: basename(canonical) || canonical, location: canonical },
      dev: stats.dev,
      ino: stats.ino,
      boundaries: mounts
        .filter(({ path }) => path !== canonical && containsPath(canonical, path))
        .map(({ path }) => path)
    }
  } catch {
    return null
  }
}
