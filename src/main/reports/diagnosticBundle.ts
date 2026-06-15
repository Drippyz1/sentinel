import { app } from 'electron'
import { arch, platform } from 'os'
import type { DiagnosticBundleExport } from '../../shared/contracts'
import { formatHistoryCsv } from '../../shared/utils/historyCsv'
import { MetricsService } from '../services/MetricsService'
import { getAlertHistory } from '../storage/alertHistory'
import { getDownsampled } from '../storage/queries'
import { loadSettings } from '../storage/settings'
import { createSystemReport, formatFilenameTimestamp, serializeSystemReport } from './systemReport'
import { sanitizeForExport } from './privacy'
import { createZip } from './zip'

const DIAGNOSTIC_HISTORY_MINUTES = 24 * 60

const PRIVACY_README = `Sentinel Diagnostic Bundle

This archive is intended for troubleshooting and bug reports.

Included:
- Structured and human-readable system reports
- Up to 24 hours of one-minute history metrics
- Recent monitoring alert records
- Current Sentinel application and UI settings
- Sentinel, Electron, Node.js, platform, and architecture information

Intentionally excluded:
- Hardware serial numbers
- LaunchAgent plist paths
- Home directory and private filesystem paths
- Authentication tokens, cookies, credentials, and secrets
- Environment variables

Sentinel replaces recognized user-home paths with [home]. Hardware names, hostname,
local IP addresses, volume labels, startup application names, and configured settings
may still identify your device or local network.

Review every file in this archive before sharing it publicly.
`

function yieldToMainLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

export async function createDiagnosticBundle(
  metricsService: MetricsService
): Promise<DiagnosticBundleExport> {
  const generatedAt = new Date()
  const report = sanitizeForExport(await createSystemReport(metricsService))
  await yieldToMainLoop()

  const history = getDownsampled(DIAGNOSTIC_HISTORY_MINUTES)
  const alerts = getAlertHistory().map(
    ({ timestamp, type, severity, title, message, metricValue, threshold }) => ({
      timestamp: new Date(timestamp).toISOString(),
      type,
      severity,
      title,
      message,
      metricValue,
      threshold
    })
  )
  const settings = sanitizeForExport(loadSettings())
  await yieldToMainLoop()

  const appInfo = {
    version: app.getVersion(),
    platform: platform(),
    architecture: arch(),
    electronVersion: process.versions.electron,
    nodeVersion: process.versions.node,
    generatedAt: generatedAt.toISOString()
  }
  const archive = createZip(
    [
      { name: 'report.json', content: serializeSystemReport(report, 'json') },
      { name: 'report.txt', content: serializeSystemReport(report, 'txt') },
      { name: 'history.csv', content: formatHistoryCsv(history) },
      { name: 'alerts.json', content: JSON.stringify(sanitizeForExport(alerts), null, 2) },
      { name: 'settings.json', content: JSON.stringify(settings, null, 2) },
      { name: 'app-info.json', content: JSON.stringify(appInfo, null, 2) },
      { name: 'privacy-readme.txt', content: PRIVACY_README }
    ],
    generatedAt
  )

  return {
    filename: `sentinel-diagnostic-bundle-${formatFilenameTimestamp(generatedAt)}.zip`,
    mimeType: 'application/zip',
    content: archive
  }
}
