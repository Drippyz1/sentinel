import { create } from 'zustand'
import type {
  AnomalyReport,
  BatteryMetrics,
  CpuMetrics,
  DiskMetrics,
  GpuMetrics,
  LiveMetricsFrame,
  MemoryMetrics,
  MetricGroup,
  MetricsView,
  NetworkMetrics,
  ProcessMetrics
} from '../../../shared/contracts'
import { useHistoryStore } from './historyStore'
import { metricsView } from '../../../shared/utils/liveMetrics'

interface MetricsState {
  cpu: CpuMetrics | null
  cpuTemperature: number | null
  memory: MemoryMetrics | null
  disk: DiskMetrics | null
  network: NetworkMetrics | null
  processes: ProcessMetrics | null
  gpu: GpuMetrics | null
  battery: BatteryMetrics | null
  anomalyReport: AnomalyReport | null

  isLoading: boolean
  error: string | null
  lastUpdated: Date | null
  processesUpdatedAt: Date | null
  sequence: number
  view: MetricsView | null
  statuses: LiveMetricsFrame['statuses'] | null

  applySnapshot: (snapshot: LiveMetricsFrame) => void
  setMetricsError: (error: string) => void
}

export const useMetricsStore = create<MetricsState>()((set, get) => ({
  cpu: null,
  cpuTemperature: null,
  memory: null,
  disk: null,
  network: null,
  processes: null,
  gpu: null,
  battery: null,
  anomalyReport: null,

  isLoading: true,
  error: null,
  lastUpdated: null,
  processesUpdatedAt: null,
  sequence: -1,
  view: null,
  statuses: null,

  applySnapshot: (snapshot) => {
    const previous = get()
    const hash = window.location.hash
    const role = hash === '#tray' ? 'tray' : hash === '#mini-monitor' ? 'mini' : 'main'
    if (snapshot.view !== metricsView(hash, role) || snapshot.sequence < previous.sequence) return
    const changedView = snapshot.view !== previous.view
    if (snapshot.sequence === previous.sequence && !changedView) return
    const changed = (group: MetricGroup) =>
      snapshot.statuses[group].revision !== previous.statuses?.[group].revision
    const fresh = (group: MetricGroup, value: number | null | undefined) =>
      changed(group) && snapshot.statuses[group].state === 'ok' ? (value ?? null) : null
    const processTime = snapshot.statuses.processes.sampledAt

    set({
      cpu:
        changedView || changed('cpu') || changed('cpuTemperature')
          ? (snapshot.cpu ?? null)
          : previous.cpu,
      cpuTemperature:
        changedView || changed('cpuTemperature')
          ? (snapshot.cpuTemperature ?? null)
          : previous.cpuTemperature,
      memory: changedView || changed('memory') ? (snapshot.memory ?? null) : previous.memory,
      disk:
        changedView || changed('diskCapacity') || changed('diskIo')
          ? (snapshot.disk ?? null)
          : previous.disk,
      network: changedView || changed('network') ? (snapshot.network ?? null) : previous.network,
      processes:
        changedView || changed('processes') ? (snapshot.processes ?? null) : previous.processes,
      gpu: changedView || changed('gpu') ? (snapshot.gpu ?? null) : previous.gpu,
      battery: changedView || changed('battery') ? (snapshot.battery ?? null) : previous.battery,
      anomalyReport: snapshot.anomalyReport ?? null,
      isLoading: false,
      error: null,
      lastUpdated: new Date(snapshot.timestamp),
      processesUpdatedAt:
        changedView || changed('processes')
          ? snapshot.processes && processTime !== null
            ? new Date(processTime)
            : null
          : previous.processesUpdatedAt,
      sequence: snapshot.sequence,
      view: snapshot.view,
      statuses: snapshot.statuses
    })

    if (snapshot.view !== 'dashboard') return
    useHistoryStore.getState().pushSnapshot({
      timestamp: snapshot.timestamp,
      cpu: fresh('cpu', snapshot.cpu?.usagePercent),
      memory: fresh('memory', snapshot.memory?.usagePercent),
      diskRead: fresh('diskIo', snapshot.disk?.io.readBytesPerSec),
      diskWrite: fresh('diskIo', snapshot.disk?.io.writeBytesPerSec),
      networkDown: fresh('network', snapshot.network?.totalDownloadBytesPerSec),
      networkUp: fresh('network', snapshot.network?.totalUploadBytesPerSec),
      gpu: fresh('gpu', snapshot.gpu?.controllers[0]?.utilizationPercent),
      battery: fresh('battery', snapshot.battery?.chargePercent)
    })
  },

  setMetricsError: (error) => set({ error, isLoading: false })
}))
