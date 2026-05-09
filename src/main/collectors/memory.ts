import si from 'systeminformation'

export interface MemoryMetrics {
  totalBytes: number        // total physical RAM
  usedBytes: number         // actually in use
  freeBytes: number         // completely unused
  activeBytes: number       // recently used pages
  inactiveBytes: number     // used but reclaimable
  cachedBytes: number       // disk cache in RAM
  swapTotalBytes: number    // total swap space
  swapUsedBytes: number     // swap currently in use
  usagePercent: number      // overall usage 0-100
  swapUsagePercent: number  // swap usage 0-100
}

export async function getMemoryMetrics(): Promise<MemoryMetrics> {
  const mem = await si.mem()

  // Guard against division by zero on machines with no swap
  const swapUsagePercent = mem.swaptotal > 0
    ? Math.round((mem.swapused / mem.swaptotal) * 100)
    : 0

  return {
    totalBytes: mem.total,
    usedBytes: mem.active,
    freeBytes: mem.free,
    activeBytes: mem.active,
    inactiveBytes: mem.inactive ?? 0,
    cachedBytes: mem.cached ?? 0,
    swapTotalBytes: mem.swaptotal,
    swapUsedBytes: mem.swapused,
    usagePercent: Math.round((mem.active / mem.total) * 100),
    swapUsagePercent
  }
}