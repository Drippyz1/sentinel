import { useState, useEffect, useCallback } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid
} from 'recharts'
import { SnapshotRow } from '../../../main/storage/queries'
import { formatBytes, formatTime } from '../utils/format'
import { Card } from '../components/ui/Card'
import { SegmentedControl } from '../components/ui/SegmentedControl'

type HistoryView = 'chart' | 'table'
type MetricGroup = 'cpu' | 'memory' | 'network' | 'disk' | 'gpu' | 'battery'

const RANGES = [
  { label: '30 min', minutes: 30 },
  { label: '1 hour', minutes: 60 },
  { label: '3 hours', minutes: 180 },
  { label: '6 hours', minutes: 360 },
  { label: '24 hours', minutes: 1440 }
]

const CSV_HEADER = [
  'timestamp',
  'cpu_usage',
  'memory_usage',
  'disk_read',
  'disk_write',
  'net_down',
  'net_up',
  'gpu_usage',
  'battery'
]

const METRIC_GROUPS: {
  label: string
  value: MetricGroup
  color: string
  background: string
}[] = [
  {
    label: 'CPU',
    value: 'cpu',
    color: 'var(--accent-blue)',
    background: 'rgba(59, 130, 246, 0.1)'
  },
  {
    label: 'Memory',
    value: 'memory',
    color: 'var(--accent-purple)',
    background: 'rgba(168, 85, 247, 0.1)'
  },
  {
    label: 'Network',
    value: 'network',
    color: 'var(--accent-green)',
    background: 'rgba(34, 197, 94, 0.1)'
  },
  {
    label: 'Disk',
    value: 'disk',
    color: 'var(--accent-amber)',
    background: 'rgba(245, 158, 11, 0.1)'
  },
  {
    label: 'GPU',
    value: 'gpu',
    color: '#ec4899',
    background: 'rgba(236, 72, 153, 0.1)'
  },
  {
    label: 'Battery',
    value: 'battery',
    color: '#84cc16',
    background: 'rgba(132, 204, 22, 0.1)'
  }
]

const INITIAL_VISIBILITY: Record<MetricGroup, boolean> = {
  cpu: true,
  memory: true,
  network: true,
  disk: true,
  gpu: true,
  battery: true
}

function formatXAxis(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  })
}

interface ChartCardProps {
  title: string
  data: SnapshotRow[]
  dataKey: keyof SnapshotRow
  color: string
  formatValue: (v: number) => string
  domain?: [number, number]
}

function ChartCard({
  title,
  data,
  dataKey,
  color,
  formatValue,
  domain = [0, 100]
}: ChartCardProps) {
  return (
    <Card title={title}>
      <ResponsiveContainer width="100%" height={160}>
        <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="timestamp"
            tickFormatter={formatXAxis}
            tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={domain}
            tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => formatValue(v)}
            width={55}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              fontSize: '12px',
              color: 'var(--text-primary)'
            }}
            formatter={(value: unknown) => [formatValue(value as number), title]}
            labelFormatter={(label: unknown) => new Date(label as number).toLocaleTimeString()}
          />
          <Area
            type="monotone"
            dataKey={dataKey as string}
            stroke={color}
            strokeWidth={1.5}
            fill={`${color}20`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </Card>
  )
}

function HistoryTableHeader({ label }: { label: string }) {
  return (
    <th
      className="text-right font-semibold uppercase tracking-wider px-2 py-2 whitespace-nowrap"
      style={{ color: 'var(--text-muted)' }}
    >
      {label}
    </th>
  )
}

function HistoryTableCell({ value, align = 'right' }: { value: string; align?: 'left' | 'right' }) {
  return (
    <td
      className={`px-2 py-2 font-mono whitespace-nowrap ${
        align === 'left' ? 'text-left' : 'text-right'
      }`}
      style={{ color: 'var(--text-primary)' }}
    >
      {value}
    </td>
  )
}

