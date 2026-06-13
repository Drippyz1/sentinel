import { create } from 'zustand'
import { CpuMetrics } from '../../../main/collectors/cpu'
import { MemoryMetrics } from '../../../main/collectors/memory'
import { DiskMetrics } from '../../../main/collectors/disk'
import { NetworkMetrics } from '../../../main/collectors/network'
import { ProcessMetrics } from '../../../main/collectors/processes'
import { GpuMetrics } from '../../../main/collectors/gpu'
import { BatteryMetrics } from '../../../main/collectors/battery'
import { AnomalyReport } from '../../../main/analysis/anomalyDetector'
import { MetricsSnapshot } from '../../../main/services/MetricsService'
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
      networkUp: snapshot.network.totalUploadBytesPerSec
    })
  },

  setMetricsError: (error) => set({ error, isLoading: false })
}))
