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
    assertTrustedIpcSender(event)
    return getStartupMetrics()
  })
  ipcMain.handle('toggle-startup-item', async (event, itemPath: unknown, enable: unknown) => {
    assertTrustedIpcSender(event)
    if (!isValidStartupPathInput(itemPath) || typeof enable !== 'boolean') return false
    return enable ? enableStartupItem(itemPath) : disableStartupItem(itemPath)
  })
  ipcMain.handle('export-system-report', async (event, format: unknown) => {
    assertTrustedIpcSender(event)
    if (!isSystemReportFormat(format)) throw new Error('Invalid report format')
    return createSystemReportExport(metricsService, format)
  })
  ipcMain.handle('export-diagnostic-bundle', async (event) => {
    assertTrustedIpcSender(event)
    return createDiagnosticBundle(metricsService)
  })
}

function isSystemReportFormat(value: unknown): value is SystemReportFormat {
  return value === 'json' || value === 'txt'
}
