import { useState, useEffect } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid
} from 'recharts'
import { SnapshotRow } from '../../../main/storage/queries'
import { formatBytes } from '../utils/format'
import { Card } from '../components/ui/Card'

// Time range options the user can pick from
const RANGES = [
  { label: '30 min', minutes: 30  },
  { label: '1 hour', minutes: 60  },
  { label: '3 hours', minutes: 180 },
  { label: '6 hours', minutes: 360 },
  { label: '24 hours', minutes: 1440 },
]

// Format a timestamp for the X axis
function formatXAxis(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  })
}

interface ChartCardProps {
  title:       string
  data:        SnapshotRow[]
  dataKey:     keyof SnapshotRow
  color:       string
  formatValue: (v: number) => string
  domain?:     [number, number]
}

function ChartCard({ title, data, dataKey, color, formatValue, domain = [0, 100] }: ChartCardProps) {
  return (
    <Card title={title}>
      <ResponsiveContainer width="100%" height={160}>
        <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--border)"
            vertical={false}
          />
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
            tickFormatter={formatValue}
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
            formatter={(value: number) => [formatValue(value), title]}
            labelFormatter={(label: number) => new Date(label).toLocaleTimeString()}
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
  const [selectedRange, setSelectedRange] = useState(RANGES[1])  // default 1 hour
  const [data, setData]                   = useState<SnapshotRow[]>([])
  const [isLoading, setIsLoading]         = useState(true)

  useEffect(() => {
    loadHistory()
    // Refresh every 30 seconds so the charts stay current
    const interval = setInterval(loadHistory, 30000)
    return () => clearInterval(interval)
  }, [selectedRange])

  async function loadHistory() {
    setIsLoading(true)
    try {
      const rows = await window.electronAPI.getHistoryDownsampled(selectedRange.minutes)
      setData(rows)
    } catch (err) {
      console.error('Failed to load history:', err)
    } finally {
      setIsLoading(false)
    }
  }

  // Calculate max values for dynamic chart domains
  const maxNetDown = Math.max(...data.map(d => d.net_down), 1)
  const maxNetUp   = Math.max(...data.map(d => d.net_up), 1)
  const maxDiskRead  = Math.max(...data.map(d => d.disk_read), 1)
  const maxDiskWrite = Math.max(...data.map(d => d.disk_write), 1)

  return (
    <div>
      {/* Header + range picker */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
          History
        </h2>
        <div className="flex gap-1">
          {RANGES.map(range => (
            <button
              key={range.minutes}
              onClick={() => setSelectedRange(range)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{
                backgroundColor: selectedRange.minutes === range.minutes
                  ? 'var(--accent-blue)'
                  : 'var(--bg-card)',
                color: selectedRange.minutes === range.minutes
                  ? 'white'
                  : 'var(--text-muted)',
                border: '1px solid var(--border)'
              }}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && data.length === 0 ? (
        <div className="flex items-center justify-center py-24">
          <p style={{ color: 'var(--text-muted)' }}>Loading history...</p>
        </div>
      ) : data.length === 0 ? (
        <div className="flex items-center justify-center py-24">
          <p style={{ color: 'var(--text-muted)' }}>
            No data yet — keep the app running and check back shortly
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <ChartCard
            title="CPU Usage"
            data={data}
            dataKey="cpu_usage"
            color="#3b82f6"
            formatValue={v => `${v}%`}
            domain={[0, 100]}
          />
          <ChartCard
            title="Memory Usage"
            data={data}
            dataKey="memory_usage"
            color="#a855f7"
            formatValue={v => `${v}%`}
            domain={[0, 100]}
          />
          <ChartCard
            title="Network Download"
            data={data}
            dataKey="net_down"
            color="#22c55e"
            formatValue={v => formatBytes(v) + '/s'}
            domain={[0, maxNetDown]}
          />
          <ChartCard
            title="Network Upload"
            data={data}
            dataKey="net_up"
            color="#f59e0b"
            formatValue={v => formatBytes(v) + '/s'}
            domain={[0, maxNetUp]}
          />
          <ChartCard
            title="Disk Read"
            data={data}
            dataKey="disk_read"
            color="#22c55e"
            formatValue={v => formatBytes(v) + '/s'}
            domain={[0, maxDiskRead]}
          />
          <ChartCard
            title="Disk Write"
            data={data}
            dataKey="disk_write"
            color="#ef4444"
            formatValue={v => formatBytes(v) + '/s'}
            domain={[0, maxDiskWrite]}
          />
          {data.some(d => d.gpu_usage !== null) && (
            <ChartCard
              title="GPU Usage"
              data={data}
              dataKey="gpu_usage"
              color="#ec4899"
              formatValue={v => `${v}%`}
              domain={[0, 100]}
            />
          )}
          {data.some(d => d.battery !== null) && (
            <ChartCard
              title="Battery"
              data={data}
              dataKey="battery"
              color="#84cc16"
              formatValue={v => `${v}%`}
              domain={[0, 100]}
            />
          )}
        </div>
      )}
    </div>
  )
}