export type HistoryView = 'chart' | 'table'
export type HistoryMetric = 'cpu' | 'memory' | 'network' | 'disk' | 'gpu' | 'battery'
export type ProcessDensity = 'compact' | 'comfortable'
export type ProcessQuickFilter = 'all' | 'cpu' | 'memory'
export type SystemView = 'simple' | 'advanced'
export const DASHBOARD_WIDGET_KEYS = [
  'cpu',
  'memory',
  'gpu',
  'disk',
  'network',
  'battery',
  'anomalies'
] as const
export type DashboardWidget = (typeof DASHBOARD_WIDGET_KEYS)[number]

export type HistoryMetricVisibility = Record<HistoryMetric, boolean>
export type DashboardWidgetVisibility = Record<DashboardWidget, boolean>

export interface MonitoringAlertRule {
  enabled: boolean
  thresholdPercent: number
}

export interface MonitoringAlerts {
  cpu: MonitoringAlertRule
  memory: MonitoringAlertRule
  disk: MonitoringAlertRule
  battery: MonitoringAlertRule
  cooldownMinutes: number
}

export interface UiSettings {
  dashboardPollingPaused: boolean
  dashboardWidgets: DashboardWidgetVisibility
  dashboardWidgetOrder: DashboardWidget[]
  historyView: HistoryView
  historyMetrics: HistoryMetricVisibility
  historyRangeMinutes: number
  processDensity: ProcessDensity
  processQuickFilter: ProcessQuickFilter
  systemView: SystemView
}

export type UiSettingsPatch = Partial<Omit<UiSettings, 'dashboardWidgets' | 'historyMetrics'>> & {
  dashboardWidgets?: Partial<DashboardWidgetVisibility>
  historyMetrics?: Partial<HistoryMetricVisibility>
}

export interface AppSettings {
  settingsVersion: number
  launchAtLogin: boolean
  hideFromDock: boolean
  pollIntervalMs: number
  tempUnit: 'C' | 'F'
  dataRetentionDays: number
  anomalySensitivity: 'sensitive' | 'balanced' | 'conservative'
  anomalyNotifications: boolean
  monitoringAlerts: MonitoringAlerts
  ui: UiSettings
}

export interface SettingsSaveResult {
  success: boolean
  settings: AppSettings
  launchAtLoginError: boolean
  isPackaged: boolean
}
