import { execFile } from 'child_process'
import { promisify } from 'util'
import si from 'systeminformation'
import type { Systeminformation } from 'systeminformation'
import type { DiskDrive, DiskIO, MetricCollectionResult } from '../../shared/contracts'
import { normalizeDiskDrive } from '../../shared/utils/disk'
import { nonNegative as nullableNumber, observed, unavailable } from '../probe'
import { CounterRates, sumCompleteRates } from '../counterRates'
import { readDiskCounters } from './diskCounters'

const execFileAsync = promisify(execFile)
const diskRates = new CounterRates()

export function clearDiskBaselines(): void {
  diskRates.clear()
}

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

export async function getDiskCapacity(): Promise<MetricCollectionResult<DiskDrive[]>> {
  const platform = diskPlatform()
  const fsData = await si.fsSize()

  const hasMacOsDataVolume =
    platform === 'darwin' &&
    fsData.some((fs) => text(fs.mount) === '/System/Volumes/Data' && nonNegativeNumber(fs.size) > 0)
  const includedFilesystems = fsData.filter((fs) =>
    shouldIncludeFilesystem(fs, platform, hasMacOsDataVolume)
  )
  if (includedFilesystems.length === 0) return unavailable('no-data')
  const macCapacities =
    platform === 'darwin'
      ? await getMacVolumeCapacities(
          includedFilesystems
            .filter((fs) => filesystemType(fs) === 'apfs')
            .map((fs) => text(fs.mount))
        )
      : new Map<string, MacVolumeCapacity>()

  const drives = includedFilesystems.flatMap((fs) => {
    const originalMount = text(fs.mount)
    const capacity = diskCapacity(fs, platform, macCapacities.get(originalMount))

    if (!capacity) return []
    return [
      normalizeDiskDrive({
        name: text(fs.fs) || originalMount || 'Unknown',
        mount: normalizeMount(fs, platform),
        type: text(fs.type) || 'Unknown',
        isPrimary: isPrimaryFilesystem(fs, platform, hasMacOsDataVolume),
        ...capacity
      })
    ]
  })

  return drives.length ? observed(drives) : unavailable('no-data')
}

export async function getDiskIo(): Promise<MetricCollectionResult<DiskIO>> {
  if (process.platform !== 'darwin' && process.platform !== 'linux') {
    return unavailable('not-supported')
  }
  let counters: Awaited<ReturnType<typeof readDiskCounters>>
  try {
    counters = await readDiskCounters(process.platform)
  } catch (error) {
    diskRates.sample([], performance.now(), Date.now())
    throw error
  }
  const rates = [...diskRates.sample(counters, performance.now(), Date.now()).values()]
  if (!rates.length) return unavailable('no-data')
  const readBytesPerSec = sumCompleteRates(rates.map((rate) => rate.read))
  const writeBytesPerSec = sumCompleteRates(rates.map((rate) => rate.write))
  return readBytesPerSec === null && writeBytesPerSec === null
    ? unavailable('warming-up')
    : observed({ readBytesPerSec, writeBytesPerSec })
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
): DiskCapacity | null {
  const totalBytes = nonNegativeNumber(fs.size)
  const reportedUsedBytes = nullableCapacityNumber(fs.used, totalBytes)
  const freeBytes =
    nullableCapacityNumber(fs.available, totalBytes) ??
    nullableCapacityNumber(macCapacity?.freeBytes, totalBytes) ??
    (platform !== 'darwin' && reportedUsedBytes !== null ? totalBytes - reportedUsedBytes : null)
  if (freeBytes === null) return null
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
      : (reportedUsedBytes ?? totalBytes - freeBytes)
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
    const { stdout } = await execFileAsync(
      '/usr/bin/osascript',
      ['-l', 'JavaScript', '-e', script],
      {
        timeout: 2000,
        maxBuffer: 1024 * 1024
      }
    )
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
  } catch {
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
