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
    return loadSettings()
  })

  ipcMain.handle('save-settings', async (event, newSettings: unknown) => {
    assertTrustedIpcSender(event)
    if (!isValidAppSettings(newSettings)) return false

    const settings = {
      ...newSettings,
      ui: loadSettings().ui
    }
    const saved = saveSettings(settings)
    if (!saved) return false

    setThreshold(SENSITIVITY_THRESHOLD[settings.anomalySensitivity])

    if (process.platform === 'darwin') {
      settings.hideFromDock ? app.dock?.hide() : app.dock?.show()
    }

    await metricsService.restart()
    return true
  })

  ipcMain.handle('save-ui-settings', (event, patch: unknown) => {
    assertTrustedIpcSender(event)
    return isValidUiSettingsPatch(patch) ? saveUiSettingsPatch(patch) : false
  })
}
