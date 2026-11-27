import { handleTrustedIpc, broadcastToTrustedWindows, isValidHistoryRange } from '../ipcSecurity'
import {
  clearAlertHistory,
  getAlertAnalytics,
  getAlertHistory,
  getAlertMarkers,
  markAllAlertHistoryRead
} from '../storage/alertHistory'
import type { AlertAnalytics, AlertHistoryEntry, TrayAlertSummary } from '../../shared/contracts'

function traySummary(alerts: AlertHistoryEntry[]): TrayAlertSummary {
  return {
    unreadCount: alerts.filter((alert) => !alert.read).length,
    latestTitle: alerts[0]?.title ?? null
  }
}

export function broadcastAlertHistory(alerts: AlertHistoryEntry[]): void {
  const analytics: AlertAnalytics = getAlertAnalytics()
  broadcastToTrustedWindows('alert-history-updated', alerts)
  broadcastToTrustedWindows('alert-analytics-updated', analytics)
  broadcastToTrustedWindows('tray-alert-summary-updated', traySummary(alerts))
}

export function registerAlertIpc(): void {
  handleTrustedIpc('get-tray-alert-summary', () => traySummary(getAlertHistory()))
  handleTrustedIpc('get-alert-history', () => {
    return getAlertHistory()
  })

  handleTrustedIpc('get-alert-analytics', () => {
    return getAlertAnalytics()
  })

  handleTrustedIpc('get-alert-markers', (_event, _role, minutes: unknown) => {
    if (!isValidHistoryRange(minutes)) throw new Error('Invalid history range')
    return getAlertMarkers(minutes)
  })

  handleTrustedIpc('mark-all-alerts-read', () => {
    const alerts = markAllAlertHistoryRead()
    broadcastAlertHistory(alerts)
    return alerts
  })

  handleTrustedIpc('clear-alert-history', () => {
    const alerts = clearAlertHistory()
    broadcastAlertHistory(alerts)
    return alerts
  })
}
