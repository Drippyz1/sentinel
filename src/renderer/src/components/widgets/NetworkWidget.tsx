import { useNetworkMetrics } from '../../hooks/useMetrics'
import { useHistoryStore } from '../../store/historyStore'
import { formatSpeed } from '../../utils/format'
import { Card } from '../ui/Card'
import { StatRow } from '../ui/StatRow'
import { MiniChart } from '../ui/MiniChart'
import {
  DASHBOARD_CHART_HEIGHT,
  isCompactDashboard,
  type DashboardWidgetProps
} from './dashboardDensity'

export function NetworkWidget({ density }: DashboardWidgetProps) {
  const network = useNetworkMetrics()
  const downHistory = useHistoryStore((state) => state.networkDown)
  const upHistory = useHistoryStore((state) => state.networkUp)
  if (!network) return null

  const activeInterfaces = network.interfaces.filter((i) => i.isActive)
  const compact = isCompactDashboard(density)

  return (
    <Card title="Network" density={density}>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div
          className={`min-w-0 rounded-lg ${compact ? 'p-2.5' : 'p-3'}`}
          style={{ backgroundColor: 'var(--bg-base)' }}
        >
          <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
            Download
          </p>
          <p
            className="truncate font-bold font-mono"
            style={{ color: 'var(--accent-green)', fontSize: 'clamp(1rem, 2.2vw, 1.5rem)' }}
            title={formatSpeed(network.totalDownloadBytesPerSec)}
          >
            {formatSpeed(network.totalDownloadBytesPerSec)}
          </p>
        </div>
        <div
          className={`min-w-0 rounded-lg ${compact ? 'p-2.5' : 'p-3'}`}
          style={{ backgroundColor: 'var(--bg-base)' }}
        >
          <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
            Upload
          </p>
          <p
            className="truncate font-bold font-mono"
            style={{ color: 'var(--accent-blue)', fontSize: 'clamp(1rem, 2.2vw, 1.5rem)' }}
            title={formatSpeed(network.totalUploadBytesPerSec)}
          >
            {formatSpeed(network.totalUploadBytesPerSec)}
          </p>
        </div>
      </div>

      <div
        className={compact ? 'mt-3 mb-3 pt-3' : 'mt-4 mb-4 pt-4'}
        style={{ borderTop: '1px solid var(--border)' }}
      >
        <div className="grid grid-cols-2 gap-3">
          <MiniChart
            data={downHistory}
            color="#22c55e"
            label={compact ? 'Down · 2 min' : 'Download · Last 2 min'}
            ariaLabel="Recent network download trend"
            formatValue={formatSpeed}
            domain={[0, Math.max(...downHistory.map((p) => p.value), 1)]}
            height={DASHBOARD_CHART_HEIGHT[density]}
          />
          <MiniChart
            data={upHistory}
            color="#3b82f6"
            label={compact ? 'Up · 2 min' : 'Upload · Last 2 min'}
            ariaLabel="Recent network upload trend"
            formatValue={formatSpeed}
            domain={[0, Math.max(...upHistory.map((p) => p.value), 1)]}
            height={DASHBOARD_CHART_HEIGHT[density]}
          />
        </div>
      </div>

      {!compact && activeInterfaces.length > 0 && (
        <div className="pt-4" style={{ borderTop: '1px solid var(--border)' }}>
          <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
            Interfaces
          </p>
          {activeInterfaces.map((iface) => (
            <div key={iface.name} className="mb-3">
              <StatRow label={iface.name} value={iface.ipAddress} accent="blue" copyable />
              <StatRow label="↓" value={formatSpeed(iface.downloadBytesPerSec)} accent="green" />
              <StatRow label="↑" value={formatSpeed(iface.uploadBytesPerSec)} accent="blue" />
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
