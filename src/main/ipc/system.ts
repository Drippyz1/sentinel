import { getSystemInfo } from '../collectors/systemInfo'
import { getThermalMetrics } from '../collectors/thermal'
import { getStartupMetrics } from '../collectors/startup'
import { handleTrustedIpc } from '../ipcSecurity'
import { createDiagnosticBundle } from '../reports/diagnosticBundle'
import { createSystemReportExport } from '../reports/systemReport'
import { MetricsService } from '../services/MetricsService'
import type { SystemReportFormat } from '../../shared/contracts'

export function registerSystemIpc(metricsService: MetricsService): void {
  handleTrustedIpc('get-system-info', async () => {
    return getSystemInfo()
  })
  handleTrustedIpc('get-thermal-metrics', async () => {
    return getThermalMetrics()
  })
  handleTrustedIpc('get-startup-metrics', async () => {
    return getStartupMetrics()
  })
  handleTrustedIpc('export-system-report', async (_event, _role, format: unknown) => {
    if (!isSystemReportFormat(format)) throw new Error('Invalid report format')
    return createSystemReportExport(metricsService, format)
  })
  handleTrustedIpc('export-diagnostic-bundle', async () => {
    return createDiagnosticBundle(metricsService)
  })
}

function isSystemReportFormat(value: unknown): value is SystemReportFormat {
  return value === 'json' || value === 'txt'
}
