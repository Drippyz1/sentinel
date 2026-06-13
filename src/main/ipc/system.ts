import { ipcMain } from 'electron'
import { getSystemInfo } from '../collectors/systemInfo'
import { getThermalMetrics } from '../collectors/thermal'
import {
  disableStartupItem,
  enableStartupItem,
  getStartupMetrics,
  isValidStartupPathInput
} from '../collectors/startup'
import { assertTrustedIpcSender } from '../ipcSecurity'

export function registerSystemIpc(): void {
  ipcMain.handle('get-system-info', async (event) => {
    assertTrustedIpcSender(event)
    return getSystemInfo()
  })
  ipcMain.handle('get-thermal-metrics', async (event) => {
    assertTrustedIpcSender(event)
    return getThermalMetrics()
  })
  ipcMain.handle('get-startup-metrics', async (event) => {
    assertTrustedIpcSender(event)
    return getStartupMetrics()
  })
  ipcMain.handle('toggle-startup-item', async (event, itemPath: unknown, enable: unknown) => {
    assertTrustedIpcSender(event)
    if (!isValidStartupPathInput(itemPath) || typeof enable !== 'boolean') return false
    return enable ? enableStartupItem(itemPath) : disableStartupItem(itemPath)
  })
}
