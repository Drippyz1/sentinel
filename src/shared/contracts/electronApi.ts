import type {
  AlertAnalytics,
  AlertHistoryEntry,
  AlertMarker,
  AppSettings,
  SettingsReadResult,
  TrayAlertSummary,
  DiagnosticBundleExport,
  LiveMetricsFrame,
  NetworkConnectionsResult,
  ProcessDetails,
  ProcessIdentity,
  ProcessPage,
  ProcessPageRequest,
  SettingsSaveResult,
  SnapshotRow,
  StartupMetrics,
  SystemReportExport,
  SystemReportFormat,
  SystemInfo,
  ThermalMetrics,
  UiSettingsSnapshot,
  UiSettingsPatch
} from './index'
import type { AppearanceProfile } from './personalization'
import type { StorageQuery, StorageResult, StorageSnapshot } from './storageExplorer'
import type {
  DuplicateMode,
  DuplicatePreview,
  DuplicateQuery,
  DuplicateResult,
  DuplicateSnapshot
} from './duplicates'

export interface ElectronApi {
  // Mini tray interface
  openMainWindow: () => Promise<void>
  quitApp: () => Promise<void>
  copyText: (text: string) => Promise<void>
  setTrayCompact: (compact: boolean) => Promise<boolean>
  showMiniMonitor: () => Promise<boolean>
  hideMiniMonitor: () => Promise<boolean>
  setMiniMonitorAlwaysOnTop: (alwaysOnTop: boolean) => Promise<boolean>

  // Live hardware metrics
  getLatestMetrics: () => Promise<LiveMetricsFrame>
  onMetricsUpdated: (callback: (snapshot: LiveMetricsFrame) => void) => () => void
  getNetworkConnections: () => Promise<NetworkConnectionsResult>
  getProcessDetails: (pid: number) => Promise<ProcessDetails | null>
  getProcessPage: (request: ProcessPageRequest) => Promise<ProcessPage | null>
  revealProcess: (pid: number) => Promise<boolean>

  // Advanced collectors
  getSystemInfo: () => Promise<SystemInfo>
  getThermalMetrics: () => Promise<ThermalMetrics>
  getStartupMetrics: () => Promise<StartupMetrics>
  exportSystemReport: (format: SystemReportFormat) => Promise<SystemReportExport>
  exportDiagnosticBundle: () => Promise<DiagnosticBundleExport>
  getTrayAlertSummary: () => Promise<TrayAlertSummary>
  onTrayAlertSummaryUpdated: (callback: (summary: TrayAlertSummary) => void) => () => void
  getAlertHistory: () => Promise<AlertHistoryEntry[]>
  getAlertAnalytics: () => Promise<AlertAnalytics>
  getAlertMarkers: (minutes: number) => Promise<AlertMarker[]>
  markAllAlertsRead: () => Promise<AlertHistoryEntry[]>
  clearAlertHistory: () => Promise<AlertHistoryEntry[]>
  onAlertHistoryUpdated: (callback: (alerts: AlertHistoryEntry[]) => void) => () => void
  onAlertAnalyticsUpdated: (callback: (analytics: AlertAnalytics) => void) => () => void

  // Settings
  getSettings: () => Promise<SettingsReadResult>
  getUiSettings: () => Promise<UiSettingsSnapshot>
  saveSettings: (settings: AppSettings, applyLogin: boolean) => Promise<SettingsSaveResult>
  saveUiSettings: (patch: UiSettingsPatch) => Promise<boolean>
  importAppearanceProfile: () => Promise<
    { status: 'ready'; profile: AppearanceProfile } | { status: 'cancelled' | 'invalid' | 'error' }
  >
  exportAppearanceProfile: (
    profile: AppearanceProfile
  ) => Promise<'saved' | 'cancelled' | 'exists' | 'error'>
  onUiSettingsChanged: (callback: (snapshot: UiSettingsSnapshot) => void) => () => void

  killProcess: (
    identity: ProcessIdentity
  ) => Promise<{ success: boolean; cancelled?: boolean; error?: string }>

  // Historical data
  getHistoryDownsampled: (minutes: number) => Promise<SnapshotRow[]>

  getStorageSession: () => Promise<StorageSnapshot | null>
  chooseStorageScope: () => Promise<StorageSnapshot | null>
  startStorageScan: (id: string) => Promise<StorageSnapshot>
  cancelStorageScan: (id: string) => Promise<StorageSnapshot>
  dropStorageScan: (id: string) => Promise<void>
  queryStorageScan: (id: string, query: StorageQuery) => Promise<StorageResult | null>
  getDuplicateSession: () => Promise<{ supported: boolean; snapshot: DuplicateSnapshot | null }>
  chooseDuplicateScope: (mode: DuplicateMode) => Promise<DuplicateSnapshot | null>
  startDuplicateScan: (id: string) => Promise<DuplicateSnapshot>
  cancelDuplicateScan: (id: string) => Promise<DuplicateSnapshot>
  dropDuplicateScan: (id: string) => Promise<void>
  queryDuplicateScan: (id: string, query: DuplicateQuery) => Promise<DuplicateResult | null>
  previewDuplicateMember: (
    id: string,
    group: number,
    entry: number
  ) => Promise<DuplicatePreview | null>
}
