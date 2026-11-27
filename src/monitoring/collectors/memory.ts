import si from 'systeminformation'
import type { MemoryMetrics, MetricCollectionResult } from '../../shared/contracts'
import { nonNegative, observed, unavailable } from '../probe'

export async function getMemoryMetrics(): Promise<MetricCollectionResult<MemoryMetrics>> {
  const mem = await si.mem()
  const total = nonNegative(mem.total)
  const active = nonNegative(mem.active)
  const free = nonNegative(mem.free)
  if (!total || active === null || free === null || active > total || free > total) {
    return unavailable('no-data')
  }

  const swapTotal = nonNegative(mem.swaptotal)
  const used = nonNegative(mem.swapused)
  const swapUsed = used !== null && swapTotal !== null && used <= swapTotal ? used : null
  const available = nonNegative(mem.available)
  const swapUsagePercent =
    swapTotal !== null && swapTotal > 0 && swapUsed !== null && swapUsed <= swapTotal
      ? Math.round((swapUsed / swapTotal) * 100)
      : null

  return observed({
    totalBytes: total,
    availableBytes: available !== null && available <= total ? available : null,
    usedBytes: active,
    freeBytes: free,
    activeBytes: active,
    inactiveBytes: nonNegative((mem as typeof mem & { inactive?: number }).inactive),
    // The provider leaves `cached` at its initial zero on macOS and Windows.
    cachedBytes: process.platform === 'linux' ? nonNegative(mem.cached) : null,
    swapTotalBytes: swapTotal,
    swapUsedBytes: swapUsed,
    usagePercent: Math.round((active / total) * 100),
    swapUsagePercent
  })
}
