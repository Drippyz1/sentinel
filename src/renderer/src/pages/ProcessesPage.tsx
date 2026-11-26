import { useState, useMemo, useRef } from 'react'
import type { ProcessDetails, ProcessIdentity, ProcessInfo } from '../../../shared/contracts'
import { useProcessMetrics, useProcessMetricsStatus } from '../hooks/useMetrics'
import { formatBytes, formatPercent, formatTime } from '../utils/format'
import { Card } from '../components/ui/Card'
import { SegmentedControl } from '../components/ui/SegmentedControl'
import { ControlGroup } from '../components/ui/ControlGroup'
import { useUiSettingsStore } from '../store/uiSettingsStore'
import { ProcessDetailsDrawer } from '../components/processes/ProcessDetailsDrawer'
import { MetricMessage } from '../components/widgets/MetricMessage'

type SortKey = 'cpuPercent' | 'memoryBytes' | 'name' | 'pid'
type SortDir = 'asc' | 'desc'

function cpuColor(pct: number | null): string {
  if (pct === null) return 'var(--text-muted)'
  if (pct >= 20) return 'var(--accent-red)'
  if (pct >= 5) return 'var(--accent-amber)'
  return 'var(--accent-green)'
}

function ColHeader({
  label,
  sortKey,
  current,
  direction,
  onSort,
  align = 'left'
}: {
  label: string
  sortKey: SortKey
  current: SortKey
  direction: SortDir
  onSort: (key: SortKey) => void
  align?: 'left' | 'right'
}) {
  const isActive = current === sortKey
  return (
    <button
      onClick={() => onSort(sortKey)}
      className={`flex items-center gap-1 text-xs font-semibold uppercase
                  tracking-wider transition-opacity
                  ${align === 'right' ? 'ml-auto' : ''}`}
      style={{ color: isActive ? 'var(--text-primary)' : 'var(--text-muted)' }}
    >
      {label}
      <span style={{ opacity: isActive ? 1 : 0 }}>{direction === 'desc' ? '↓' : '↑'}</span>
    </button>
  )
}

