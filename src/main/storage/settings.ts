import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync } from 'fs'

export type HistoryView = 'chart' | 'table'
export type HistoryMetric = 'cpu' | 'memory' | 'network' | 'disk' | 'gpu' | 'battery'
export type ProcessDensity = 'compact' | 'comfortable'
export type ProcessQuickFilter = 'all' | 'cpu' | 'memory'
export type SystemView = 'simple' | 'advanced'

export type HistoryMetricVisibility = Record<HistoryMetric, boolean>

export interface UiSettings {
  dashboardPollingPaused: boolean
  historyView: HistoryView
  historyMetrics: HistoryMetricVisibility
  historyRangeMinutes: number
  processDensity: ProcessDensity
  processQuickFilter: ProcessQuickFilter
  systemView: SystemView
}

export type UiSettingsPatch = Partial<Omit<UiSettings, 'historyMetrics'>> & {
  historyMetrics?: Partial<HistoryMetricVisibility>
}

export interface AppSettings {
  settingsVersion: number
  // System
  launchAtLogin: boolean
  hideFromDock: boolean
  // Monitoring
  pollIntervalMs: number
  tempUnit: 'C' | 'F'
  // Data
  dataRetentionDays: number
  // Anomaly detection
  anomalySensitivity: 'sensitive' | 'balanced' | 'conservative'
  anomalyNotifications: boolean
  // Interface preferences
  ui: UiSettings
}

export const SENSITIVITY_THRESHOLD: Record<AppSettings['anomalySensitivity'], number> = {
  sensitive: 2.0,
  balanced: 2.5,
  conservative: 3.0
}

const DEFAULT_UI_SETTINGS: UiSettings = {
  dashboardPollingPaused: false,
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

const DEFAULTS: AppSettings = {
  settingsVersion: 1,
  launchAtLogin: false,
  hideFromDock: false,
  pollIntervalMs: 2000,
  tempUnit: 'C',
  dataRetentionDays: 7,
  anomalySensitivity: 'balanced',
  anomalyNotifications: true,
  ui: DEFAULT_UI_SETTINGS
}

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

export function saveSettings(settings: AppSettings): boolean {
  return writeSettings(settings, true)
}

export function updateUiSettings(patch: UiSettingsPatch): boolean {
  const settings = loadSettings()
  return writeSettings(
    {
      ...settings,
      ui: {
        ...settings.ui,
        ...patch,
        historyMetrics: {
          ...settings.ui.historyMetrics,
          ...patch.historyMetrics
        }
      }
    },
    false
  )
}

function writeSettings(settings: AppSettings, applyLoginItem: boolean): boolean {
  try {
    const normalized = normalizeSettings(settings)

    if (applyLoginItem) {
      app.setLoginItemSettings({
        openAtLogin: normalized.launchAtLogin,
        openAsHidden: true // start minimised to tray, not foregrounded
      })
    }

    writeFileSync(settingsPath(), JSON.stringify(normalized, null, 2), 'utf8')
    return true
  } catch (err) {
    console.error('Failed to save settings:', err)
    return false
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isOneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
  return typeof value === 'string' && options.includes(value as T)
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function normalizeSettings(value: unknown): AppSettings {
  const raw = isRecord(value) ? value : {}
  const rawUi = isRecord(raw.ui) ? raw.ui : {}
  const rawMetrics = isRecord(rawUi.historyMetrics) ? rawUi.historyMetrics : {}
  const historyRangeMinutes = numberOr(
    rawUi.historyRangeMinutes,
    DEFAULT_UI_SETTINGS.historyRangeMinutes
  )

  return {
    settingsVersion: DEFAULTS.settingsVersion,
    launchAtLogin: booleanOr(raw.launchAtLogin, DEFAULTS.launchAtLogin),
    hideFromDock: booleanOr(raw.hideFromDock, DEFAULTS.hideFromDock),
    pollIntervalMs: [1000, 2000, 5000, 10000].includes(numberOr(raw.pollIntervalMs, -1))
      ? numberOr(raw.pollIntervalMs, DEFAULTS.pollIntervalMs)
      : DEFAULTS.pollIntervalMs,
    tempUnit: isOneOf(raw.tempUnit, ['C', 'F']) ? raw.tempUnit : DEFAULTS.tempUnit,
    dataRetentionDays: [1, 3, 7, 14, 30].includes(numberOr(raw.dataRetentionDays, -1))
      ? numberOr(raw.dataRetentionDays, DEFAULTS.dataRetentionDays)
      : DEFAULTS.dataRetentionDays,
    anomalySensitivity: isOneOf(raw.anomalySensitivity, ['sensitive', 'balanced', 'conservative'])
      ? raw.anomalySensitivity
      : DEFAULTS.anomalySensitivity,
    anomalyNotifications: booleanOr(raw.anomalyNotifications, DEFAULTS.anomalyNotifications),
    ui: {
      dashboardPollingPaused: booleanOr(
        rawUi.dashboardPollingPaused,
        DEFAULT_UI_SETTINGS.dashboardPollingPaused
      ),
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
      historyRangeMinutes: [30, 60, 180, 360, 1440].includes(historyRangeMinutes)
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
