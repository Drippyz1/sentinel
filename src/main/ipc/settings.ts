import { app, ipcMain } from 'electron'
import { setThreshold } from '../analysis/anomalyDetector'
import { assertTrustedIpcSender, broadcastToTrustedWindows } from '../ipcSecurity'
import { MetricsService } from '../services/MetricsService'
import {
  getLaunchAtLoginState,
  isValidAppSettings,
  isValidUiSettingsPatch,
  loadSettings,
  saveSettings,
  SENSITIVITY_THRESHOLD
} from '../storage/settings'
import type { UiSettingsPatch } from '../../shared/contracts'
import { resolveCollectionIntervals } from '../../shared/utils/collectionPolicy'

interface SettingsIpcOptions {
  metricsService: MetricsService
  saveUiSettingsPatch: (patch: UiSettingsPatch) => boolean
}

export function registerSettingsIpc({
  metricsService,
  saveUiSettingsPatch
}: SettingsIpcOptions): void {
  ipcMain.handle('get-settings', (event) => {
    assertTrustedIpcSender(event)
    return {
      ...loadSettings(),
      launchAtLogin: getLaunchAtLoginState()
    }
  })

  ipcMain.handle('save-settings', (event, newSettings: unknown) => {
    assertTrustedIpcSender(event, 'main')
    if (!isValidAppSettings(newSettings)) {
      const currentSettings = loadSettings()
      return {
        success: false,
        settings: {
          ...currentSettings,
          launchAtLogin: getLaunchAtLoginState()
        },
        launchAtLoginError: false,
        isPackaged: app.isPackaged
      }
    }

    const settings = {
      ...newSettings,
      ui: loadSettings().ui
    }
    const result = saveSettings(settings)
    if (!result.success) return result

    setThreshold(SENSITIVITY_THRESHOLD[result.settings.anomalySensitivity])

    if (process.platform === 'darwin') {
      result.settings.hideFromDock ? app.dock?.hide() : app.dock?.show()
    }

    const { collectionIntervalsMs, pollIntervalMs, tempUnit } = result.settings
    metricsService.setPolicy(
      Math.min(pollIntervalMs, ...Object.values(collectionIntervalsMs)),
      resolveCollectionIntervals(pollIntervalMs, collectionIntervalsMs)
    )
    broadcastToTrustedWindows('temp-unit-changed', tempUnit)
    return result
  })

  ipcMain.handle('save-ui-settings', (event, patch: unknown) => {
    assertTrustedIpcSender(event)
    return isValidUiSettingsPatch(patch) ? saveUiSettingsPatch(patch) : false
  })
}
