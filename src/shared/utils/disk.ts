import type { DiskDrive, DiskMetrics } from '../contracts'

const WINDOWS_SYSTEM_DRIVE = 'C:\\'

export function normalizeDiskMetrics(metrics: DiskMetrics | null | undefined): DiskMetrics {
  return {
    drives: (metrics?.drives ?? []).map(normalizeDiskDrive),
    io: {
      readBytesPerSec: nonNegativeNumber(metrics?.io?.readBytesPerSec),
      writeBytesPerSec: nonNegativeNumber(metrics?.io?.writeBytesPerSec)
    }
  }
}

export function selectPrimaryDrive(
  drives: readonly Partial<DiskDrive>[] | null | undefined
): DiskDrive | null {
  const normalized = (drives ?? []).map(normalizeDiskDrive)
  if (normalized.length === 0) return null

  return (
    normalized.find((drive) => drive.isPrimary) ??
    normalized.find((drive) => isWindowsSystemDrive(drive.mount)) ??
    normalized.find((drive) => drive.mount === '/') ??
    normalized.find((drive) => drive.mount === '/System/Volumes/Data') ??
    normalized.find((drive) => isWindowsDriveRoot(drive.mount)) ??
    [...normalized].sort((a, b) => b.totalBytes - a.totalBytes)[0] ??
    null
  )
}

export function normalizeDiskDrive(drive: Partial<DiskDrive>): DiskDrive {
  const totalBytes = nonNegativeNumber(drive.totalBytes)
  const fallbackAvailable = drive.availableBytes ?? drive.freeBytes
  const availableBytes = capacityNumber(fallbackAvailable, totalBytes)
  const freeBytes = capacityNumber(drive.freeBytes ?? availableBytes, totalBytes)
  const purgeableBytes = nullableCapacityNumber(drive.purgeableBytes, totalBytes)
  const usedBytes = capacityNumber(drive.usedBytes ?? totalBytes - availableBytes, totalBytes)

  return {
    name: nonEmptyText(drive.name, 'Unknown'),
    mount: nonEmptyText(drive.mount, 'Unknown'),
    type: nonEmptyText(drive.type, 'Unknown'),
    totalBytes,
    usedBytes,
    availableBytes,
    freeBytes,
    purgeableBytes,
    availableIncludesPurgeable: drive.availableIncludesPurgeable === true,
    usagePercent: percentageNumber(drive.usagePercent ?? deriveUsagePercent(usedBytes, totalBytes)),
    isPrimary: drive.isPrimary === true
  }
}

function deriveUsagePercent(usedBytes: number, totalBytes: number): number {
  if (totalBytes <= 0) return 0
  return Math.round((usedBytes / totalBytes) * 100)
}

function nonEmptyText(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback
}

function nonNegativeNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

function capacityNumber(value: unknown, totalBytes: number): number {
  const bytes = nonNegativeNumber(value)
  return totalBytes > 0 ? Math.min(bytes, totalBytes) : bytes
}

function nullableCapacityNumber(value: unknown, totalBytes: number): number | null {
  if (value === null || value === undefined) return null
  return capacityNumber(value, totalBytes)
}

function percentageNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, Math.round(value)))
}

function isWindowsSystemDrive(mount: string): boolean {
  return normalizeWindowsDriveRoot(mount) === WINDOWS_SYSTEM_DRIVE
}

function isWindowsDriveRoot(mount: string): boolean {
  return normalizeWindowsDriveRoot(mount) !== null
}

function normalizeWindowsDriveRoot(mount: string): string | null {
  const match = mount.replace(/\//g, '\\').match(/^([A-Za-z]):\\?$/)
  return match ? `${match[1].toUpperCase()}:\\` : null
}