export function ProcessesPage() {
  const processes = useProcessMetrics()
  const processesUpdatedAt = useProcessMetricsStatus()
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('cpuPercent')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const density = useUiSettingsStore((state) => state.processDensity)
  const setDensity = useUiSettingsStore((state) => state.setProcessDensity)
  const quickFilter = useUiSettingsStore((state) => state.processQuickFilter)
  const setQuickFilter = useUiSettingsStore((state) => state.setProcessQuickFilter)
  const [hoveredPid, setHoveredPid] = useState<number | null>(null)
  const [selectedProcess, setSelectedProcess] = useState<ProcessInfo | null>(null)
  const [processDetails, setProcessDetails] = useState<ProcessDetails | null>(null)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [detailsError, setDetailsError] = useState<string | null>(null)
  const [killError, setKillError] = useState<string | null>(null)
  const killPending = useRef(false)
  const detailsRequest = useRef(0)

  const filtered = useMemo(() => {
    if (!processes) return []
    const query = search.toLowerCase()
    return processes.list
      .filter((process) => {
        if (quickFilter === 'cpu') return (process.cpuPercent ?? 0) >= 5
        if (quickFilter === 'memory') return (process.memoryPercent ?? 0) >= 1
        return true
      })
      .filter((p) => p.name.toLowerCase().includes(query))
      .sort((a, b) => {
        const aVal = a[sortKey]
        const bVal = b[sortKey]
        if (aVal === null || bVal === null) return Number(aVal === null) - Number(bVal === null)
        if (typeof aVal === 'string' && typeof bVal === 'string') {
          return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
        }
        return sortDir === 'asc'
          ? (aVal as number) - (bVal as number)
          : (bVal as number) - (aVal as number)
      })
  }, [processes, quickFilter, search, sortKey, sortDir])

  const topConsumers = useMemo(() => {
    if (!processes || processes.list.length === 0) {
      return { cpuPid: null, memoryPid: null }
    }

    let topCpu: ProcessInfo | undefined
    let topMemory: ProcessInfo | undefined

    for (const process of processes.list) {
      if ((process.cpuPercent ?? -1) > (topCpu?.cpuPercent ?? -1)) topCpu = process
      if ((process.memoryBytes ?? -1) > (topMemory?.memoryBytes ?? -1)) topMemory = process
    }

    return { cpuPid: topCpu?.pid ?? null, memoryPid: topMemory?.pid ?? null }
  }, [processes])

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  async function terminateProcess(identity: ProcessIdentity) {
    if (killPending.current) return
    killPending.current = true
    setKillError(null)
    try {
      const result = await window.electronAPI.killProcess(identity)
      if (result.cancelled) return
      if (!result.success) {
        setKillError(result.error ?? 'Failed to kill process')
      } else if (selectedProcess?.pid === identity.pid) {
        setSelectedProcess(null)
      }
    } catch {
      setKillError('Failed to kill process')
    } finally {
      killPending.current = false
    }
  }

  async function openProcessDetails(process: ProcessInfo) {
    const request = ++detailsRequest.current
    setSelectedProcess(process)
    setProcessDetails(null)
    setDetailsError(null)
    setDetailsLoading(true)
    try {
      const details = await window.electronAPI.getProcessDetails(process.pid)
      if (request !== detailsRequest.current) return
      if (details?.name === process.name && details.started === process.started) {
        setProcessDetails(details)
      } else {
        setDetailsError('Detailed information is unavailable for this process.')
      }
    } catch {
      if (request === detailsRequest.current)
        setDetailsError('Detailed information could not be loaded.')
    } finally {
      if (request === detailsRequest.current) setDetailsLoading(false)
    }
  }

  return (
    <div>
      {selectedProcess && (
        <ProcessDetailsDrawer
          process={selectedProcess}
          details={processDetails}
          loading={detailsLoading}
          error={detailsError}
          onClose={() => setSelectedProcess(null)}
          onKill={() => void terminateProcess(selectedProcess)}
        />
      )}

      {killError && (
        <div
          className="flex items-center justify-between px-4 py-2 rounded-lg mb-3 text-xs"
          style={{
            backgroundColor: 'rgba(239,68,68,0.1)',
            border: '1px solid var(--accent-red)',
            color: 'var(--accent-red)'
          }}
        >
          {killError}
          <button onClick={() => setKillError(null)} style={{ opacity: 0.7 }}>
            ✕
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
          Processes
        </h2>
        <div className="text-right">
          {processes && (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {processes.total} total — showing {filtered.length}
            </p>
          )}
          {processesUpdatedAt && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Refreshed {formatTime(processesUpdatedAt)}
            </p>
          )}
        </div>
      </div>

      {!processes && <MetricMessage group="processes" name="process data" />}
      <Card>
        <div className="relative mb-4">
          <label
            htmlFor="process-search"
            className="mb-1.5 block text-xs font-semibold"
            style={{ color: 'var(--text-muted)' }}
          >
            Search processes
          </label>
          <input
            id="process-search"
            type="text"
            placeholder="Name or application"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full min-h-10 text-sm pl-3.5 pr-16 py-2.5 rounded-lg outline-none transition-colors"
            style={{
              backgroundColor: 'var(--bg-base)',
              border: '1px solid var(--accent-blue)',
              color: 'var(--text-primary)'
            }}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute bottom-1.5 right-2 min-h-7 rounded-md px-2 text-xs"
              style={{ color: 'var(--text-muted)', backgroundColor: 'var(--bg-card)' }}
            >
              Clear
            </button>
          )}
        </div>

        <div
          className="flex flex-wrap items-end justify-between gap-4 mb-4 rounded-xl p-3"
          style={{ backgroundColor: 'var(--bg-base)', border: '1px solid var(--border)' }}
        >
          <ControlGroup label="Filter">
            <SegmentedControl
              value={quickFilter}
              onChange={setQuickFilter}
              ariaLabel="Process filter"
              options={[
                { label: 'All', value: 'all' },
                { label: 'High CPU', value: 'cpu' },
                { label: 'High Memory', value: 'memory' }
              ]}
            />
          </ControlGroup>
          <ControlGroup label="Density">
            <SegmentedControl
              value={density}
              onChange={setDensity}
              ariaLabel="Process list density"
              options={[
                { label: 'Compact', value: 'compact' },
                { label: 'Comfortable', value: 'comfortable' }
              ]}
            />
          </ControlGroup>
        </div>

        <div className="overflow-x-auto">
          <div
            className="grid gap-4 px-3 pb-2 mb-1 min-w-[620px]"
            style={{
              gridTemplateColumns: 'minmax(180px, 1fr) 100px 120px 80px 32px',
              borderBottom: '1px solid var(--border)'
            }}
          >
            <ColHeader
              label="Name"
              sortKey="name"
              current={sortKey}
              direction={sortDir}
              onSort={handleSort}
            />
            <ColHeader
              label="CPU"
              sortKey="cpuPercent"
              current={sortKey}
              direction={sortDir}
              onSort={handleSort}
            />
            <ColHeader
              label="Memory"
              sortKey="memoryBytes"
              current={sortKey}
              direction={sortDir}
              onSort={handleSort}
            />
            <ColHeader
              label="PID"
              sortKey="pid"
              current={sortKey}
              direction={sortDir}
              onSort={handleSort}
            />
            <div />
          </div>

          <div
            className="overflow-y-auto min-w-[620px]"
            style={{ maxHeight: 'calc(100vh - 340px)' }}
          >
            {filtered.map((process) => {
              const isTopCpu = process.pid === topConsumers.cpuPid
              const isTopMemory = process.pid === topConsumers.memoryPid
              const isHovered = hoveredPid === process.pid

              return (
                <div
                  key={process.pid}
                  role="button"
                  tabIndex={0}
                  aria-label={`View details for ${process.name}, PID ${process.pid}`}
                  className={`grid gap-4 px-3 rounded-lg items-center group transition-colors ${
                    density === 'compact' ? 'py-1' : 'py-2.5'
                  }`}
                  style={{
                    gridTemplateColumns: 'minmax(180px, 1fr) 100px 120px 80px 32px',
                    backgroundColor: isHovered
                      ? 'var(--bg-card-hover)'
                      : isTopCpu || isTopMemory
                        ? 'rgba(59, 130, 246, 0.05)'
                        : 'transparent',
                    boxShadow:
                      isTopCpu || isTopMemory
                        ? 'inset 2px 0 0 var(--accent-blue)'
                        : 'inset 0 0 0 transparent'
                  }}
                  onClick={() => void openProcessDetails(process)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void openProcessDetails(process)
                  }}
                  onMouseEnter={() => setHoveredPid(process.pid)}
                  onMouseLeave={() => setHoveredPid(null)}
                  onFocus={() => setHoveredPid(process.pid)}
                  onBlur={() => setHoveredPid(null)}
                >
                  <div className="min-w-0">
                    <span
                      className="block text-sm font-medium truncate"
                      style={{ color: 'var(--text-primary)' }}
                      title={process.name}
                    >
                      {process.name}
                    </span>
                    {(isTopCpu || isTopMemory) && density === 'comfortable' && (
                      <span
                        className="text-[10px] font-semibold"
                        style={{ color: 'var(--accent-blue)' }}
                      >
                        {[isTopCpu && 'Top CPU', isTopMemory && 'Top Memory']
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    )}
                  </div>
                  <span
                    className="text-sm font-mono"
                    style={{ color: cpuColor(process.cpuPercent) }}
                  >
                    {formatPercent(process.cpuPercent)}
                  </span>
                  <span className="text-sm font-mono" style={{ color: 'var(--text-muted)' }}>
                    {formatBytes(process.memoryBytes)}
                  </span>
                  <span className="text-sm font-mono" style={{ color: 'var(--text-muted)' }}>
                    {process.pid}
                  </span>

                  <button
                    onClick={(event) => {
                      event.stopPropagation()
                      void terminateProcess(process)
                    }}
                    onKeyDown={(event) => event.stopPropagation()}
                    title={`Kill ${process.name}`}
                    aria-label={`Kill ${process.name}`}
                    onFocus={() => setHoveredPid(process.pid)}
                    onBlur={() => setHoveredPid(null)}
                    className="flex items-center justify-center w-6 h-6 rounded transition-all"
                    style={{
                      opacity: hoveredPid === process.pid ? 1 : 0,
                      backgroundColor: 'rgba(239,68,68,0.15)',
                      color: 'var(--accent-red)',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '14px',
                      lineHeight: 1
                    }}
                  >
                    ✕
                  </button>
                </div>
              )
            })}

            {processes && filtered.length === 0 && (
              <p className="text-sm text-center py-12" style={{ color: 'var(--text-muted)' }}>
                No processes match these filters.
              </p>
            )}
          </div>
        </div>
      </Card>
    </div>
  )
}
