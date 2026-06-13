import si from 'systeminformation'
import type { NetworkInterface, NetworkMetrics } from '../../shared/contracts'

export async function getNetworkMetrics(): Promise<NetworkMetrics> {
  const [stats, interfaces] = await Promise.all([
    si.networkStats(), // real-time transfer speeds
    si.networkInterfaces() // interface info like IP address
  ])

  // Build a lookup map from interface name → IP info
  // A "Map" is like an object but optimized for lookups by key
  const ifaceMap = new Map<string, string>()
  if (Array.isArray(interfaces)) {
    interfaces.forEach((iface) => {
      if (iface.ip4) ifaceMap.set(iface.iface, iface.ip4)
    })
  }

  const activeInterfaces: NetworkInterface[] = stats
    .filter((stat) => stat.iface && (stat.rx_sec ?? 0) >= 0)
    .map((stat) => ({
      name: stat.iface,
      downloadBytesPerSec: Math.max(0, stat.rx_sec ?? 0),
      uploadBytesPerSec: Math.max(0, stat.tx_sec ?? 0),
      totalDownloaded: stat.rx_bytes ?? 0,
      totalUploaded: stat.tx_bytes ?? 0,
      ipAddress: ifaceMap.get(stat.iface) ?? 'N/A',
      isActive: (stat.rx_sec ?? 0) > 0 || (stat.tx_sec ?? 0) > 0
    }))

  const totalDownloadBytesPerSec = activeInterfaces.reduce(
    (sum, iface) => sum + iface.downloadBytesPerSec,
    0
  )

  const totalUploadBytesPerSec = activeInterfaces.reduce(
    (sum, iface) => sum + iface.uploadBytesPerSec,
    0
  )

  return {
    interfaces: activeInterfaces,
    totalDownloadBytesPerSec,
    totalUploadBytesPerSec
  }
}
