import { BrowserWindow, ipcMain } from 'electron'
import { assertTrustedIpcSender } from '../ipcSecurity'
import {
  clearAlertHistory,
  getAlertHistory,
  markAllAlertHistoryRead
} from '../storage/alertHistory'
import type { AlertHistoryEntry } from '../../shared/contracts'

export function broadcastAlertHistory(alerts: AlertHistoryEntry[]): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send('alert-history-updated', alerts)
  }
}

export function registerAlertIpc(): void {
  ipcMain.handle('get-alert-history', (event) => {
    assertTrustedIpcSender(event)
    return getAlertHistory()
  })

  ipcMain.handle('mark-all-alerts-read', (event) => {
    assertTrustedIpcSender(event)
    const alerts = markAllAlertHistoryRead()
    broadcastAlertHistory(alerts)
    return alerts
  })

  ipcMain.handle('clear-alert-history', (event) => {
    assertTrustedIpcSender(event)
    const alerts = clearAlertHistory()
    broadcastAlertHistory(alerts)
    return alerts
  })
}
