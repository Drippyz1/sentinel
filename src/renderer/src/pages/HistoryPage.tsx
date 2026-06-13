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
import type { HistoryMetric, SnapshotRow } from '../../../shared/contracts'
import { formatSpeed, formatTime } from '../utils/format'
import { Card } from '../components/ui/Card'
import { SegmentedControl } from '../components/ui/SegmentedControl'
import { useUiSettingsStore } from '../store/uiSettingsStore'

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
  value: HistoryMetric
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
      className="text-right font-semibold uppercase tracking-wider px-3 py-2.5 whitespace-nowrap"
      style={{ color: 'var(--text-muted)', backgroundColor: 'var(--bg-card)' }}
    >
      {label}
    </th>
  )
}

function HistoryTableCell({ value, align = 'right' }: { value: string; align?: 'left' | 'right' }) {
  return (
    <td
      className={`px-3 py-2.5 font-mono whitespace-nowrap ${
        align === 'left' ? 'text-left' : 'text-right'
      }`}
      style={{ color: 'var(--text-primary)' }}
    >
      {value}
    </td>
  )
}

function HistoryEmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div
      className="flex min-h-56 items-center justify-center rounded-xl border px-6 py-12 text-center"
      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
    >
      <div>
        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          {title}
        </p>
        <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          {message}
        </p>
      </div>
    </div>
  )
}

export function HistoryPage() {
  const [data, setData] = useState<SnapshotRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)
  const historyRangeMinutes = useUiSettingsStore((state) => state.historyRangeMinutes)
  const setHistoryRangeMinutes = useUiSettingsStore((state) => state.setHistoryRangeMinutes)
  const view = useUiSettingsStore((state) => state.historyView)
  const setView = useUiSettingsStore((state) => state.setHistoryView)
  const visibility = useUiSettingsStore((state) => state.historyMetrics)
  const setHistoryMetricVisible = useUiSettingsStore((state) => state.setHistoryMetricVisible)
  const selectedRange = RANGES.find((range) => range.minutes === historyRangeMinutes) ?? RANGES[1]

  const loadHistory = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const rows = await window.electronAPI.getHistoryDownsampled(selectedRange.minutes)
      setData(rows)
      setLastRefreshed(new Date())
    } catch (err) {
      console.error('Failed to load history:', err)
      setLoadError('History could not be loaded. Sentinel will try again automatically.')
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
    const csv = `\uFEFF${[CSV_HEADER.join(','), ...rows].join('\r\n')}`
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')

    link.href = url
    link.download = 'sentinel-history.csv'
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  function toggleMetric(metric: HistoryMetric) {
    setHistoryMetricVisible(metric, !visibility[metric])
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
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
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
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          <button
            onClick={exportCsv}
            disabled={data.length === 0}
            className="min-h-9 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all"
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
          <div className="flex min-w-0 flex-1 flex-wrap gap-1.5 sm:flex-none">
            {RANGES.map((range) => (
              <button
                key={range.minutes}
                onClick={() => setHistoryRangeMinutes(range.minutes)}
                className="min-h-9 flex-1 px-3 py-2 rounded-lg text-xs font-semibold transition-all sm:flex-none"
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
        className="flex flex-wrap items-center justify-between gap-4 rounded-xl p-3 mb-5"
        style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
          <div>
            <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
              View
            </p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Choose how history is displayed
            </p>
          </div>
          <SegmentedControl
            value={view}
            onChange={setView}
            ariaLabel="History view"
            options={[
              { label: 'Chart', value: 'chart' },
              { label: 'Table', value: 'table' }
            ]}
          />
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
            Metrics
          </span>
          {METRIC_GROUPS.map((metric) => {
            const isVisible = visibility[metric.value]

            return (
              <button
                key={metric.value}
                type="button"
                onClick={() => toggleMetric(metric.value)}
                className="min-h-8 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={{
                  backgroundColor: isVisible ? metric.background : 'var(--bg-base)',
                  border: `1px solid ${isVisible ? metric.color : 'var(--border)'}`,
                  color: isVisible ? metric.color : 'var(--text-muted)',
                  boxShadow: isVisible ? `0 0 0 1px ${metric.background}` : 'none'
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
        <HistoryEmptyState title="Loading history" message="Preparing recent metric snapshots..." />
      ) : loadError && data.length === 0 ? (
        <HistoryEmptyState title="Unable to load history" message={loadError} />
      ) : data.length === 0 ? (
        <HistoryEmptyState
          title="No history yet"
          message="Leave Sentinel running for a few minutes, then check back."
        />
      ) : !hasVisibleMetrics ? (
        <HistoryEmptyState
          title="No metrics selected"
          message="Choose at least one metric from the filters above."
        />
      ) : view === 'table' ? (
        <Card className="p-0 overflow-hidden">
          <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
            <table className="w-full border-separate border-spacing-0 text-xs">
              <thead className="sticky top-0 z-10">
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th
                    className="text-left font-semibold uppercase tracking-wider px-3 py-2.5 whitespace-nowrap"
                    style={{ color: 'var(--text-muted)', backgroundColor: 'var(--bg-card)' }}
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
                  <tr
                    key={snapshot.timestamp}
                    className="transition-colors"
                    style={{ backgroundColor: 'transparent' }}
                    onMouseEnter={(event) => {
                      event.currentTarget.style.backgroundColor = 'var(--bg-card-hover)'
                    }}
                    onMouseLeave={(event) => {
                      event.currentTarget.style.backgroundColor = 'transparent'
                    }}
                  >
                    <HistoryTableCell
                      value={new Date(snapshot.timestamp).toLocaleString()}
                      align="left"
                    />
                    {visibility.cpu && <HistoryTableCell value={`${snapshot.cpu_usage}%`} />}
                    {visibility.memory && <HistoryTableCell value={`${snapshot.memory_usage}%`} />}
                    {visibility.network && (
                      <>
                        <HistoryTableCell value={formatSpeed(snapshot.net_down)} />
                        <HistoryTableCell value={formatSpeed(snapshot.net_up)} />
                      </>
                    )}
                    {visibility.disk && (
                      <>
                        <HistoryTableCell value={formatSpeed(snapshot.disk_read)} />
                        <HistoryTableCell value={formatSpeed(snapshot.disk_write)} />
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
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
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
                formatValue={formatSpeed}
                domain={[0, maxNetDown]}
              />
              <ChartCard
                title="Network Upload"
                data={data}
                dataKey="net_up"
                color="#f59e0b"
                formatValue={formatSpeed}
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
                formatValue={formatSpeed}
                domain={[0, maxDiskRead]}
              />
              <ChartCard
                title="Disk Write"
                data={data}
                dataKey="disk_write"
                color="#ef4444"
                formatValue={formatSpeed}
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
