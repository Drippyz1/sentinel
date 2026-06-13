import { create } from 'zustand'
import { CpuMetrics } from '../../../main/collectors/cpu'
import { MemoryMetrics } from '../../../main/collectors/memory'
import { DiskMetrics } from '../../../main/collectors/disk'
import { NetworkMetrics } from '../../../main/collectors/network'
import { ProcessMetrics } from '../../../main/collectors/processes'
import { GpuMetrics } from '../../../main/collectors/gpu'
import { BatteryMetrics } from '../../../main/collectors/battery'
import { useHistoryStore } from './historyStore'

interface MetricsState {
  cpu: CpuMetrics | null
  memory: MemoryMetrics | null
  disk: DiskMetrics | null
  network: NetworkMetrics | null
  processes: ProcessMetrics | null
  gpu: GpuMetrics | null
  battery: BatteryMetrics | null

  isLoading: boolean
  error: string | null
  lastUpdated: Date | null
  processesUpdatedAt: Date | null

  fetchAll: () => Promise<void>
  fetchProcesses: () => Promise<void>
  fetchBattery: () => Promise<void>
}

export const useMetricsStore = create<MetricsState>()((set) => ({
  cpu: null,
  memory: null,
  disk: null,
  network: null,
  processes: null,
  gpu: null,
  battery: null,

  isLoading: false,
  error: null,
  lastUpdated: null,
  processesUpdatedAt: null,

  fetchAll: async () => {
    set({ isLoading: true, error: null })
    try {
      const [cpu, memory, disk, network, gpu] = await Promise.all([
        window.electronAPI.getCpuMetrics(),
        window.electronAPI.getMemoryMetrics(),
        window.electronAPI.getDiskMetrics(),
        window.electronAPI.getNetworkMetrics(),
        window.electronAPI.getGpuMetrics()
      ])

      set({ cpu, memory, disk, network, gpu, isLoading: false, lastUpdated: new Date() })

      const history = useHistoryStore.getState()
      history.pushCpu(cpu.usagePercent)
      history.pushMemory(memory.usagePercent)
      history.pushDiskRead(disk.io.readBytesPerSec)
      history.pushDiskWrite(disk.io.writeBytesPerSec)
      history.pushNetworkDown(network.totalDownloadBytesPerSec)
      history.pushNetworkUp(network.totalUploadBytesPerSec)
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to fetch metrics',
        isLoading: false
      })
    }
  },

  fetchProcesses: async () => {
    try {
      const processes = await window.electronAPI.getProcessMetrics()
      set({ processes, processesUpdatedAt: new Date() })
    } catch (err) {
      console.error('Failed to fetch processes:', err)
    }
  },

  // Battery is polled slowly — it changes much less frequently than hardware metrics
  fetchBattery: async () => {
    try {
      const battery = await window.electronAPI.getBatteryMetrics()
      set({ battery })
    } catch (err) {
      console.error('Failed to fetch battery:', err)
    }
  }
}))
