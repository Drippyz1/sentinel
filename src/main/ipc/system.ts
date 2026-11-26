import { ipcMain } from 'electron'
import { getSystemInfo } from '../collectors/systemInfo'
import { getThermalMetrics } from '../collectors/thermal'
import { getStartupMetrics } from '../collectors/startup'
import { assertTrustedIpcSender } from '../ipcSecurity'
import { createDiagnosticBundle } from '../reports/diagnosticBundle'
import { createSystemReportExport } from '../reports/systemReport'
import { MetricsService } from '../services/MetricsService'
import type { SystemReportFormat } from '../../shared/contracts'

export function registerSystemIpc(metricsService: MetricsService): void {
  ipcMain.handle('get-system-info', async (event) => {
    assertTrustedIpcSender(event)
    return getSystemInfo()
  })
  ipcMain.handle('get-thermal-metrics', async (event) => {
    assertTrustedIpcSender(event)
    return getThermalMetrics()
  })
  ipcMain.handle('get-startup-metrics', async (event) => {
    assertTrustedIpcSender(event, 'main')
    return getStartupMetrics()
  })
  ipcMain.handle('export-system-report', async (event, format: unknown) => {
    assertTrustedIpcSender(event, 'main')
    if (!isSystemReportFormat(format)) throw new Error('Invalid report format')
    return createSystemReportExport(metricsService, format)
  })
  ipcMain.handle('export-diagnostic-bundle', async (event) => {
    assertTrustedIpcSender(event, 'main')
    return createDiagnosticBundle(metricsService)
  })
}

function isSystemReportFormat(value: unknown): value is SystemReportFormat {
  return value === 'json' || value === 'txt'
}
