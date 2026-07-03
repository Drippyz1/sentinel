import { execFile } from 'child_process'
import { promisify } from 'util'
import si from 'systeminformation'
import type { Systeminformation } from 'systeminformation'
import type { DiskDrive, DiskMetrics } from '../../shared/contracts'
import { normalizeDiskMetrics } from '../../shared/utils/disk'

let previousIO = { read: 0, write: 0, timestamp: Date.now() }

const execFileAsync = promisify(execFile)

type SupportedDiskPlatform = 'darwin' | 'win32' | 'linux' | 'unix'

interface MacVolumeCapacity {
  importantAvailableBytes: number | null
  freeBytes: number | null
}

interface DiskCapacity {
  totalBytes: number
  usedBytes: number
  availableBytes: number
  freeBytes: number
  purgeableBytes: number | null
  availableIncludesPurgeable: boolean
  usagePercent: number
}

const LINUX_VIRTUAL_FS_TYPES = new Set([
  'autofs',
  'binfmt_misc',
  'bpf',
  'cgroup',
  'cgroup2',
  'configfs',
  'debugfs',
  'devpts',
  'devtmpfs',
  'efivarfs',
  'fusectl',
  'hugetlbfs',
  'mqueue',
  'nsfs',
  'overlay',
  'proc',
  'pstore',
  'ramfs',
  'securityfs',
  'squashfs',
  'sysfs',
  'tmpfs',
  'tracefs'
])

const LINUX_SYSTEM_MOUNT_PREFIXES = [
  '/dev',
  '/proc',
  '/run',
  '/snap',
  '/sys',
  '/var/lib/containers',
  '/var/lib/docker',
  '/var/snap'
]

export async function getDiskMetrics(): Promise<DiskMetrics> {
  const platform = diskPlatform()
  const [fsData, ioData] = await Promise.all([
    si.fsSize().catch((error) => {
      console.error('Disk filesystem collection failed:', error)
      return [] as Systeminformation.FsSizeData[]
    }),
    si.disksIO().catch((error) => {
      console.error('Disk IO collection failed:', error)
      return null
    })
  ])

  const hasMacOsDataVolume =
    platform === 'darwin' && fsData.some((fs) => text(fs.mount) === '/System/Volumes/Data')
  const includedFilesystems = fsData.filter((fs) =>
    shouldIncludeFilesystem(fs, platform, hasMacOsDataVolume)
  )
  const macCapacities =
    platform === 'darwin'
      ? await getMacVolumeCapacities(includedFilesystems.map((fs) => text(fs.mount)))
      : new Map<string, MacVolumeCapacity>()

  const drives: DiskDrive[] = includedFilesystems.map((fs) => {
    const originalMount = text(fs.mount)
    const capacity = diskCapacity(fs, platform, macCapacities.get(originalMount))

    return {
      name: text(fs.fs) || originalMount || 'Unknown',
      mount: normalizeMount(fs, platform),
      type: text(fs.type) || 'Unknown',
      isPrimary: isPrimaryFilesystem(fs, platform, hasMacOsDataVolume),
      ...capacity
    }
  })

  const now = Date.now()
  const elapsedSeconds = (now - previousIO.timestamp) / 1000

  // ioData can be null on macOS when the OS hasn't populated
  // the disk IO counters yet — guard the whole object, not just
  // the individual fields, otherwise accessing .rIO_sec throws
  const safeIO = ioData ?? { rIO_sec: 0, wIO_sec: 0, rIO: 0, wIO: 0 }

  const readBytesPerSec = elapsedSeconds > 0 ? nonNegativeNumber(safeIO.rIO_sec) : 0
  const writeBytesPerSec = elapsedSeconds > 0 ? nonNegativeNumber(safeIO.wIO_sec) : 0

  previousIO = {
    read: nonNegativeNumber(safeIO.rIO),
    write: nonNegativeNumber(safeIO.wIO),
    timestamp: now
  }

  return normalizeDiskMetrics({
    drives,
    io: { readBytesPerSec, writeBytesPerSec }
  })
}

function diskPlatform(): SupportedDiskPlatform {
  if (process.platform === 'darwin') return 'darwin'
  if (process.platform === 'win32') return 'win32'
  if (process.platform === 'linux') return 'linux'
  return 'unix'
}

function shouldIncludeFilesystem(
  fs: Systeminformation.FsSizeData,
  platform: SupportedDiskPlatform,
  hasMacOsDataVolume: boolean
): boolean {
  const mount = text(fs.mount)
  if (!mount || nonNegativeNumber(fs.size) <= 0) return false

  if (platform === 'darwin') {
    if (mount.includes('/CoreSimulator/Volumes/')) return false
    if (hasMacOsDataVolume && mount === '/') return false
    if (mount === '/System/Volumes/Data') return true
    if (mount.startsWith('/System/Volumes/')) return false
    return true
  }

  if (platform === 'win32') return true

  if (platform === 'linux') {
    if (mount === '/') return true
    if (LINUX_VIRTUAL_FS_TYPES.has(filesystemType(fs))) return false
    if (
      LINUX_SYSTEM_MOUNT_PREFIXES.some(
        (prefix) => mount === prefix || mount.startsWith(`${prefix}/`)
      )
    ) {
      return false
    }
  }

  return true
}

