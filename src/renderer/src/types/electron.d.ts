import type {
  AlertAnalytics,
  AlertHistoryEntry,
  AlertMarker,
  AppSettings,
  DiagnosticBundleExport,
  LiveMetricsFrame,
  NetworkConnectionsResult,
  ProcessDetails,
  ProcessIdentity,
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
      copyText: (text: string) => Promise<void>
      setTrayCompact: (compact: boolean) => Promise<void>
      showMiniMonitor: () => Promise<void>
      hideMiniMonitor: () => Promise<void>
      setMiniMonitorAlwaysOnTop: (alwaysOnTop: boolean) => Promise<boolean>

      // Live hardware metrics
      getLatestMetrics: () => Promise<LiveMetricsFrame>
      onMetricsUpdated: (callback: (snapshot: LiveMetricsFrame) => void) => () => void
      getNetworkConnections: () => Promise<NetworkConnectionsResult>
      getProcessDetails: (pid: number) => Promise<ProcessDetails | null>
      revealProcess: (pid: number) => Promise<boolean>

      // Advanced collectors
      getSystemInfo: () => Promise<SystemInfo>
      getThermalMetrics: () => Promise<ThermalMetrics>
      getStartupMetrics: () => Promise<StartupMetrics>
      exportSystemReport: (format: SystemReportFormat) => Promise<SystemReportExport>
      exportDiagnosticBundle: () => Promise<DiagnosticBundleExport>
      getAlertHistory: () => Promise<AlertHistoryEntry[]>
      getAlertAnalytics: () => Promise<AlertAnalytics>
      getAlertMarkers: (minutes: number) => Promise<AlertMarker[]>
      markAllAlertsRead: () => Promise<AlertHistoryEntry[]>
      clearAlertHistory: () => Promise<AlertHistoryEntry[]>
      onAlertHistoryUpdated: (callback: (alerts: AlertHistoryEntry[]) => void) => () => void
      onAlertAnalyticsUpdated: (callback: (analytics: AlertAnalytics) => void) => () => void

      // Settings
      getSettings: () => Promise<AppSettings>
      saveSettings: (settings: AppSettings) => Promise<SettingsSaveResult>
      onTempUnitChanged: (callback: (unit: AppSettings['tempUnit']) => void) => () => void
      saveUiSettings: (patch: UiSettingsPatch) => Promise<boolean>
      onUiSettingsChanged: (callback: (patch: UiSettingsPatch) => void) => () => void

      killProcess: (
        identity: ProcessIdentity
      ) => Promise<{ success: boolean; cancelled?: boolean; error?: string }>

      // Historical data
      getHistoryDownsampled: (minutes: number) => Promise<SnapshotRow[]>
    }
  }
}
