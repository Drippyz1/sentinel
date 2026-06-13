import type {
  AnomalyReport,
  AppSettings,
  BatteryMetrics,
  CpuMetrics,
  DiskMetrics,
  GpuMetrics,
  HistorySummary,
  MemoryMetrics,
  MetricsSnapshot,
  NetworkMetrics,
  ProcessMetrics,
  SnapshotRow,
  StartupMetrics,
  SystemInfo,
  ThermalMetrics,
  UiSettingsPatch
} from '../../../shared/contracts'

declare global {
  interface Window {
    electronAPI: {
      // Mini tray interface
      openMainWindow: () => Promise<void>
      setTrayCompact: (compact: boolean) => Promise<void>

      // Live hardware metrics
      getLatestMetrics: () => Promise<MetricsSnapshot>
      onMetricsUpdated: (callback: (snapshot: MetricsSnapshot) => void) => () => void
      getCpuMetrics: () => Promise<CpuMetrics>
      getMemoryMetrics: () => Promise<MemoryMetrics>
      getDiskMetrics: () => Promise<DiskMetrics>
      getNetworkMetrics: () => Promise<NetworkMetrics>
      getProcessMetrics: () => Promise<ProcessMetrics>
      getGpuMetrics: () => Promise<GpuMetrics>
      getBatteryMetrics: () => Promise<BatteryMetrics>

      // Advanced collectors
      getSystemInfo: () => Promise<SystemInfo>
      getThermalMetrics: () => Promise<ThermalMetrics>
      getStartupMetrics: () => Promise<StartupMetrics>
      getAnomalyReport: () => Promise<AnomalyReport | null>
      toggleStartupItem: (itemPath: string, enable: boolean) => Promise<boolean>

      // Settings
      getSettings: () => Promise<AppSettings>
      saveSettings: (settings: AppSettings) => Promise<boolean>
      saveUiSettings: (patch: UiSettingsPatch) => Promise<boolean>
      onUiSettingsChanged: (callback: (patch: UiSettingsPatch) => void) => () => void
      showDock: () => Promise<void>
      hideDock: () => Promise<void>

      killProcess: (pid: number) => Promise<{ success: boolean; error?: string }>

      // Historical data
      getHistorySnapshots: (minutes: number) => Promise<SnapshotRow[]>
      getHistorySummary: (minutes: number) => Promise<HistorySummary>
      getHistoryDownsampled: (minutes: number) => Promise<SnapshotRow[]>
    }
  }
}
