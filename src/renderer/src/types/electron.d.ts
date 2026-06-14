import type {
  AlertHistoryEntry,
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
  ProcessDetails,
  ProcessMetrics,
  SettingsSaveResult,
  SnapshotRow,
  StartupMetrics,
  SystemReportExport,
  SystemReportFormat,
  SystemInfo,
  ThermalMetrics,
  UiSettingsPatch
} from '../../../shared/contracts'

declare global {
  interface Window {
    electronAPI: {
      // Mini tray interface
      openMainWindow: () => Promise<void>
      quitApp: () => Promise<void>
      setTrayCompact: (compact: boolean) => Promise<void>

      // Live hardware metrics
      getLatestMetrics: () => Promise<MetricsSnapshot>
      onMetricsUpdated: (callback: (snapshot: MetricsSnapshot) => void) => () => void
      getCpuMetrics: () => Promise<CpuMetrics>
      getMemoryMetrics: () => Promise<MemoryMetrics>
      getDiskMetrics: () => Promise<DiskMetrics>
      getNetworkMetrics: () => Promise<NetworkMetrics>
      getProcessMetrics: () => Promise<ProcessMetrics>
      getProcessDetails: (pid: number) => Promise<ProcessDetails | null>
      revealProcess: (pid: number) => Promise<boolean>
      getGpuMetrics: () => Promise<GpuMetrics>
      getBatteryMetrics: () => Promise<BatteryMetrics>

      // Advanced collectors
      getSystemInfo: () => Promise<SystemInfo>
      getThermalMetrics: () => Promise<ThermalMetrics>
      getStartupMetrics: () => Promise<StartupMetrics>
      exportSystemReport: (format: SystemReportFormat) => Promise<SystemReportExport>
      getAnomalyReport: () => Promise<AnomalyReport | null>
      getAlertHistory: () => Promise<AlertHistoryEntry[]>
      markAllAlertsRead: () => Promise<AlertHistoryEntry[]>
      clearAlertHistory: () => Promise<AlertHistoryEntry[]>
      onAlertHistoryUpdated: (callback: (alerts: AlertHistoryEntry[]) => void) => () => void
      toggleStartupItem: (itemPath: string, enable: boolean) => Promise<boolean>

      // Settings
      getSettings: () => Promise<AppSettings>
      saveSettings: (settings: AppSettings) => Promise<SettingsSaveResult>
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
