import { app, BrowserWindow } from 'electron'
import { setThreshold } from '../analysis/anomalyDetector'
import { getWindowRole, handleTrustedIpc, sendToTrustedWindow } from '../ipcSecurity'
import { MetricsService } from '../services/MetricsService'
import {
  getUiSettingsSnapshot,
  isValidAppSettings,
  isValidUiSettingsPatch,
  loadSettings,
  readSettings,
  saveSettings,
  SENSITIVITY_THRESHOLD
} from '../storage/settings'
import {
  DEFAULT_UI_SETTINGS,
  type UiSettingsPatch,
  type UiSettingsSnapshot
} from '../../shared/contracts'
import { allowsUiSettingsPatch, type WindowRole } from '../../shared/contracts/ipcPolicy'
import { resolveCollectionIntervals } from '../../shared/utils/collectionPolicy'
import { registerAppearanceProfiles } from './appearanceProfiles'

interface SettingsIpcOptions {
  metricsService: MetricsService
  saveUiSettingsPatch: (patch: UiSettingsPatch) => boolean
}

function snapshotFor(role: WindowRole, snapshot: UiSettingsSnapshot): UiSettingsSnapshot {
  if (role === 'main') return snapshot
  return {
    ...snapshot,
    ui: {
      ...DEFAULT_UI_SETTINGS,
      appearance: {
        ...DEFAULT_UI_SETTINGS.appearance,
        theme: snapshot.ui.appearance.theme,
        accent: snapshot.ui.appearance.accent,
        density: snapshot.ui.appearance.density,
        textSize: snapshot.ui.appearance.textSize,
        chart: snapshot.ui.appearance.chart
      },
      ...(role === 'mini'
        ? { miniPresentation: snapshot.ui.miniPresentation }
        : { trayPresentation: snapshot.ui.trayPresentation }),
      dashboardPollingPaused: snapshot.ui.dashboardPollingPaused,
      ...(role === 'mini' && { miniMonitorAlwaysOnTop: snapshot.ui.miniMonitorAlwaysOnTop })
    }
  }
}

export function publishUiSettings(snapshot: UiSettingsSnapshot): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue
    const role = getWindowRole(window.webContents)
    if (role) sendToTrustedWindow(window, 'ui-settings-changed', snapshotFor(role, snapshot))
  }
}

export function registerSettingsIpc({
  metricsService,
  saveUiSettingsPatch
}: SettingsIpcOptions): void {
  registerAppearanceProfiles()
  handleTrustedIpc('get-settings', () => readSettings())
  handleTrustedIpc('get-ui-settings', (_event, role) => snapshotFor(role, getUiSettingsSnapshot()))

  handleTrustedIpc('save-settings', (_event, _role, newSettings, applyLogin) => {
    if (!isValidAppSettings(newSettings) || typeof applyLogin !== 'boolean') {
      return {
        success: false,
        ...readSettings(),
        launchAtLoginError: false,
        isPackaged: app.isPackaged
      }
    }

    const previous = loadSettings()
    const result = saveSettings(newSettings, applyLogin)
    if (!result.success) return result

    if (previous.anomalySensitivity !== result.settings.anomalySensitivity) {
      setThreshold(SENSITIVITY_THRESHOLD[result.settings.anomalySensitivity])
    }

    if (process.platform === 'darwin' && previous.hideFromDock !== result.settings.hideFromDock) {
      result.settings.hideFromDock ? app.dock?.hide() : app.dock?.show()
    }

    const { collectionIntervalsMs, pollIntervalMs, tempUnit } = result.settings
    if (
      previous.pollIntervalMs !== pollIntervalMs ||
      JSON.stringify(previous.collectionIntervalsMs) !== JSON.stringify(collectionIntervalsMs)
    ) {
      metricsService.setPolicy(
        Math.min(pollIntervalMs, ...Object.values(collectionIntervalsMs)),
        resolveCollectionIntervals(pollIntervalMs, collectionIntervalsMs)
      )
    }
    if (tempUnit !== previous.tempUnit) publishUiSettings(getUiSettingsSnapshot())
    return result
  })

  handleTrustedIpc('save-ui-settings', (_event, role, patch) => {
    return isValidUiSettingsPatch(patch) && allowsUiSettingsPatch(role, patch)
      ? saveUiSettingsPatch(patch)
      : false
  })
}
