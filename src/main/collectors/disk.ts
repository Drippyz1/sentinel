import si from 'systeminformation'

export interface DiskMetrics {
  drives: DiskDrive[]
  io: DiskIO
}

export interface DiskDrive {
  name: string
  mount: string
  type: string
  totalBytes: number
  usedBytes: number
  freeBytes: number
  usagePercent: number
}

export interface DiskIO {
  readBytesPerSec: number
  writeBytesPerSec: number
}

let previousIO = { read: 0, write: 0, timestamp: Date.now() }

export async function getDiskMetrics(): Promise<DiskMetrics> {
  const [fsData, ioData] = await Promise.all([
    si.fsSize(),
    si.disksIO()
  ])

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

  const now = Date.now()
  const elapsedSeconds = (now - previousIO.timestamp) / 1000

  // ioData can be null on macOS when the OS hasn't populated
  // the disk IO counters yet — guard the whole object, not just
  // the individual fields, otherwise accessing .rIO_sec throws
  const safeIO = ioData ?? { rIO_sec: 0, wIO_sec: 0, rIO: 0, wIO: 0 }

  const readBytesPerSec  = elapsedSeconds > 0 ? Math.max(0, safeIO.rIO_sec ?? 0) : 0
  const writeBytesPerSec = elapsedSeconds > 0 ? Math.max(0, safeIO.wIO_sec ?? 0) : 0

  previousIO = { read: safeIO.rIO ?? 0, write: safeIO.wIO ?? 0, timestamp: now }

  return {
    drives,
    io: { readBytesPerSec, writeBytesPerSec }
  }
}
