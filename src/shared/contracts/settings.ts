import type { MetricGroup } from './metrics'
import {
  type DashboardWidget,
  DEFAULT_APPEARANCE,
  DEFAULT_DASHBOARD_LAYOUT,
  DEFAULT_MINI_PRESENTATION,
  DEFAULT_TRAY_PRESENTATION,
  type Appearance,
  type DashboardLayout,
  type MiniPresentation,
  type TrayPresentation,
  type AppearanceProfile
} from './personalization'

type HistoryView = 'chart' | 'table'
export type HistoryMetric = 'cpu' | 'memory' | 'network' | 'disk' | 'gpu' | 'battery'
export type ProcessDensity = 'compact' | 'comfortable'
export type DashboardDensity = 'compact' | 'comfortable' | 'detailed'
export type ProcessQuickFilter = 'all' | 'cpu' | 'memory'
export type SystemView = 'simple' | 'advanced'
export { DASHBOARD_WIDGET_KEYS, type DashboardWidget } from './personalization'

type HistoryMetricVisibility = Record<HistoryMetric, boolean>
export type DashboardWidgetVisibility = Record<DashboardWidget, boolean>

export interface MiniMonitorPosition {
  x: number
  y: number
}

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
  appearance: Appearance
  dashboardLayout: DashboardLayout
  appearanceProfiles: AppearanceProfile[]
  miniPresentation: MiniPresentation
  trayPresentation: TrayPresentation
  dashboardPollingPaused: boolean
  dashboardDensity: DashboardDensity
  miniMonitorVisible: boolean
  miniMonitorAlwaysOnTop: boolean
  miniMonitorPosition: MiniMonitorPosition | null
  dashboardWidgets: DashboardWidgetVisibility
  dashboardWidgetOrder: DashboardWidget[]
  historyView: HistoryView
  historyMetrics: HistoryMetricVisibility
  historyRangeMinutes: number
  historyAlertMarkers: boolean
  processDensity: ProcessDensity
  processQuickFilter: ProcessQuickFilter
  systemView: SystemView
}

export const DEFAULT_UI_SETTINGS: UiSettings = {
  appearance: DEFAULT_APPEARANCE,
  dashboardLayout: DEFAULT_DASHBOARD_LAYOUT,
  appearanceProfiles: [],
  miniPresentation: DEFAULT_MINI_PRESENTATION,
  trayPresentation: DEFAULT_TRAY_PRESENTATION,
  dashboardPollingPaused: false,
  dashboardDensity: 'comfortable',
  miniMonitorVisible: false,
  miniMonitorAlwaysOnTop: true,
  miniMonitorPosition: null,
  dashboardWidgets: {
    cpu: true,
    memory: true,
    gpu: true,
    disk: true,
    network: true,
    battery: true,
    anomalies: true
  },
  dashboardWidgetOrder: ['cpu', 'memory', 'disk', 'gpu', 'network', 'battery', 'anomalies'],
  historyView: 'chart',
  historyMetrics: { cpu: true, memory: true, network: true, disk: true, gpu: true, battery: true },
  historyRangeMinutes: 60,
  historyAlertMarkers: true,
  processDensity: 'comfortable',
  processQuickFilter: 'all',
  systemView: 'advanced'
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
  collectionIntervalsMs: CollectionOverrides
  tempUnit: 'C' | 'F'
  dataRetentionDays: number
  anomalySensitivity: 'sensitive' | 'balanced' | 'conservative'
  anomalyNotifications: boolean
  monitoringAlerts: MonitoringAlerts
  ui: UiSettings
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  settingsVersion: 1,
  launchAtLogin: false,
  hideFromDock: false,
  pollIntervalMs: 2000,
  collectionIntervalsMs: {},
  tempUnit: 'C',
  dataRetentionDays: 7,
  anomalySensitivity: 'balanced',
  anomalyNotifications: true,
  monitoringAlerts: {
    cpu: { enabled: false, thresholdPercent: 90 },
    memory: { enabled: false, thresholdPercent: 90 },
    disk: { enabled: false, thresholdPercent: 90 },
    battery: { enabled: false, thresholdPercent: 20 },
    cooldownMinutes: 15
  },
  ui: DEFAULT_UI_SETTINGS
}

export type SettingsPersistenceIssue = 'unreadable' | 'invalid' | 'incompatible'

export interface UiSettingsSnapshot {
  revision: number
  ui: UiSettings
  tempUnit: AppSettings['tempUnit']
  persistenceIssue: SettingsPersistenceIssue | null
}

export interface SettingsReadResult {
  settings: AppSettings
  launchAtLoginActual: boolean | null
  persistenceIssue: SettingsPersistenceIssue | null
}

export interface SettingsSaveResult extends SettingsReadResult {
  success: boolean
  launchAtLoginError: boolean
  isPackaged: boolean
}
export type CollectionOverrides = Partial<Record<MetricGroup, number>>
