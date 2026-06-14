import { BrowserWindow, ipcMain } from 'electron'
import { assertTrustedIpcSender } from '../ipcSecurity'
import {
  clearAlertHistory,
  getAlertHistory,
  getAlertMarkers,
  markAllAlertHistoryRead
} from '../storage/alertHistory'
import type { AlertHistoryEntry } from '../../shared/contracts'
import { isValidHistoryRange } from '../ipcSecurity'

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

  ipcMain.handle('get-alert-markers', (event, minutes: unknown) => {
    assertTrustedIpcSender(event)
    if (!isValidHistoryRange(minutes)) throw new Error('Invalid history range')
    return getAlertMarkers(minutes)
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
