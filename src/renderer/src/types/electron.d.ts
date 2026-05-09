import { CpuMetrics }     from '../../../main/collectors/cpu'
import { MemoryMetrics }  from '../../../main/collectors/memory'
import { DiskMetrics }    from '../../../main/collectors/disk'
import { NetworkMetrics } from '../../../main/collectors/network'
import { ProcessMetrics } from '../../../main/collectors/processes'
import { GpuMetrics }     from '../../../main/collectors/gpu'
import { BatteryMetrics } from '../../../main/collectors/battery'
import { SystemInfo }     from '../../../main/collectors/systemInfo'
import { ThermalMetrics } from '../../../main/collectors/thermal'
import { StartupMetrics } from '../../../main/collectors/startup'
import { SnapshotRow }    from '../../../main/storage/queries'

export interface HistorySummary {
  avg_cpu:      number
  max_cpu:      number
  avg_memory:   number
  max_memory:   number
  avg_net_down: number
  max_net_down: number
  sample_count: number
}

declare global {
  interface Window {
    electronAPI: {
      // Live metrics
      getCpuMetrics:     () => Promise<CpuMetrics>
      getMemoryMetrics:  () => Promise<MemoryMetrics>
      getDiskMetrics:    () => Promise<DiskMetrics>
      getNetworkMetrics: () => Promise<NetworkMetrics>
      getProcessMetrics: () => Promise<ProcessMetrics>
      getGpuMetrics:     () => Promise<GpuMetrics>
      getBatteryMetrics: () => Promise<BatteryMetrics>

      // Advanced collectors
      getSystemInfo:     () => Promise<SystemInfo>
      getThermalMetrics: () => Promise<ThermalMetrics>
      getStartupMetrics: () => Promise<StartupMetrics>

      // Historical data
      getHistorySnapshots:   (minutes: number) => Promise<SnapshotRow[]>
      getHistorySummary:     (minutes: number) => Promise<HistorySummary>
      getHistoryDownsampled: (minutes: number) => Promise<SnapshotRow[]>
    }
  }
}