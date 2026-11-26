import { networkInterfaces } from 'node:os'
import si from 'systeminformation'
import type {
  MetricCollectionResult,
  NetworkInterface,
  NetworkMetrics
} from '../../shared/contracts'
import { nonNegative, observed, unavailable } from '../probe'
import { CounterRates, sumCompleteRates } from '../counterRates'

const networkRates = new CounterRates()

export async function getNetworkMetrics(): Promise<MetricCollectionResult<NetworkMetrics>> {
  const stats = await si.networkStats().catch((error) => {
    networkRates.sample([], performance.now())
    throw error
  })
  const addresses = networkInterfaces()
  const counters = stats.flatMap((stat) => {
    const read = nonNegative(stat.rx_bytes)
    const write = nonNegative(stat.tx_bytes)
    return stat.iface &&
      (read !== null || write !== null) &&
      !(stat.operstate === 'unknown' && read === 0 && write === 0)
      ? [{ id: stat.iface, read, write }]
      : []
  })
  const rates = networkRates.sample(counters, performance.now())
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
        addresses[counter.id]?.find((address) => address.family === 'IPv4')?.address ?? 'N/A',
      isActive: (downloadBytesPerSec ?? 0) > 0 || (uploadBytesPerSec ?? 0) > 0
    }
  })

  if (!interfaces.length) return unavailable('no-data')
  return observed({
    interfaces,
    totalDownloadBytesPerSec: sumCompleteRates(
      interfaces.map((iface) => iface.downloadBytesPerSec)
    ),
    totalUploadBytesPerSec: sumCompleteRates(interfaces.map((iface) => iface.uploadBytesPerSec))
  })
}
