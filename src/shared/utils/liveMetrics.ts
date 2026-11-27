import type { LiveMetricsFrame, MetricsSnapshot, MetricsView } from '../contracts/metrics'

export function metricsView(hash: string, role: 'main' | 'tray' | 'mini'): MetricsView {
  if (role !== 'main') return role
  const route = hash.slice(1).split('?')[0].replace(/\/+$/, '').toLowerCase()
  switch (route) {
    case '':
      return 'dashboard'
    case '/processes':
      return 'processes'
    case '/system':
      return 'system'
    default:
      return 'status'
  }
}

export function projectLiveMetrics(snapshot: MetricsSnapshot, view: MetricsView): LiveMetricsFrame {
  const {
    timestamp,
    sequence,
    statuses,
    capabilities,
    cpu,
    cpuTemperature,
    memory,
    disk,
    network,
    gpu,
    battery,
    processes,
    anomalyReport
  } = snapshot
  const frame = { view, timestamp, sequence, statuses, capabilities }
  switch (view) {
    case 'dashboard':
      return {
        ...frame,
        cpu,
        cpuTemperature,
        memory,
        disk,
        network,
        gpu,
        battery,
        anomalyReport,
        topProcesses:
          statuses.processes.state === 'ok' && processes
            ? processes.list.slice(0, 5).map(({ pid, name, cpuPercent, memoryBytes }) => ({
                pid,
                name,
                cpuPercent,
                memoryBytes
              }))
            : undefined
      }
    case 'processes':
      return { ...frame, processes }
    case 'system':
      return { ...frame, cpu, cpuTemperature, gpu }
    case 'tray':
    case 'mini':
      return {
        ...frame,
        cpu: cpu && { ...cpu, perCoreUsage: [] },
        memory,
        disk: view === 'tray' ? disk : undefined,
        network: network && {
          interfaces: [],
          totalDownloadBytesPerSec: network.totalDownloadBytesPerSec,
          totalUploadBytesPerSec: network.totalUploadBytesPerSec
        },
        gpu,
        battery
      }
    default:
      return frame
  }
}
