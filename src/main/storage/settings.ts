import { app } from 'electron'
import { join } from 'path'
import { readFileSync, renameSync, writeFileSync } from 'fs'
import type {
  AppSettings,
  MonitoringAlerts,
  SettingsSaveResult,
  UiSettings,
  UiSettingsPatch
} from '../../shared/contracts'

export const SENSITIVITY_THRESHOLD: Record<AppSettings['anomalySensitivity'], number> = {
  sensitive: 2.0,
  balanced: 2.5,
  conservative: 3.0
}

const DEFAULT_UI_SETTINGS: UiSettings = {
  dashboardPollingPaused: false,
  dashboardWidgets: {
    cpu: true,
    memory: true,
    gpu: true,
    disk: true,
    network: true,
    battery: true,
    anomalies: true
  },
  historyView: 'chart',
  historyMetrics: {
    cpu: true,
    memory: true,
    network: true,
    disk: true,
    gpu: true,
    battery: true
  },
  historyRangeMinutes: 60,
  processDensity: 'comfortable',
  processQuickFilter: 'all',
  systemView: 'advanced'
}

const DEFAULT_MONITORING_ALERTS: MonitoringAlerts = {
  cpu: { enabled: false, thresholdPercent: 90 },
  memory: { enabled: false, thresholdPercent: 90 },
  disk: { enabled: false, thresholdPercent: 90 },
  battery: { enabled: false, thresholdPercent: 20 },
  cooldownMinutes: 15
}

const DEFAULTS: AppSettings = {
  settingsVersion: 1,
  launchAtLogin: false,
  hideFromDock: false,
  pollIntervalMs: 2000,
  tempUnit: 'C',
  dataRetentionDays: 7,
  anomalySensitivity: 'balanced',
  anomalyNotifications: true,
  monitoringAlerts: DEFAULT_MONITORING_ALERTS,
  ui: DEFAULT_UI_SETTINGS
}

const POLL_INTERVALS = [1000, 2000, 5000, 10000] as const
const RETENTION_DAYS = [1, 3, 7, 14, 30] as const
const HISTORY_RANGES = [30, 60, 180, 360, 1440] as const
const ALERT_COOLDOWNS = [5, 10, 15, 30, 60] as const

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export function loadSettings(): AppSettings {
  try {
    const raw = readFileSync(settingsPath(), 'utf8')
    return normalizeSettings(JSON.parse(raw))
  } catch {
    return normalizeSettings({})
  }
}

export function saveSettings(settings: AppSettings): SettingsSaveResult {
  const normalized = normalizeSettings(settings)
  const loginItemResult = applyLaunchAtLogin(normalized.launchAtLogin)
  const reconciled = {
    ...normalized,
    launchAtLogin: loginItemResult.actualState
  }

  return {
    success: writeSettings(reconciled),
    settings: reconciled,
    launchAtLoginError: loginItemResult.denied,
    isPackaged: app.isPackaged
  }
}

export function updateUiSettings(patch: UiSettingsPatch): boolean {
  const settings = loadSettings()
  return writeSettings(
    {
      ...settings,
      ui: {
        ...settings.ui,
        ...patch,
        dashboardWidgets: {
          ...settings.ui.dashboardWidgets,
          ...patch.dashboardWidgets
        },
        historyMetrics: {
          ...settings.ui.historyMetrics,
          ...patch.historyMetrics
        }
      }
    },
  )
}

