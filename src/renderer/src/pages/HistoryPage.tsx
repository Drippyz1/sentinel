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
import { formatBytes } from '../utils/format'
import { Card } from '../components/ui/Card'

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

export function HistoryPage() {
  const [selectedRange, setSelectedRange] = useState(RANGES[1])
  const [data, setData] = useState<SnapshotRow[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const loadHistory = useCallback(async () => {
    setIsLoading(true)
    try {
      const rows = await window.electronAPI.getHistoryDownsampled(selectedRange.minutes)
      setData(rows)
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

  const maxNetDown = Math.max(...data.map((d) => d.net_down), 1)
  const maxNetUp = Math.max(...data.map((d) => d.net_up), 1)
  const maxDiskRead = Math.max(...data.map((d) => d.disk_read), 1)
  const maxDiskWrite = Math.max(...data.map((d) => d.disk_write), 1)

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
          History
        </h2>
        <div className="flex items-center gap-2">
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
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <ChartCard
            title="CPU Usage"
            data={data}
            dataKey="cpu_usage"
            color="#3b82f6"
            formatValue={(v) => `${v}%`}
            domain={[0, 100]}
          />
          <ChartCard
            title="Memory Usage"
            data={data}
            dataKey="memory_usage"
            color="#a855f7"
            formatValue={(v) => `${v}%`}
            domain={[0, 100]}
          />
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
          {data.some((d) => d.gpu_usage !== null) && (
            <ChartCard
              title="GPU Usage"
              data={data}
              dataKey="gpu_usage"
              color="#ec4899"
              formatValue={(v) => `${v}%`}
              domain={[0, 100]}
            />
          )}
          {data.some((d) => d.battery !== null) && (
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
