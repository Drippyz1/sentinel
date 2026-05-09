import { useAnomalyReport } from '../../hooks/useMetrics'
import { Anomaly } from '../../../../main/analysis/anomalyDetector'
import { Card } from '../ui/Card'

function formatBytes(bytes: number): string {
  if (bytes < 1024)              return `${bytes.toFixed(0)} B`
  if (bytes < 1024 * 1024)      return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatValue(metric: string, value: number): string {
  switch (metric) {
    case 'disk_read':
    case 'disk_write':
    case 'net_down':
    case 'net_up':
      return `${formatBytes(value)}/s`
    default:
      return `${value}%`
  }
}

function severityColor(severity: string): string {
  switch (severity) {
    case 'critical': return 'var(--accent-red)'
    case 'warning':  return 'var(--accent-amber)'
    default:         return 'var(--accent-blue)'
  }
}

function severityBg(severity: string): string {
  switch (severity) {
    case 'critical': return 'rgba(239, 68, 68, 0.08)'
    case 'warning':  return 'rgba(245, 158, 11, 0.08)'
    default:         return 'rgba(59, 130, 246, 0.08)'
  }
}

function AnomalyItem({ anomaly }: { anomaly: Anomaly }) {
  return (
    <div
      className="flex items-start gap-3 p-3 rounded-lg mb-2"
      style={{ backgroundColor: severityBg(anomaly.severity) }}
    >
      {/* Severity dot */}
      <div
        className="w-2 h-2 rounded-full mt-1.5 shrink-0"
        style={{ backgroundColor: severityColor(anomaly.severity) }}
      />

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          {anomaly.message}
        </p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
          Current: {formatValue(anomaly.metric, anomaly.currentValue)} · Baseline: {formatValue(anomaly.metric, anomaly.meanValue)} · Z-score: {anomaly.zScore}
        </p>
      </div>

      {/* Severity badge */}
      <span
        className="text-xs font-semibold uppercase tracking-wide shrink-0"
        style={{ color: severityColor(anomaly.severity) }}
      >
        {anomaly.severity}
      </span>
    </div>
  )
}

export function AnomalyPanel() {
  const report = useAnomalyReport()

  if (!report) return null

  // Still warming up — show progress
  if (!report.isWarmedUp) {
    const progress = Math.round((report.samplesCount / 60) * 100)
    return (
      <Card title="Anomaly Detection">
        <div className="flex items-center gap-3">
          <div
            className="flex-1 h-1.5 rounded-full overflow-hidden"
            style={{ backgroundColor: 'var(--border)' }}
          >
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${progress}%`,
                backgroundColor: 'var(--accent-blue)'
              }}
            />
          </div>
          <span className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>
            Learning baseline... {progress}%
          </span>
        </div>
        <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
          Anomaly detection activates after 2 minutes of data collection
        </p>
      </Card>
    )
  }

  // Warmed up, no anomalies
  if (!report.hasAnomalies) {
    return (
      <Card title="Anomaly Detection">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full"
               style={{ backgroundColor: 'var(--accent-green)' }} />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            All metrics within normal range
          </p>
        </div>
      </Card>
    )
  }

  // Active anomalies
  return (
    <Card
      title="Anomaly Detection"
      subtitle={`${report.anomalies.length} anomaly${report.anomalies.length > 1 ? 's' : ''} detected`}
    >
      {report.anomalies.map((anomaly, i) => (
        <AnomalyItem key={i} anomaly={anomaly} />
      ))}
    </Card>
  )
}