export function isValidAppSettings(value: unknown): value is AppSettings {
  if (!isRecord(value)) return false
  const monitoringAlerts = value.monitoringAlerts
  if (!isRecord(monitoringAlerts)) return false
  const ui = value.ui
  if (!isRecord(ui)) return false
  const dashboardWidgets = ui.dashboardWidgets
  if (!isRecord(dashboardWidgets)) return false
  const metrics = ui.historyMetrics
  if (!isRecord(metrics)) return false

  return (
    value.settingsVersion === DEFAULTS.settingsVersion &&
    typeof value.launchAtLogin === 'boolean' &&
    typeof value.hideFromDock === 'boolean' &&
    isOneOf(value.pollIntervalMs, POLL_INTERVALS) &&
    isOneOf(value.tempUnit, ['C', 'F']) &&
    isOneOf(value.dataRetentionDays, RETENTION_DAYS) &&
    isOneOf(value.anomalySensitivity, ['sensitive', 'balanced', 'conservative']) &&
    typeof value.anomalyNotifications === 'boolean' &&
    isValidMonitoringAlertRule(monitoringAlerts.cpu, 50, 100) &&
    isValidMonitoringAlertRule(monitoringAlerts.memory, 50, 100) &&
    isValidMonitoringAlertRule(monitoringAlerts.disk, 50, 100) &&
    isValidMonitoringAlertRule(monitoringAlerts.battery, 1, 50) &&
    isOneOf(monitoringAlerts.cooldownMinutes, ALERT_COOLDOWNS) &&
    typeof ui.dashboardPollingPaused === 'boolean' &&
    typeof dashboardWidgets.cpu === 'boolean' &&
    typeof dashboardWidgets.memory === 'boolean' &&
    typeof dashboardWidgets.gpu === 'boolean' &&
    typeof dashboardWidgets.disk === 'boolean' &&
    typeof dashboardWidgets.network === 'boolean' &&
    typeof dashboardWidgets.battery === 'boolean' &&
    typeof dashboardWidgets.anomalies === 'boolean' &&
    isOneOf(ui.historyView, ['chart', 'table']) &&
    isOneOf(ui.historyRangeMinutes, HISTORY_RANGES) &&
    isOneOf(ui.processDensity, ['compact', 'comfortable']) &&
    isOneOf(ui.processQuickFilter, ['all', 'cpu', 'memory']) &&
    isOneOf(ui.systemView, ['simple', 'advanced']) &&
    typeof metrics.cpu === 'boolean' &&
    typeof metrics.memory === 'boolean' &&
    typeof metrics.network === 'boolean' &&
    typeof metrics.disk === 'boolean' &&
    typeof metrics.gpu === 'boolean' &&
    typeof metrics.battery === 'boolean'
  )
}

export function isValidUiSettingsPatch(value: unknown): value is UiSettingsPatch {
  if (!isRecord(value)) return false

  const validKeys = new Set([
    'dashboardPollingPaused',
    'dashboardWidgets',
    'historyView',
    'historyMetrics',
    'historyRangeMinutes',
    'processDensity',
    'processQuickFilter',
    'systemView'
  ])
  if (Object.keys(value).some((key) => !validKeys.has(key))) return false

  if (
    value.dashboardPollingPaused !== undefined &&
    typeof value.dashboardPollingPaused !== 'boolean'
  ) {
    return false
  }
  if (value.dashboardWidgets !== undefined) {
    if (!isRecord(value.dashboardWidgets)) return false
    const widgetKeys = new Set(['cpu', 'memory', 'gpu', 'disk', 'network', 'battery', 'anomalies'])
    if (Object.keys(value.dashboardWidgets).some((key) => !widgetKeys.has(key))) return false
    if (Object.values(value.dashboardWidgets).some((widget) => typeof widget !== 'boolean')) {
      return false
    }
  }
  if (value.historyView !== undefined && !isOneOf(value.historyView, ['chart', 'table'])) {
    return false
  }
  if (
    value.historyRangeMinutes !== undefined &&
    !isOneOf(value.historyRangeMinutes, HISTORY_RANGES)
  ) {
    return false
  }
  if (
    value.processDensity !== undefined &&
    !isOneOf(value.processDensity, ['compact', 'comfortable'])
  ) {
    return false
  }
  if (
    value.processQuickFilter !== undefined &&
    !isOneOf(value.processQuickFilter, ['all', 'cpu', 'memory'])
  ) {
    return false
  }
  if (value.systemView !== undefined && !isOneOf(value.systemView, ['simple', 'advanced'])) {
    return false
  }

  if (value.historyMetrics !== undefined) {
    if (!isRecord(value.historyMetrics)) return false
    const metricKeys = new Set(['cpu', 'memory', 'network', 'disk', 'gpu', 'battery'])
    if (Object.keys(value.historyMetrics).some((key) => !metricKeys.has(key))) return false
    if (Object.values(value.historyMetrics).some((metric) => typeof metric !== 'boolean')) {
      return false
    }
  }

  return true
}

