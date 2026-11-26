import { BrowserWindow, ipcMain, type WebContents } from 'electron'
import { assertTrustedIpcSender, getWindowRole, sendToTrustedWindow } from '../ipcSecurity'
import type { MetricsService } from '../services/MetricsService'
import type { LiveMetricsFrame, MetricsSnapshot } from '../../shared/contracts'
import { metricsView, projectLiveMetrics } from '../../shared/utils/liveMetrics'
import { loadSettings } from '../storage/settings'

function frameFor(contents: WebContents, snapshot: MetricsSnapshot): LiveMetricsFrame {
  const role = getWindowRole(contents)
  if (!role) throw new Error('Unregistered metrics window')
  return projectLiveMetrics(snapshot, metricsView(new URL(contents.getURL()).hash, role))
}

export function sendLiveMetrics(window: BrowserWindow, snapshot: MetricsSnapshot): void {
  if (window.isDestroyed() || window.isMinimized() || !window.isVisible()) return
  const contents = window.webContents
  if (contents.isDestroyed() || !contents.getURL() || !getWindowRole(contents)) return
  sendToTrustedWindow(window, 'metrics-updated', frameFor(contents, snapshot))
}

export function broadcastLiveMetrics(snapshot: MetricsSnapshot): void {
  for (const window of BrowserWindow.getAllWindows()) sendLiveMetrics(window, snapshot)
}

export function registerMetricsIpc(metricsService: MetricsService): void {
  ipcMain.handle('get-latest-metrics', async (event) => {
    assertTrustedIpcSender(event)
    const snapshot = loadSettings().ui.dashboardPollingPaused
      ? await metricsService.getPausedSnapshot()
      : metricsService.getLatestSnapshot()
    assertTrustedIpcSender(event)
    return frameFor(event.sender, snapshot)
  })
}
