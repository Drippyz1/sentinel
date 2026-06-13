import { ipcMain } from 'electron'
import { assertTrustedIpcSender } from '../ipcSecurity'
import { MetricsService } from '../services/MetricsService'

export function registerMetricsIpc(metricsService: MetricsService): void {
  ipcMain.handle('get-latest-metrics', async (event) => {
    assertTrustedIpcSender(event)
    return metricsService.getLatestSnapshot()
  })
  ipcMain.handle('get-cpu-metrics', async (event) => {
    assertTrustedIpcSender(event)
    return (await metricsService.getLatestSnapshot()).cpu
  })
  ipcMain.handle('get-memory-metrics', async (event) => {
    assertTrustedIpcSender(event)
    return (await metricsService.getLatestSnapshot()).memory
  })
  ipcMain.handle('get-disk-metrics', async (event) => {
    assertTrustedIpcSender(event)
    return (await metricsService.getLatestSnapshot()).disk
  })
  ipcMain.handle('get-network-metrics', async (event) => {
    assertTrustedIpcSender(event)
    return (await metricsService.getLatestSnapshot()).network
  })
  ipcMain.handle('get-gpu-metrics', async (event) => {
    assertTrustedIpcSender(event)
    return (await metricsService.getLatestSnapshot()).gpu
  })
  ipcMain.handle('get-battery-metrics', async (event) => {
    assertTrustedIpcSender(event)
    return (await metricsService.getLatestSnapshot()).battery
  })
  ipcMain.handle('get-anomaly-report', (event) => {
    assertTrustedIpcSender(event)
    return metricsService.getLatestSnapshot().then((snapshot) => snapshot.anomalyReport)
  })
}