function diskCapacity(
  fs: Systeminformation.FsSizeData,
  platform: SupportedDiskPlatform,
  macCapacity?: MacVolumeCapacity
): DiskCapacity {
  const totalBytes = nonNegativeNumber(fs.size)
  const reportedUsedBytes = capacityNumber(fs.used, totalBytes)
  const freeBytes = capacityNumber(
    firstNumber(fs.available, macCapacity?.freeBytes, totalBytes - reportedUsedBytes),
    totalBytes
  )
  const importantAvailableBytes = nullableCapacityNumber(
    macCapacity?.importantAvailableBytes,
    totalBytes
  )
  const canUseMacAvailable =
    platform === 'darwin' &&
    filesystemType(fs) === 'apfs' &&
    importantAvailableBytes !== null &&
    importantAvailableBytes >= freeBytes
  const availableBytes = canUseMacAvailable ? importantAvailableBytes : freeBytes
  const purgeableBytes = canUseMacAvailable ? Math.max(0, availableBytes - freeBytes) : null
  const usedBytes =
    platform === 'darwin'
      ? capacityNumber(totalBytes - availableBytes, totalBytes)
      : reportedUsedBytes || capacityNumber(totalBytes - freeBytes, totalBytes)
  const usagePercent =
    platform === 'darwin'
      ? deriveUsagePercent(usedBytes, totalBytes)
      : percentageNumber(fs.use ?? deriveUsagePercent(usedBytes, totalBytes))

  return {
    totalBytes,
    usedBytes,
    availableBytes,
    freeBytes,
    purgeableBytes,
    availableIncludesPurgeable: canUseMacAvailable,
    usagePercent
  }
}

async function getMacVolumeCapacities(paths: string[]): Promise<Map<string, MacVolumeCapacity>> {
  const uniquePaths = [...new Set(paths.filter(Boolean))]
  if (uniquePaths.length === 0) return new Map()

  const script = `
ObjC.import('Foundation')
var paths = ${JSON.stringify(uniquePaths)}
var result = {}
for (var i = 0; i < paths.length; i++) {
  var path = paths[i]
  var url = $.NSURL.fileURLWithPath(path)
  var keys = $([
    $.NSURLVolumeAvailableCapacityForImportantUsageKey,
    $.NSURLVolumeAvailableCapacityKey
  ])
  var values = url.resourceValuesForKeysError(keys, null)
  var important = values ? values.objectForKey($.NSURLVolumeAvailableCapacityForImportantUsageKey) : null
  var free = values ? values.objectForKey($.NSURLVolumeAvailableCapacityKey) : null
  result[path] = {
    importantAvailableBytes: important ? Number(ObjC.unwrap(important)) : null,
    freeBytes: free ? Number(ObjC.unwrap(free)) : null
  }
}
JSON.stringify(result)
`

  try {
    const { stdout } = await execFileAsync('osascript', ['-l', 'JavaScript', '-e', script], {
      timeout: 2000,
      maxBuffer: 1024 * 1024
    })
    const parsed = JSON.parse(stdout) as Record<string, MacVolumeCapacity>
    return new Map(
      Object.entries(parsed).map(([path, capacity]) => [
        path,
        {
          importantAvailableBytes: nullableNumber(capacity.importantAvailableBytes),
          freeBytes: nullableNumber(capacity.freeBytes)
        }
      ])
    )
  } catch (error) {
    console.warn('macOS disk capacity collection failed; falling back to free space:', error)
    return new Map()
  }
}

function normalizeMount(fs: Systeminformation.FsSizeData, platform: SupportedDiskPlatform): string {
  const mount = text(fs.mount)
  if (platform === 'darwin' && mount === '/System/Volumes/Data') return '/'
  if (platform === 'win32') return normalizeWindowsDriveRoot(mount) ?? mount
  return mount || 'Unknown'
}

function isPrimaryFilesystem(
  fs: Systeminformation.FsSizeData,
  platform: SupportedDiskPlatform,
  hasMacOsDataVolume: boolean
): boolean {
  const mount = text(fs.mount)
  if (platform === 'darwin')
    return hasMacOsDataVolume ? mount === '/System/Volumes/Data' : mount === '/'
  if (platform === 'win32') return normalizeWindowsDriveRoot(mount) === windowsSystemDriveRoot()
  return mount === '/'
}

function windowsSystemDriveRoot(): string {
  const fromSystemDrive = normalizeWindowsDriveRoot(process.env.SystemDrive ?? '')
  if (fromSystemDrive) return fromSystemDrive

  const systemRoot = process.env.SystemRoot ?? process.env.WINDIR ?? ''
  const match = systemRoot.replace(/\//g, '\\').match(/^([A-Za-z]):\\/)
  return match ? `${match[1].toUpperCase()}:\\` : 'C:\\'
}

function normalizeWindowsDriveRoot(mount: string): string | null {
  const match = mount.replace(/\//g, '\\').match(/^([A-Za-z]):\\?$/)
  return match ? `${match[1].toUpperCase()}:\\` : null
}

function filesystemType(fs: Systeminformation.FsSizeData): string {
  return text(fs.type).toLowerCase()
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function firstNumber(...values: unknown[]): number {
  return (
    values.find((value): value is number => typeof value === 'number' && Number.isFinite(value)) ??
    0
  )
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

function nonNegativeNumber(value: unknown): number {
  return nullableNumber(value) ?? 0
}

function capacityNumber(value: unknown, totalBytes: number): number {
  const bytes = nonNegativeNumber(value)
  return totalBytes > 0 ? Math.min(bytes, totalBytes) : bytes
}

function nullableCapacityNumber(value: unknown, totalBytes: number): number | null {
  const bytes = nullableNumber(value)
  if (bytes === null) return null
  return totalBytes > 0 ? Math.min(bytes, totalBytes) : bytes
}

function deriveUsagePercent(usedBytes: number, totalBytes: number): number {
  if (totalBytes <= 0) return 0
  return percentageNumber((usedBytes / totalBytes) * 100)
}

function percentageNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, Math.round(value)))
}
