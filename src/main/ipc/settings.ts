import { app, ipcMain } from 'electron'
import { setThreshold } from '../analysis/anomalyDetector'
import { assertTrustedIpcSender } from '../ipcSecurity'
import { MetricsService } from '../services/MetricsService'
import {
  isValidAppSettings,
  isValidUiSettingsPatch,
  loadSettings,
  saveSettings,
  SENSITIVITY_THRESHOLD
} from '../storage/settings'
import type { UiSettingsPatch } from '../../shared/contracts'

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

  ipcMain.handle('save-settings', async (event, newSettings: unknown) => {
    assertTrustedIpcSender(event)
    if (!isValidAppSettings(newSettings)) {
      return {
        success: false,
        settings: loadSettings(),
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

    await metricsService.restart()
    return result
  })

  ipcMain.handle('save-ui-settings', (event, patch: unknown) => {
    assertTrustedIpcSender(event)
    return isValidUiSettingsPatch(patch) ? saveUiSettingsPatch(patch) : false
  })
}
