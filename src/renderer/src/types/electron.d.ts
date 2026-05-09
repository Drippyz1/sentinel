import { CpuMetrics } from '../../../main/collectors/cpu'
import { MemoryMetrics } from '../../../main/collectors/memory'
import { DiskMetrics } from '../../../main/collectors/disk'
import { NetworkMetrics } from '../../../main/collectors/network'

declare global {
  interface Window {
    electronAPI: {
      getCpuMetrics:     () => Promise<CpuMetrics>
      getMemoryMetrics:  () => Promise<MemoryMetrics>
      getDiskMetrics:    () => Promise<DiskMetrics>
      getNetworkMetrics: () => Promise<NetworkMetrics>
    }
  }
}