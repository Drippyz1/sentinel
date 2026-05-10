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
import { AnomalyReport }  from '../../../main/analysis/anomalyDetector'
import { AppSettings }    from '../../../main/storage/settings'

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

      // Mini tray interface
      openMainWindow: () => Promise<void>

      // Live hardware metrics
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
      getAnomalyReport:  () => Promise<AnomalyReport | null>
      toggleStartupItem: (itemPath: string, enable: boolean) => Promise<boolean>

      // Settings
      getSettings:  () => Promise<AppSettings>
      saveSettings: (settings: AppSettings) => Promise<boolean>
      showDock:     () => Promise<void>
      hideDock:     () => Promise<void>
      
      killProcess: (pid: number) => Promise<{ success: boolean; error?: string }>

      // Historical data
      getHistorySnapshots:   (minutes: number) => Promise<SnapshotRow[]>
      getHistorySummary:     (minutes: number) => Promise<HistorySummary>
      getHistoryDownsampled: (minutes: number) => Promise<SnapshotRow[]>
    }
  }
}