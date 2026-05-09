import { create } from 'zustand'
import { CpuMetrics }     from '../../../main/collectors/cpu'
import { MemoryMetrics }  from '../../../main/collectors/memory'
import { DiskMetrics }    from '../../../main/collectors/disk'
import { NetworkMetrics } from '../../../main/collectors/network'
import { ProcessMetrics } from '../../../main/collectors/processes'
import { useHistoryStore } from './historyStore'

interface MetricsState {
  cpu:         CpuMetrics | null
  memory:      MemoryMetrics | null
  disk:        DiskMetrics | null
  network:     NetworkMetrics | null
  processes:   ProcessMetrics | null
  isLoading:   boolean
  error:       string | null
  lastUpdated: Date | null
  fetchAll:       () => Promise<void>
  fetchProcesses: () => Promise<void>
}

export const useMetricsStore = create<MetricsState>()((set) => ({
  cpu:         null,
  memory:      null,
  disk:        null,
  network:     null,
  processes:   null,
  isLoading:   false,
  error:       null,
  lastUpdated: null,

  fetchAll: async () => {
    set({ isLoading: true, error: null })
    try {
      const [cpu, memory, disk, network] = await Promise.all([
        window.electronAPI.getCpuMetrics(),
        window.electronAPI.getMemoryMetrics(),
        window.electronAPI.getDiskMetrics(),
        window.electronAPI.getNetworkMetrics(),
      ])
      set({ cpu, memory, disk, network, isLoading: false, lastUpdated: new Date() })

      const history = useHistoryStore.getState()
      history.pushCpu(cpu.usagePercent)
      history.pushMemory(memory.usagePercent)
      history.pushDiskRead(disk.io.readBytesPerSec)
      history.pushDiskWrite(disk.io.writeBytesPerSec)
      history.pushNetworkDown(network.totalDownloadBytesPerSec)
      history.pushNetworkUp(network.totalUploadBytesPerSec)

    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to fetch metrics', isLoading: false })
    }
  },

  fetchProcesses: async () => {
    try {
      const processes = await window.electronAPI.getProcessMetrics()
      set({ processes })
    } catch (err) {
      console.error('Failed to fetch processes:', err)
    }
  }
}))