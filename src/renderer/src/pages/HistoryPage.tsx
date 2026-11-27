import { createContext, useContext, useState, useEffect, useMemo, useRef } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine
} from 'recharts'
import type {
  AlertMarker,
  HistoryMetric,
  MonitoringAlertType,
  SnapshotRow
} from '../../../shared/contracts'
import { HISTORY_BUCKET_MS } from '../../../shared/contracts/history'
import { formatHistoryCsv } from '../../../shared/utils/historyCsv'
import { projectHistoryChart } from '../../../shared/utils/chartSamples'
import { formatPercent, formatSpeed, formatTime } from '../utils/format'
import { scheduleVisibleRefresh } from '../utils/visibleRefresh'
import { observedSummary } from '../utils/historyInspection'
import { Card } from '../components/ui/Card'
import { SegmentedControl } from '../components/ui/SegmentedControl'
import { ControlGroup } from '../components/ui/ControlGroup'
import { useUiSettingsStore } from '../store/uiSettingsStore'

const RANGES = [
  { label: '30 min', minutes: 30 },
  { label: '1 hour', minutes: 60 },
  { label: '3 hours', minutes: 180 },
  { label: '6 hours', minutes: 360 },
  { label: '24 hours', minutes: 1440 }
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
    label: 'Active memory',
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
    color: 'var(--series-gpu)',
    background: 'rgba(236, 72, 153, 0.1)'
  },
  {
    label: 'Battery',
    value: 'battery',
    color: 'var(--series-battery)',
    background: 'rgba(132, 204, 22, 0.1)'
  }
]

const ALERT_METRIC_MAP: Record<MonitoringAlertType, HistoryMetric> = {
  cpu: 'cpu',
  memory: 'memory',
  disk: 'disk',
  battery: 'battery'
}

const tickTime = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' })
const rowTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'medium' })
const ROWS_PER_PAGE = 90
const InspectionTime = createContext<number | null>(null)

function formatTemperature(value: number): string {
  return `${value}°C`
}

interface ChartCardProps {
  title: string
  data: SnapshotRow[]
  dataKey: keyof SnapshotRow
  color: string
  formatValue: (v: number) => string
  domain?: [number, number]
  alertMarkers?: AlertMarker[]
}

interface AlertMarkerLineProps {
  marker: AlertMarker
  x1?: number
  x2?: number
  y1?: number
  y2?: number
}

function AlertMarkerLine({ marker, x1, x2, y1, y2 }: AlertMarkerLineProps) {
  if (x1 === undefined || x2 === undefined || y1 === undefined || y2 === undefined) return <g />

  const color = marker.severity === 'critical' ? 'var(--accent-red)' : 'var(--accent-amber)'
  const tooltip = [
    marker.title,
    marker.message,
    `Actual value: ${marker.metricValue.toFixed(1)}%`,
    `Threshold: ${marker.threshold}%`,
    new Date(marker.timestamp).toLocaleTimeString()
  ].join('\n')

  return (
    <g>
      <title>{tooltip}</title>
      <line x1={x1} x2={x2} y1={y1} y2={y2} stroke="transparent" strokeWidth={10} />
      <line
        x1={x1}
        x2={x2}
        y1={y1}
        y2={y2}
        stroke={color}
        strokeWidth={1}
        strokeDasharray="3 3"
        opacity={0.65}
      />
      <circle cx={x1} cy={y1 + 6} r={3.5} fill={color} stroke="var(--bg-card)" strokeWidth={1} />
    </g>
  )
}

