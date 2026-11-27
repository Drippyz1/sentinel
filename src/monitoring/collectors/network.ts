import { networkInterfaces } from 'node:os'
import si from 'systeminformation'
import type {
  MetricCollectionResult,
  NetworkInterface,
  NetworkMetrics
} from '../../shared/contracts'
import { nonNegative, observed, unavailable } from '../probe'
import { CounterRates } from '../counterRates'

const networkRates = new CounterRates()

export function clearNetworkBaselines(): void {
  networkRates.clear()
}

export async function getNetworkMetrics(): Promise<MetricCollectionResult<NetworkMetrics>> {
  const stats = await si.networkStats().catch((error) => {
    networkRates.sample([], performance.now(), Date.now())
    throw error
  })
  const addresses = networkInterfaces()
  // The provider's default probe is route-selected. Never sum virtual and physical links.
  const counters = stats.slice(0, 1).flatMap((stat) => {
    const read = nonNegative(stat.rx_bytes)
    const write = nonNegative(stat.tx_bytes)
    return stat.iface &&
      !/^lo(?:\d+)?$/i.test(stat.iface) &&
      stat.operstate !== 'down' &&
      !addresses[stat.iface]?.every((address) => address.internal) &&
      (read !== null || write !== null) &&
      !(stat.operstate === 'unknown' && read === 0 && write === 0)
      ? [{ id: stat.iface, read, write }]
      : []
  })
  const rates = networkRates.sample(counters, performance.now(), Date.now())
  const interfaces: NetworkInterface[] = counters.map((counter) => {
    const downloadBytesPerSec = rates.get(counter.id)?.read ?? null
    const uploadBytesPerSec = rates.get(counter.id)?.write ?? null
    return {
      name: counter.id,
      downloadBytesPerSec,
      uploadBytesPerSec,
      totalDownloaded: counter.read,
      totalUploaded: counter.write,
      ipAddress:
        addresses[counter.id]?.find((address) => address.family === 'IPv4' && !address.internal)
          ?.address ??
        addresses[counter.id]?.find((address) => address.family === 'IPv6' && !address.internal)
          ?.address ??
        null,
      isActive: (downloadBytesPerSec ?? 0) > 0 || (uploadBytesPerSec ?? 0) > 0
    }
  })

  if (!interfaces.length) return unavailable('no-data')
  return observed({
    interfaces,
    monitoredInterface: interfaces[0].name,
    totalDownloadBytesPerSec: interfaces[0].downloadBytesPerSec,
    totalUploadBytesPerSec: interfaces[0].uploadBytesPerSec
  })
}
