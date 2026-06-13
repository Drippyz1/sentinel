import { useNetworkMetrics } from '../../hooks/useMetrics'
import { useHistoryStore } from '../../store/historyStore'
import { formatSpeed } from '../../utils/format'
import { Card } from '../ui/Card'
import { StatRow } from '../ui/StatRow'
import { MiniChart } from '../ui/MiniChart'

export function NetworkWidget() {
  const network = useNetworkMetrics()
  const downHistory = useHistoryStore((state) => state.networkDown)
  const upHistory = useHistoryStore((state) => state.networkUp)
  if (!network) return null

  const activeInterfaces = network.interfaces.filter((i) => i.isActive)

  return (
    <Card title="Network">
      <div className="grid grid-cols-2 gap-4 mb-3">
        <div>
          <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
            Download
          </p>
          <p className="text-2xl font-bold font-mono" style={{ color: 'var(--accent-green)' }}>
            {formatSpeed(network.totalDownloadBytesPerSec)}
          </p>
        </div>
        <div>
          <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
            Upload
          </p>
          <p className="text-2xl font-bold font-mono" style={{ color: 'var(--accent-blue)' }}>
            {formatSpeed(network.totalUploadBytesPerSec)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <MiniChart
          data={downHistory}
          color="#22c55e"
          formatValue={formatSpeed}
          domain={[0, Math.max(...downHistory.map((p) => p.value), 1)]}
        />
        <MiniChart
          data={upHistory}
          color="#3b82f6"
          formatValue={formatSpeed}
          domain={[0, Math.max(...upHistory.map((p) => p.value), 1)]}
        />
      </div>

      {activeInterfaces.length > 0 && (
        <div className="pt-4" style={{ borderTop: '1px solid var(--border)' }}>
          <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
            Interfaces
          </p>
          {activeInterfaces.map((iface) => (
            <div key={iface.name} className="mb-3">
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm font-medium">{iface.name}</span>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {iface.ipAddress}
                </span>
              </div>
              <StatRow label="↓" value={formatSpeed(iface.downloadBytesPerSec)} accent="green" />
              <StatRow label="↑" value={formatSpeed(iface.uploadBytesPerSec)} accent="blue" />
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