function writeSettings(settings: AppSettings): boolean {
  try {
    const normalized = normalizeSettings(settings)
    const destination = settingsPath()
    const temporary = `${destination}.tmp`

    writeFileSync(temporary, JSON.stringify(normalized, null, 2), 'utf8')
    renameSync(temporary, destination)
    return true
  } catch (err) {
    console.error('Failed to save settings:', err)
    return false
  }
}

function applyLaunchAtLogin(requestedState: boolean): {
  actualState: boolean
  denied: boolean
} {
  const currentState = getLaunchAtLoginState()
  if (currentState === requestedState) {
    return { actualState: currentState, denied: false }
  }

  try {
    app.setLoginItemSettings({
      openAtLogin: requestedState,
      openAsHidden: true
    })
  } catch {
    return { actualState: getLaunchAtLoginState(), denied: true }
  }

  const actualState = getLaunchAtLoginState()
  return {
    actualState,
    denied: actualState !== requestedState
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isOneOf<T extends string | number>(value: unknown, options: readonly T[]): value is T {
  return (typeof value === 'string' || typeof value === 'number') && options.includes(value as T)
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function isValidMonitoringAlertRule(value: unknown, minimum: number, maximum: number): boolean {
  if (!isRecord(value)) return false
  return (
    Object.keys(value).every((key) => key === 'enabled' || key === 'thresholdPercent') &&
    typeof value.enabled === 'boolean' &&
    typeof value.thresholdPercent === 'number' &&
    Number.isInteger(value.thresholdPercent) &&
    value.thresholdPercent >= minimum &&
    value.thresholdPercent <= maximum
  )
}

function normalizeMonitoringAlertRule(
  value: unknown,
  fallback: MonitoringAlerts['cpu'],
  minimum: number,
  maximum: number
): MonitoringAlerts['cpu'] {
  const raw = isRecord(value) ? value : {}
  const threshold = numberOr(raw.thresholdPercent, fallback.thresholdPercent)

  return {
    enabled: booleanOr(raw.enabled, fallback.enabled),
    thresholdPercent:
      Number.isInteger(threshold) && threshold >= minimum && threshold <= maximum
        ? threshold
        : fallback.thresholdPercent
  }
}

function normalizeSettings(value: unknown): AppSettings {
  const raw = isRecord(value) ? value : {}
  const rawMonitoringAlerts = isRecord(raw.monitoringAlerts) ? raw.monitoringAlerts : {}
  const rawUi = isRecord(raw.ui) ? raw.ui : {}
  const rawDashboardWidgets = isRecord(rawUi.dashboardWidgets) ? rawUi.dashboardWidgets : {}
  const rawMetrics = isRecord(rawUi.historyMetrics) ? rawUi.historyMetrics : {}
  const historyRangeMinutes = numberOr(
    rawUi.historyRangeMinutes,
    DEFAULT_UI_SETTINGS.historyRangeMinutes
  )

  return {
    settingsVersion: DEFAULTS.settingsVersion,
    launchAtLogin: booleanOr(raw.launchAtLogin, DEFAULTS.launchAtLogin),
    hideFromDock: booleanOr(raw.hideFromDock, DEFAULTS.hideFromDock),
    pollIntervalMs: POLL_INTERVALS.some((interval) => interval === numberOr(raw.pollIntervalMs, -1))
      ? numberOr(raw.pollIntervalMs, DEFAULTS.pollIntervalMs)
      : DEFAULTS.pollIntervalMs,
    tempUnit: isOneOf(raw.tempUnit, ['C', 'F']) ? raw.tempUnit : DEFAULTS.tempUnit,
    dataRetentionDays: RETENTION_DAYS.some((days) => days === numberOr(raw.dataRetentionDays, -1))
      ? numberOr(raw.dataRetentionDays, DEFAULTS.dataRetentionDays)
      : DEFAULTS.dataRetentionDays,
    anomalySensitivity: isOneOf(raw.anomalySensitivity, ['sensitive', 'balanced', 'conservative'])
      ? raw.anomalySensitivity
      : DEFAULTS.anomalySensitivity,
    anomalyNotifications: booleanOr(raw.anomalyNotifications, DEFAULTS.anomalyNotifications),
    monitoringAlerts: {
      cpu: normalizeMonitoringAlertRule(
        rawMonitoringAlerts.cpu,
        DEFAULT_MONITORING_ALERTS.cpu,
        50,
        100
      ),
      memory: normalizeMonitoringAlertRule(
        rawMonitoringAlerts.memory,
        DEFAULT_MONITORING_ALERTS.memory,
        50,
        100
      ),
      disk: normalizeMonitoringAlertRule(
        rawMonitoringAlerts.disk,
        DEFAULT_MONITORING_ALERTS.disk,
        50,
        100
      ),
      battery: normalizeMonitoringAlertRule(
        rawMonitoringAlerts.battery,
        DEFAULT_MONITORING_ALERTS.battery,
        1,
        50
      ),
      cooldownMinutes: isOneOf(rawMonitoringAlerts.cooldownMinutes, ALERT_COOLDOWNS)
        ? rawMonitoringAlerts.cooldownMinutes
        : DEFAULT_MONITORING_ALERTS.cooldownMinutes
    },
    ui: {
      dashboardPollingPaused: booleanOr(
        rawUi.dashboardPollingPaused,
        DEFAULT_UI_SETTINGS.dashboardPollingPaused
      ),
      dashboardWidgets: {
        cpu: booleanOr(rawDashboardWidgets.cpu, DEFAULT_UI_SETTINGS.dashboardWidgets.cpu),
        memory: booleanOr(rawDashboardWidgets.memory, DEFAULT_UI_SETTINGS.dashboardWidgets.memory),
        gpu: booleanOr(rawDashboardWidgets.gpu, DEFAULT_UI_SETTINGS.dashboardWidgets.gpu),
        disk: booleanOr(rawDashboardWidgets.disk, DEFAULT_UI_SETTINGS.dashboardWidgets.disk),
        network: booleanOr(
          rawDashboardWidgets.network,
          DEFAULT_UI_SETTINGS.dashboardWidgets.network
        ),
        battery: booleanOr(
          rawDashboardWidgets.battery,
          DEFAULT_UI_SETTINGS.dashboardWidgets.battery
        ),
        anomalies: booleanOr(
          rawDashboardWidgets.anomalies,
          DEFAULT_UI_SETTINGS.dashboardWidgets.anomalies
        )
      },
      historyView: isOneOf(rawUi.historyView, ['chart', 'table'])
        ? rawUi.historyView
        : DEFAULT_UI_SETTINGS.historyView,
      historyMetrics: {
        cpu: booleanOr(rawMetrics.cpu, DEFAULT_UI_SETTINGS.historyMetrics.cpu),
        memory: booleanOr(rawMetrics.memory, DEFAULT_UI_SETTINGS.historyMetrics.memory),
        network: booleanOr(rawMetrics.network, DEFAULT_UI_SETTINGS.historyMetrics.network),
        disk: booleanOr(rawMetrics.disk, DEFAULT_UI_SETTINGS.historyMetrics.disk),
        gpu: booleanOr(rawMetrics.gpu, DEFAULT_UI_SETTINGS.historyMetrics.gpu),
        battery: booleanOr(rawMetrics.battery, DEFAULT_UI_SETTINGS.historyMetrics.battery)
      },
      historyRangeMinutes: HISTORY_RANGES.some((minutes) => minutes === historyRangeMinutes)
        ? historyRangeMinutes
        : DEFAULT_UI_SETTINGS.historyRangeMinutes,
      processDensity: isOneOf(rawUi.processDensity, ['compact', 'comfortable'])
        ? rawUi.processDensity
        : DEFAULT_UI_SETTINGS.processDensity,
      processQuickFilter: isOneOf(rawUi.processQuickFilter, ['all', 'cpu', 'memory'])
        ? rawUi.processQuickFilter
        : DEFAULT_UI_SETTINGS.processQuickFilter,
      systemView: isOneOf(rawUi.systemView, ['simple', 'advanced'])
        ? rawUi.systemView
        : DEFAULT_UI_SETTINGS.systemView
    }
  }
}

// Read the actual OS login item state so the toggle
// reflects reality on first launch, not just our saved value
export function getLaunchAtLoginState(): boolean {
  try {
    return app.getLoginItemSettings().openAtLogin
  } catch {
    return false
  }
}
