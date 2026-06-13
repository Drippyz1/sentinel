import { app } from 'electron'
import { join } from 'path'
import { readFileSync, renameSync, writeFileSync } from 'fs'
import type { AppSettings, UiSettings, UiSettingsPatch } from '../../shared/contracts'

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

const POLL_INTERVALS = [1000, 2000, 5000, 10000] as const
const RETENTION_DAYS = [1, 3, 7, 14, 30] as const
const HISTORY_RANGES = [30, 60, 180, 360, 1440] as const

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

export function isValidAppSettings(value: unknown): value is AppSettings {
  if (!isRecord(value)) return false
  const ui = value.ui
  if (!isRecord(ui)) return false
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
    typeof ui.dashboardPollingPaused === 'boolean' &&
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

function writeSettings(settings: AppSettings, applyLoginItem: boolean): boolean {
  try {
    const normalized = normalizeSettings(settings)
    const destination = settingsPath()
    const temporary = `${destination}.tmp`

    if (applyLoginItem) {
      app.setLoginItemSettings({
        openAtLogin: normalized.launchAtLogin,
        openAsHidden: true // start minimised to tray, not foregrounded
      })
    }

    writeFileSync(temporary, JSON.stringify(normalized, null, 2), 'utf8')
    renameSync(temporary, destination)
    return true
  } catch (err) {
    console.error('Failed to save settings:', err)
    return false
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
