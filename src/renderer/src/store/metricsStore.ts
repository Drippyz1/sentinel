import { create } from 'zustand'
import { CpuMetrics } from '../../../main/collectors/cpu'
import { MemoryMetrics } from '../../../main/collectors/memory'
import { DiskMetrics } from '../../../main/collectors/disk'
import { NetworkMetrics } from '../../../main/collectors/network'
import { useHistoryStore } from './historyStore'

interface MetricsState {
  cpu:         CpuMetrics | null
  memory:      MemoryMetrics | null
  disk:        DiskMetrics | null
  network:     NetworkMetrics | null
  isLoading:   boolean
  error:       string | null
  lastUpdated: Date | null
  fetchAll:    () => Promise<void>
}

export const useMetricsStore = create<MetricsState>()((set) => ({
  cpu:         null,
  memory:      null,
  disk:        null,
  network:     null,
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

      // Push latest values into history store after every successful fetch
      // We access the history store directly (not via a hook) because
      // we're inside a plain function, not a React component
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
  }
}))