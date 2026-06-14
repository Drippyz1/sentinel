export type HistoryView = 'chart' | 'table'
export type HistoryMetric = 'cpu' | 'memory' | 'network' | 'disk' | 'gpu' | 'battery'
export type ProcessDensity = 'compact' | 'comfortable'
export type ProcessQuickFilter = 'all' | 'cpu' | 'memory'
export type SystemView = 'simple' | 'advanced'
export type DashboardWidget =
  | 'cpu'
  | 'memory'
  | 'gpu'
  | 'disk'
  | 'network'
  | 'battery'
  | 'anomalies'

export type HistoryMetricVisibility = Record<HistoryMetric, boolean>
export type DashboardWidgetVisibility = Record<DashboardWidget, boolean>

export interface UiSettings {
  dashboardPollingPaused: boolean
  dashboardWidgets: DashboardWidgetVisibility
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
  ui: UiSettings
}
