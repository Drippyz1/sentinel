import { create } from 'zustand'
import type {
  AnomalyReport,
  BatteryMetrics,
  CpuMetrics,
  DiskMetrics,
  GpuMetrics,
  MemoryMetrics,
  MetricsSnapshot,
  NetworkMetrics,
  ProcessMetrics
} from '../../../shared/contracts'
import { useHistoryStore } from './historyStore'

interface MetricsState {
  cpu: CpuMetrics | null
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

  applySnapshot: (snapshot: MetricsSnapshot) => void
  setMetricsError: (error: string) => void
}

export const useMetricsStore = create<MetricsState>()((set, get) => ({
  cpu: null,
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

  applySnapshot: (snapshot) => {
    const currentTimestamp = get().lastUpdated?.getTime() ?? 0
    if (snapshot.timestamp <= currentTimestamp) return

    set({
      cpu: snapshot.cpu,
      memory: snapshot.memory,
      disk: snapshot.disk,
      network: snapshot.network,
      processes: snapshot.processes,
      gpu: snapshot.gpu,
      battery: snapshot.battery,
      anomalyReport: snapshot.anomalyReport,
      isLoading: false,
      error: null,
      lastUpdated: new Date(snapshot.timestamp),
      processesUpdatedAt: new Date(snapshot.timestamp)
    })

    useHistoryStore.getState().pushSnapshot({
      timestamp: snapshot.timestamp,
      cpu: snapshot.cpu.usagePercent,
      memory: snapshot.memory.usagePercent,
      diskRead: snapshot.disk.io.readBytesPerSec,
      diskWrite: snapshot.disk.io.writeBytesPerSec,
      networkDown: snapshot.network.totalDownloadBytesPerSec,
      networkUp: snapshot.network.totalUploadBytesPerSec,
      gpu: snapshot.gpu.controllers[0]?.utilizationPercent ?? null,
      battery: snapshot.battery.hasBattery ? snapshot.battery.chargePercent : null
    })
  },

  setMetricsError: (error) => set({ error, isLoading: false })
}))
