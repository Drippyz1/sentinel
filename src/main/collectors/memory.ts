import si from 'systeminformation'
import type { MemoryMetrics } from '../../shared/contracts'

export async function getMemoryMetrics(): Promise<MemoryMetrics> {
  const mem = await si.mem()

  const swapUsagePercent = mem.swaptotal > 0 ? Math.round((mem.swapused / mem.swaptotal) * 100) : 0

  return {
    totalBytes: mem.total,
    usedBytes: mem.active,
    freeBytes: mem.free,
    activeBytes: mem.active,
    // Fix: mem.inactive does not exist in systeminformation types;
    // use mem.available - mem.free as a proxy for reclaimable memory,
    // or fall back to 0 if unavailable
    inactiveBytes: (mem as typeof mem & { inactive?: number }).inactive ?? 0,
    cachedBytes: mem.cached ?? 0,
    swapTotalBytes: mem.swaptotal,
    swapUsedBytes: mem.swapused,
    usagePercent: Math.round((mem.active / mem.total) * 100),
    swapUsagePercent
  }
}