export function HistoryPage() {
  const [selectedRange, setSelectedRange] = useState(RANGES[1])
  const [data, setData] = useState<SnapshotRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [view, setView] = useState<HistoryView>('chart')
  const [visibility, setVisibility] = useState<Record<MetricGroup, boolean>>(INITIAL_VISIBILITY)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)

  const loadHistory = useCallback(async () => {
    setIsLoading(true)
    try {
      const rows = await window.electronAPI.getHistoryDownsampled(selectedRange.minutes)
      setData(rows)
      setLastRefreshed(new Date())
    } catch (err) {
      console.error('Failed to load history:', err)
    } finally {
      setIsLoading(false)
    }
  }, [selectedRange.minutes])

  useEffect(() => {
    const initialLoad = setTimeout(loadHistory, 0)
    const interval = setInterval(loadHistory, 30000)
    return () => {
      clearTimeout(initialLoad)
      clearInterval(interval)
    }
  }, [loadHistory])

  function exportCsv() {
    const rows = data.map((snapshot) =>
      [
        new Date(snapshot.timestamp).toISOString(),
        snapshot.cpu_usage,
        snapshot.memory_usage,
        snapshot.disk_read,
        snapshot.disk_write,
        snapshot.net_down,
        snapshot.net_up,
        snapshot.gpu_usage ?? '',
        snapshot.battery ?? ''
      ].join(',')
    )
    const csv = [CSV_HEADER.join(','), ...rows].join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')

    link.href = url
    link.download = 'sentinel-history.csv'
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  function toggleMetric(metric: MetricGroup) {
    setVisibility((current) => ({ ...current, [metric]: !current[metric] }))
  }

  const hasVisibleMetrics = Object.values(visibility).some(Boolean)
  const hasGpuData = data.some((snapshot) => snapshot.gpu_usage !== null)
  const hasBatteryData = data.some((snapshot) => snapshot.battery !== null)
  const maxNetDown = Math.max(...data.map((d) => d.net_down), 1)
  const maxNetUp = Math.max(...data.map((d) => d.net_up), 1)
  const maxDiskRead = Math.max(...data.map((d) => d.disk_read), 1)
  const maxDiskWrite = Math.max(...data.map((d) => d.disk_write), 1)

  return (
    <div>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            History
          </h2>
          {lastRefreshed && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Refreshed {formatTime(lastRefreshed)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <SegmentedControl
            value={view}
            onChange={setView}
            ariaLabel="History view"
            options={[
              { label: 'Chart', value: 'chart' },
              { label: 'Table', value: 'table' }
            ]}
          />
          <button
            onClick={exportCsv}
            disabled={data.length === 0}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{
              backgroundColor: 'var(--bg-card)',
              color: 'var(--text-muted)',
              border: '1px solid var(--border)',
              cursor: data.length === 0 ? 'not-allowed' : 'pointer',
              opacity: data.length === 0 ? 0.5 : 1
            }}
          >
            Export CSV
          </button>
          <div className="flex gap-1">
            {RANGES.map((range) => (
              <button
                key={range.minutes}
                onClick={() => setSelectedRange(range)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{
                  backgroundColor:
                    selectedRange.minutes === range.minutes
                      ? 'var(--accent-blue)'
                      : 'var(--bg-card)',
                  color: selectedRange.minutes === range.minutes ? 'white' : 'var(--text-muted)',
                  border: '1px solid var(--border)'
                }}
              >
                {range.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div
        className="flex items-center justify-between rounded-xl px-3 py-2 mb-4"
        style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
      >
        <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
          Visible metrics
        </span>
        <div className="flex items-center gap-1.5">
          {METRIC_GROUPS.map((metric) => {
            const isVisible = visibility[metric.value]

            return (
              <button
                key={metric.value}
                type="button"
                onClick={() => toggleMetric(metric.value)}
                className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                style={{
                  backgroundColor: isVisible ? metric.background : 'transparent',
                  border: `1px solid ${isVisible ? metric.color : 'var(--border)'}`,
                  color: isVisible ? metric.color : 'var(--text-muted)'
                }}
                aria-pressed={isVisible}
              >
                {metric.label}
              </button>
            )
          })}
        </div>
      </div>

      {isLoading && data.length === 0 ? (
        <div className="flex items-center justify-center py-24">
          <p style={{ color: 'var(--text-muted)' }}>Loading...</p>
        </div>
      ) : data.length === 0 ? (
        <div className="flex items-center justify-center py-24">
          <p style={{ color: 'var(--text-muted)' }}>
            Nothing here yet. Leave it running and check back.
          </p>
        </div>
      ) : !hasVisibleMetrics ? (
        <div className="flex items-center justify-center py-24">
          <p style={{ color: 'var(--text-muted)' }}>Select a metric to display.</p>
        </div>
      ) : view === 'table' ? (
        <Card>
          <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th
                    className="text-left font-semibold uppercase tracking-wider px-2 py-2"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Timestamp
                  </th>
                  {visibility.cpu && <HistoryTableHeader label="CPU" />}
                  {visibility.memory && <HistoryTableHeader label="Memory" />}
                  {visibility.network && (
                    <>
                      <HistoryTableHeader label="Download" />
                      <HistoryTableHeader label="Upload" />
                    </>
                  )}
                  {visibility.disk && (
                    <>
                      <HistoryTableHeader label="Disk Read" />
                      <HistoryTableHeader label="Disk Write" />
                    </>
                  )}
                  {visibility.gpu && hasGpuData && <HistoryTableHeader label="GPU" />}
                  {visibility.battery && hasBatteryData && <HistoryTableHeader label="Battery" />}
                </tr>
              </thead>
              <tbody>
                {data.map((snapshot) => (
                  <tr key={snapshot.timestamp} style={{ borderBottom: '1px solid var(--border)' }}>
                    <HistoryTableCell
                      value={new Date(snapshot.timestamp).toLocaleString()}
                      align="left"
                    />
                    {visibility.cpu && <HistoryTableCell value={`${snapshot.cpu_usage}%`} />}
                    {visibility.memory && <HistoryTableCell value={`${snapshot.memory_usage}%`} />}
                    {visibility.network && (
                      <>
                        <HistoryTableCell value={`${formatBytes(snapshot.net_down)}/s`} />
                        <HistoryTableCell value={`${formatBytes(snapshot.net_up)}/s`} />
                      </>
                    )}
                    {visibility.disk && (
                      <>
                        <HistoryTableCell value={`${formatBytes(snapshot.disk_read)}/s`} />
                        <HistoryTableCell value={`${formatBytes(snapshot.disk_write)}/s`} />
                      </>
                    )}
                    {visibility.gpu && hasGpuData && (
                      <HistoryTableCell
                        value={snapshot.gpu_usage === null ? '—' : `${snapshot.gpu_usage}%`}
                      />
                    )}
                    {visibility.battery && hasBatteryData && (
                      <HistoryTableCell
                        value={snapshot.battery === null ? '—' : `${snapshot.battery}%`}
                      />
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {visibility.cpu && (
            <ChartCard
              title="CPU Usage"
              data={data}
              dataKey="cpu_usage"
              color="#3b82f6"
              formatValue={(v) => `${v}%`}
              domain={[0, 100]}
            />
          )}
          {visibility.memory && (
            <ChartCard
              title="Memory Usage"
              data={data}
              dataKey="memory_usage"
              color="#a855f7"
              formatValue={(v) => `${v}%`}
              domain={[0, 100]}
            />
          )}
          {visibility.network && (
            <>
              <ChartCard
                title="Network Download"
                data={data}
                dataKey="net_down"
                color="#22c55e"
                formatValue={(v) => formatBytes(v) + '/s'}
                domain={[0, maxNetDown]}
              />
              <ChartCard
                title="Network Upload"
                data={data}
                dataKey="net_up"
                color="#f59e0b"
                formatValue={(v) => formatBytes(v) + '/s'}
                domain={[0, maxNetUp]}
              />
            </>
          )}
          {visibility.disk && (
            <>
              <ChartCard
                title="Disk Read"
                data={data}
                dataKey="disk_read"
                color="#22c55e"
                formatValue={(v) => formatBytes(v) + '/s'}
                domain={[0, maxDiskRead]}
              />
              <ChartCard
                title="Disk Write"
                data={data}
                dataKey="disk_write"
                color="#ef4444"
                formatValue={(v) => formatBytes(v) + '/s'}
                domain={[0, maxDiskWrite]}
              />
            </>
          )}
          {visibility.gpu && hasGpuData && (
            <ChartCard
              title="GPU Usage"
              data={data}
              dataKey="gpu_usage"
              color="#ec4899"
              formatValue={(v) => `${v}%`}
              domain={[0, 100]}
            />
          )}
          {visibility.battery && hasBatteryData && (
            <ChartCard
              title="Battery"
              data={data}
              dataKey="battery"
              color="#84cc16"
              formatValue={(v) => `${v}%`}
              domain={[0, 100]}
            />
          )}
        </div>
      )}
    </div>
  )
}
