import si from 'systeminformation'

export interface DiskMetrics {
  drives: DiskDrive[]
  io: DiskIO
}

export interface DiskDrive {
  name: string          // e.g. "/dev/disk0"
  mount: string         // e.g. "/" (where it's mounted)
  type: string          // e.g. "APFS", "HFS+"
  totalBytes: number
  usedBytes: number
  freeBytes: number
  usagePercent: number
}

export interface DiskIO {
  readBytesPerSec: number   // current read speed
  writeBytesPerSec: number  // current write speed
}

// We need to track previous IO readings to calculate per-second rates
// These live outside the function so they persist between calls
let previousIO = { read: 0, write: 0, timestamp: Date.now() }

export async function getDiskMetrics(): Promise<DiskMetrics> {
  const [fsData, ioData] = await Promise.all([
    si.fsSize(),    // filesystem sizes and usage
    si.disksIO()    // raw disk IO counters
  ])

  // Filter to real mounted drives only — skip system/virtual mounts
  const drives: DiskDrive[] = fsData
    .filter(fs => fs.size > 0 && fs.mount && !fs.mount.startsWith('/System/Volumes/'))
    .map(fs => ({
      name: fs.fs,
      mount: fs.mount,
      type: fs.type,
      totalBytes: fs.size,
      usedBytes: fs.used,
      freeBytes: fs.size - fs.used,
      usagePercent: Math.round(fs.use)
    }))

  // Calculate bytes-per-second by comparing to previous reading
  // Raw IO counters are cumulative totals, not rates — we do the math ourselves
  const now = Date.now()
  const elapsedSeconds = (now - previousIO.timestamp) / 1000

  const readBytesPerSec = elapsedSeconds > 0
    ? Math.max(0, (ioData.rIO_sec ?? 0))
    : 0

  const writeBytesPerSec = elapsedSeconds > 0
    ? Math.max(0, (ioData.wIO_sec ?? 0))
    : 0

  previousIO = { read: ioData.rIO ?? 0, write: ioData.wIO ?? 0, timestamp: now }

  return {
    drives,
    io: { readBytesPerSec, writeBytesPerSec }
  }
}