function ChartCard({
  title,
  data,
  dataKey,
  color,
  formatValue,
  domain = [0, 100],
  alertMarkers = []
}: ChartCardProps) {
  const host = useRef<HTMLElement>(null)
  const [near, setNear] = useState(false)
  const timestamp = useContext(InspectionTime)
  useEffect(() => {
    if (!host.current) return
    const observer = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), {
      rootMargin: '220px'
    })
    observer.observe(host.current)
    return () => observer.disconnect()
  }, [])
  const { samples, min, max, average, count } = useMemo(() => {
    if (!near) return { samples: [], ...observedSummary([]) }
    const points = data.map((row) => ({ timestamp: row.timestamp, value: row[dataKey] }))
    return {
      samples: projectHistoryChart(points),
      ...observedSummary(points.map(({ value }) => value))
    }
  }, [data, dataKey, near])
  const selected =
    timestamp === null ? undefined : data.find((row) => row.timestamp === timestamp)?.[dataKey]
  const measurement = (value: number | null | undefined) =>
    value == null || !Number.isFinite(value) ? 'Unavailable' : formatValue(Number(value.toFixed(2)))
  const timeDomain: [number, number] | ['dataMin', 'dataMax'] =
    data.length >= 2 ? [data[0].timestamp, data[data.length - 1].timestamp] : ['dataMin', 'dataMax']
  return (
    <figure ref={host} className="history-instrument" aria-label={title}>
      <figcaption className="history-chart-caption">
        <h3>
          <i aria-hidden="true" style={{ backgroundColor: color }} />
          {title}
        </h3>
        <span>
          Selected <strong>{measurement(selected)}</strong>
        </span>
        <span>
          Min <strong>{measurement(min)}</strong>
        </span>
        <span>
          Avg <strong>{measurement(average)}</strong>
        </span>
        <span>
          Max <strong>{measurement(max)}</strong>
        </span>
        <span>
          {count} / {data.length} buckets
        </span>
      </figcaption>
      <div className="history-plot">
        {near && samples.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={samples} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-line)" vertical={false} />
              <XAxis
                dataKey="timestamp"
                type="number"
                domain={timeDomain}
                scale="time"
                tickFormatter={tickTime.format}
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
                  borderRadius: 'var(--radius)',
                  fontSize: '12px',
                  color: 'var(--text-primary)'
                }}
                cursor={{ stroke: 'var(--border-strong)', strokeDasharray: '3 3' }}
                formatter={(value: unknown) => [
                  typeof value === 'number' && Number.isFinite(value)
                    ? formatValue(value)
                    : 'Unavailable',
                  title
                ]}
                labelFormatter={(label: unknown) =>
                  typeof label === 'number' && Number.isFinite(label) ? rowTime.format(label) : ''
                }
              />
              <Area
                type="linear"
                dataKey="value"
                stroke={color}
                strokeWidth={1.5}
                className="metric-chart-fill"
                fill={color}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
              {timestamp !== null && (
                <ReferenceLine x={timestamp} ifOverflow="hidden" stroke="var(--focus)" />
              )}
              {alertMarkers.map((marker) => (
                <ReferenceLine
                  key={marker.id}
                  x={marker.timestamp}
                  ifOverflow="hidden"
                  shape={<AlertMarkerLine marker={marker} />}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        ) : near ? (
          <p className="history-no-observations">No recorded readings for this metric.</p>
        ) : null}
      </div>
    </figure>
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
  const [page, setPage] = useState(0)
  const [data, setData] = useState<SnapshotRow[]>([])
  const [alertMarkers, setAlertMarkers] = useState<AlertMarker[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)
  const [pinnedTime, setPinnedTime] = useState<number | null>(null)
  const historyRangeMinutes = useUiSettingsStore((state) => state.historyRangeMinutes)
  const setHistoryRangeMinutes = useUiSettingsStore((state) => state.setHistoryRangeMinutes)
  const view = useUiSettingsStore((state) => state.historyView)
  const setView = useUiSettingsStore((state) => state.setHistoryView)
  const visibility = useUiSettingsStore((state) => state.historyMetrics)
  const setHistoryMetricVisible = useUiSettingsStore((state) => state.setHistoryMetricVisible)
  const showAlertMarkers = useUiSettingsStore((state) => state.historyAlertMarkers)
  const setShowAlertMarkers = useUiSettingsStore((state) => state.setHistoryAlertMarkers)
  const selectedRange = RANGES.find((range) => range.minutes === historyRangeMinutes) ?? RANGES[1]
  const pinIndex =
    pinnedTime === null ? -1 : data.findIndex(({ timestamp }) => timestamp === pinnedTime)
  const cursorIndex = pinIndex >= 0 ? pinIndex : Math.max(0, data.length - 1)
  const displayTimestamp = data[cursorIndex]?.timestamp ?? null

  useEffect(() => {
    let cancelled = false
    async function loadHistory() {
      setIsLoading(true)
      setLoadError(null)
      try {
        const [rows, markers] = await Promise.all([
          window.electronAPI.getHistoryDownsampled(selectedRange.minutes),
          showAlertMarkers
            ? window.electronAPI.getAlertMarkers(selectedRange.minutes).catch((error) => {
                console.error('Failed to load alert markers:', error)
                return []
              })
            : []
        ])
        if (cancelled) return
        setData(rows)
        setAlertMarkers(markers)
        setLastRefreshed(new Date())
      } catch (error) {
        if (cancelled) return
        console.error('Failed to load history:', error)
        setLoadError('History could not be loaded. Sentinel will try again automatically.')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    const stopRefresh = scheduleVisibleRefresh(document, 30000, loadHistory)
    return () => {
      cancelled = true
      stopRefresh()
    }
  }, [selectedRange.minutes, showAlertMarkers])

  function exportCsv() {
    const csv = formatHistoryCsv(data)
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
  const markersByType = useMemo(() => {
    const grouped = new Map<MonitoringAlertType, AlertMarker[]>()
    for (const marker of alertMarkers) {
      const markers = grouped.get(marker.type) ?? []
      markers.push(marker)
      grouped.set(marker.type, markers)
    }
    return grouped
  }, [alertMarkers])
  const visibleAlertMarkers = useMemo(
    () =>
      showAlertMarkers
        ? alertMarkers.filter((marker) => visibility[ALERT_METRIC_MAP[marker.type]])
        : [],
    [alertMarkers, showAlertMarkers, visibility]
  )
  const tableAlertMarkers = useMemo(() => {
    const matched = new Map<number, AlertMarker[]>()
    if (data.length === 0 || visibleAlertMarkers.length === 0) return matched

    let snapshotIndex = 0
    for (const marker of visibleAlertMarkers) {
      while (
        snapshotIndex + 1 < data.length &&
        Math.abs(data[snapshotIndex + 1].timestamp - marker.timestamp) <=
          Math.abs(data[snapshotIndex].timestamp - marker.timestamp)
      ) {
        snapshotIndex += 1
      }

      const snapshot = data[snapshotIndex]
      if (Math.abs(snapshot.timestamp - marker.timestamp) <= 60_000) {
        matched.set(snapshot.timestamp, [...(matched.get(snapshot.timestamp) ?? []), marker])
      }
    }
    return matched
  }, [data, visibleAlertMarkers])
  const hasGpuData = data.some((snapshot) => snapshot.gpu_usage !== null)
  const hasBatteryData = data.some((snapshot) => snapshot.battery !== null)
  const pages = Math.max(1, Math.ceil(data.length / ROWS_PER_PAGE))
  const currentPage = Math.min(page, pages - 1)
  const hasCpuTemperatureData = data.some((snapshot) => snapshot.cpu_temperature !== null)
  const hasGpuTemperatureData = data.some((snapshot) => snapshot.gpu_temperature !== null)
  const hasLegacyDiskActivity = data.some(
    (row) => row.disk_read_legacy_ops !== null || row.disk_write_legacy_ops !== null
  )
  const maxNetDown = Math.max(...data.map((d) => d.net_down ?? 0), 1)
  const maxNetUp = Math.max(...data.map((d) => d.net_up ?? 0), 1)
  const maxDiskRead = Math.max(...data.map((d) => d.disk_read ?? 0), 1)
  const maxDiskWrite = Math.max(...data.map((d) => d.disk_write ?? 0), 1)
  const maxCpuTemperature = Math.max(
    ...data.flatMap((snapshot) =>
      snapshot.cpu_temperature === null ? [] : [snapshot.cpu_temperature]
    ),
    100
  )
  const maxGpuTemperature = Math.max(
    ...data.flatMap((snapshot) =>
      snapshot.gpu_temperature === null ? [] : [snapshot.gpu_temperature]
    ),
    100
  )

  return (
    <div className="history-workspace">
      <div className="workspace-header workbench-toolbar">
        <div>
          <h2 className="sr-only">History</h2>
          <p className="track-kicker">Recorded observations</p>
          {lastRefreshed && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Refreshed {formatTime(lastRefreshed)}
            </p>
          )}
          {visibility.disk && hasLegacyDiskActivity && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Older disk activity is available in CSV as operations per second.
            </p>
          )}
        </div>
        <div className="flex w-full flex-wrap items-start gap-4 sm:w-auto sm:justify-end">
          <ControlGroup label="Actions">
            <button
              type="button"
              onClick={exportCsv}
              disabled={data.length === 0}
              className="control"
            >
              Export CSV
            </button>
          </ControlGroup>
          <ControlGroup label="Time range" className="min-w-0 flex-1 sm:flex-none">
            <div className="flex min-w-0 flex-wrap gap-1.5">
              {RANGES.map((range) => (
                <button
                  key={range.minutes}
                  type="button"
                  onClick={() => {
                    setPage(0)
                    setPinnedTime(null)
                    setHistoryRangeMinutes(range.minutes)
                  }}
                  className="control"
                  aria-pressed={selectedRange.minutes === range.minutes}
                >
                  {range.label}
                </button>
              ))}
            </div>
          </ControlGroup>
        </div>
      </div>

      <div className="workbench-toolbar history-filters">
        <ControlGroup label="View" className="flex-1">
          <SegmentedControl
            value={view}
            onChange={setView}
            ariaLabel="History view"
            options={[
              { label: 'Chart', value: 'chart' },
              { label: 'Table', value: 'table' }
            ]}
          />
        </ControlGroup>
        <ControlGroup label="Visible metrics" className="max-w-full">
          <div className="flex min-w-0 flex-wrap gap-2">
            {METRIC_GROUPS.map((metric) => {
              const isVisible = visibility[metric.value]

              return (
                <button
                  key={metric.value}
                  type="button"
                  onClick={() => toggleMetric(metric.value)}
                  className="control history-series-choice"
                  aria-pressed={isVisible}
                >
                  <i aria-hidden="true" style={{ backgroundColor: metric.color }} />
                  {metric.label}
                </button>
              )
            })}
          </div>
        </ControlGroup>
        <ControlGroup label="Alert Markers" className="max-w-full">
          <div>
            <SegmentedControl
              value={showAlertMarkers ? 'on' : 'off'}
              onChange={(value) => setShowAlertMarkers(value === 'on')}
              ariaLabel="Show alert markers"
              options={[
                { label: 'On', value: 'on' },
                { label: 'Off', value: 'off' }
              ]}
            />
            <p className="mt-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
              Show alerts directly on charts.
            </p>
          </div>
        </ControlGroup>
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
                  {showAlertMarkers && <HistoryTableHeader label="Alert" />}
                  {visibility.cpu && (
                    <>
                      <HistoryTableHeader label="CPU" />
                      {hasCpuTemperatureData && <HistoryTableHeader label="CPU Temp" />}
                    </>
                  )}
                  {visibility.memory && <HistoryTableHeader label="Active memory (%)" />}
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
                  {visibility.gpu && (
                    <>
                      {hasGpuData && <HistoryTableHeader label="GPU" />}
                      {hasGpuTemperatureData && <HistoryTableHeader label="GPU Temp" />}
                    </>
                  )}
                  {visibility.battery && hasBatteryData && <HistoryTableHeader label="Battery" />}
                </tr>
              </thead>
              <tbody>
                {data
                  .slice(currentPage * ROWS_PER_PAGE, (currentPage + 1) * ROWS_PER_PAGE)
                  .map((snapshot) => {
                    const rowAlerts = tableAlertMarkers.get(snapshot.timestamp) ?? []
                    const alertTitle = rowAlerts
                      .map(
                        (marker) =>
                          `${marker.title}: ${marker.metricValue.toFixed(1)}% (threshold ${marker.threshold}%)`
                      )
                      .join('\n')

                    return (
                      <tr
                        key={snapshot.timestamp}
                        className="transition-colors hover:bg-[var(--bg-card-hover)]"
                      >
                        <HistoryTableCell value={rowTime.format(snapshot.timestamp)} align="left" />
                        {showAlertMarkers && (
                          <td
                            className="px-3 py-2.5 text-center"
                            title={alertTitle || undefined}
                            aria-label={
                              rowAlerts.length > 0
                                ? `${rowAlerts.length} alert${rowAlerts.length === 1 ? '' : 's'}`
                                : 'No alerts'
                            }
                          >
                            {rowAlerts.length > 0 ? (
                              <span
                                className="font-semibold"
                                style={{
                                  color: rowAlerts.some((marker) => marker.severity === 'critical')
                                    ? 'var(--accent-red)'
                                    : 'var(--accent-amber)'
                                }}
                              >
                                Alert
                              </span>
                            ) : (
                              <span style={{ color: 'var(--text-muted)' }}>—</span>
                            )}
                          </td>
                        )}
                        {visibility.cpu && (
                          <>
                            <HistoryTableCell value={formatPercent(snapshot.cpu_usage)} />
                            {hasCpuTemperatureData && (
                              <HistoryTableCell
                                value={
                                  snapshot.cpu_temperature === null
                                    ? '—'
                                    : formatTemperature(snapshot.cpu_temperature)
                                }
                              />
                            )}
                          </>
                        )}
                        {visibility.memory && (
                          <HistoryTableCell value={formatPercent(snapshot.memory_usage)} />
                        )}
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
                        {visibility.gpu && (
                          <>
                            {hasGpuData && (
                              <HistoryTableCell
                                value={snapshot.gpu_usage === null ? '—' : `${snapshot.gpu_usage}%`}
                              />
                            )}
                            {hasGpuTemperatureData && (
                              <HistoryTableCell
                                value={
                                  snapshot.gpu_temperature === null
                                    ? '—'
                                    : formatTemperature(snapshot.gpu_temperature)
                                }
                              />
                            )}
                          </>
                        )}
                        {visibility.battery && hasBatteryData && (
                          <HistoryTableCell
                            value={snapshot.battery === null ? '—' : `${snapshot.battery}%`}
                          />
                        )}
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <nav
              aria-label="History pages"
              className="flex flex-wrap items-center justify-end gap-3 px-3 py-2 text-xs"
            >
              <button
                type="button"
                disabled={currentPage === 0}
                onClick={() => setPage(currentPage - 1)}
                className="min-h-8 px-2 disabled:opacity-40"
              >
                Previous
              </button>
              <span aria-live="polite">
                Page {currentPage + 1} of {pages}
              </span>
              <button
                type="button"
                disabled={currentPage + 1 === pages}
                onClick={() => setPage(currentPage + 1)}
                className="min-h-8 px-2 disabled:opacity-40"
              >
                Next
              </button>
            </nav>
          )}
        </Card>
      ) : (
        <InspectionTime.Provider value={displayTimestamp}>
          <div className="history-cursor">
            <div>
              <label htmlFor="observation-cursor">Recorded bucket</label>
              {displayTimestamp !== null && (
                <time dateTime={new Date(displayTimestamp).toISOString()}>
                  {rowTime.format(displayTimestamp)}
                </time>
              )}
            </div>
            <input
              id="observation-cursor"
              type="range"
              min={0}
              max={Math.max(0, data.length - 1)}
              value={cursorIndex}
              disabled={data.length < 2}
              aria-valuetext={
                displayTimestamp === null ? 'No observation' : rowTime.format(displayTimestamp)
              }
              onChange={(event) =>
                setPinnedTime(data[event.currentTarget.valueAsNumber]?.timestamp ?? null)
              }
            />
            <button
              type="button"
              className="control"
              disabled={pinIndex < 0}
              onClick={() => setPinnedTime(null)}
            >
              Latest
            </button>
            <span>
              {data.length.toLocaleString()} recorded buckets · {HISTORY_BUCKET_MS / 60000} min
              aggregation
            </span>
          </div>
          <div className="history-tracks">
            {visibility.cpu && (
              <>
                <ChartCard
                  title="CPU Usage"
                  data={data}
                  dataKey="cpu_usage"
                  color="var(--accent-blue)"
                  formatValue={(v) => `${v}%`}
                  domain={[0, 100]}
                  alertMarkers={showAlertMarkers ? markersByType.get('cpu') : undefined}
                />
                {hasCpuTemperatureData && (
                  <ChartCard
                    title="CPU Temperature"
                    data={data}
                    dataKey="cpu_temperature"
                    color="var(--accent-amber)"
                    formatValue={formatTemperature}
                    domain={[0, maxCpuTemperature]}
                    alertMarkers={showAlertMarkers ? markersByType.get('cpu') : undefined}
                  />
                )}
              </>
            )}
            {visibility.memory && (
              <ChartCard
                title="Active memory"
                data={data}
                dataKey="memory_usage"
                color="var(--series-memory)"
                formatValue={(v) => `${v}%`}
                domain={[0, 100]}
                alertMarkers={showAlertMarkers ? markersByType.get('memory') : undefined}
              />
            )}
            {visibility.network && (
              <>
                <ChartCard
                  title="Network Download"
                  data={data}
                  dataKey="net_down"
                  color="var(--series-network)"
                  formatValue={formatSpeed}
                  domain={[0, maxNetDown]}
                />
                <ChartCard
                  title="Network Upload"
                  data={data}
                  dataKey="net_up"
                  color="var(--accent-amber)"
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
                  color="var(--series-network)"
                  formatValue={formatSpeed}
                  domain={[0, maxDiskRead]}
                  alertMarkers={showAlertMarkers ? markersByType.get('disk') : undefined}
                />
                <ChartCard
                  title="Disk Write"
                  data={data}
                  dataKey="disk_write"
                  color="var(--accent-red)"
                  formatValue={formatSpeed}
                  domain={[0, maxDiskWrite]}
                  alertMarkers={showAlertMarkers ? markersByType.get('disk') : undefined}
                />
              </>
            )}
            {visibility.gpu && (
              <>
                {hasGpuData && (
                  <ChartCard
                    title="GPU Usage"
                    data={data}
                    dataKey="gpu_usage"
                    color="var(--series-gpu)"
                    formatValue={(v) => `${v}%`}
                    domain={[0, 100]}
                  />
                )}
                {hasGpuTemperatureData && (
                  <ChartCard
                    title="GPU Temperature"
                    data={data}
                    dataKey="gpu_temperature"
                    color="var(--accent-red)"
                    formatValue={formatTemperature}
                    domain={[0, maxGpuTemperature]}
                  />
                )}
              </>
            )}
            {visibility.battery && hasBatteryData && (
              <ChartCard
                title="Battery"
                data={data}
                dataKey="battery"
                color="var(--series-battery)"
                formatValue={(v) => `${v}%`}
                domain={[0, 100]}
                alertMarkers={showAlertMarkers ? markersByType.get('battery') : undefined}
              />
            )}
          </div>
        </InspectionTime.Provider>
      )}
    </div>
  )
}
