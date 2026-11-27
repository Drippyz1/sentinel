import { useEffect, useState, useMemo, useRef } from 'react'
import type {
  ProcessDetails,
  ProcessIdentity,
  ProcessInfo,
  ProcessPage
} from '../../../shared/contracts'
import { selectProcesses } from '../../../shared/utils/processPage'
import { useProcessMetrics, useProcessMetricsStatus } from '../hooks/useMetrics'
import { formatBytes, formatPercent, formatTime } from '../utils/format'
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
  const [browse, setBrowse] = useState(false)
  const [page, setPage] = useState(0)
  const [result, setResult] = useState<ProcessPage | null>(null)
  const [pageStatus, setPageStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading')
  const [refresh, setRefresh] = useState(0)
  const paused = useUiSettingsStore((state) => state.dashboardPollingPaused)
  const browsing = browse && !paused
  const density = useUiSettingsStore((state) => state.processDensity)
  const setDensity = useUiSettingsStore((state) => state.setProcessDensity)
  const quickFilter = useUiSettingsStore((state) => state.processQuickFilter)
  const setQuickFilter = useUiSettingsStore((state) => state.setProcessQuickFilter)
  const [selectedProcess, setSelectedProcess] = useState<ProcessInfo | null>(null)
  const [processDetails, setProcessDetails] = useState<ProcessDetails | null>(null)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [detailsError, setDetailsError] = useState<string | null>(null)
  const [killError, setKillError] = useState<string | null>(null)
  const killPending = useRef(false)
  const detailsRequest = useRef(0)

  useEffect(() => {
    if (!browsing) return
    let cancelled = false
    const timeout = window.setTimeout(() => {
      setPageStatus('loading')
      void window.electronAPI
        .getProcessPage({
          query: search,
          sort: sortKey,
          direction: sortDir,
          filter: quickFilter,
          page
        })
        .then((answer) => {
          if (cancelled) return
          setResult(answer)
          setPageStatus(answer ? 'ready' : 'unavailable')
        })
        .catch(() => {
          if (cancelled) return
          setResult(null)
          setPageStatus('unavailable')
        })
    }, 160)
    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [browsing, page, quickFilter, refresh, search, sortDir, sortKey])

  const filtered = useMemo(
    () =>
      browsing
        ? (result?.rows ?? [])
        : selectProcesses(processes?.list ?? [], {
            query: search,
            filter: quickFilter,
            sort: sortKey,
            direction: sortDir
          }),
    [browsing, processes, quickFilter, result, search, sortKey, sortDir]
  )

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
    setPage(0)
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
    <div className="process-workspace">
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

      <div className="workspace-header table-workspace-header workbench-toolbar">
        <h2 className="sr-only">Processes</h2>
        <div className="workspace-meta">
          <p>
            {browsing
              ? 'Browse searches the latest cached inventory. Pages update on search, navigation or refresh.'
              : 'Live view: up to 100 processes ranked by CPU. Search covers this sample.'}
          </p>
          {browsing && result && (
            <p>
              {result.matching} matches · {result.captured} captured of {result.reported} reported
              {result.truncated && ' · inventory capped'} · Collected{' '}
              {formatTime(new Date(result.collectedAt))}
            </p>
          )}
          {!browsing && processes && (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {filtered.length} shown from {processes.list.length} sampled · {processes.total}{' '}
              running
            </p>
          )}
          {!browsing && processesUpdatedAt && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Refreshed {formatTime(processesUpdatedAt)}
            </p>
          )}
        </div>
      </div>

      {!processes && <MetricMessage group="processes" name="process data" />}
      <div>
        <div className="workbench-toolbar process-tools">
          <div className="relative workbench-search">
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
              placeholder="Name or PID"
              value={search}
              maxLength={128}
              onChange={(e) => {
                setPage(0)
                setSearch(e.target.value)
              }}
              className="control process-search w-full pr-16"
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setPage(0)
                  setSearch('')
                }}
                className="absolute bottom-1.5 right-2 min-h-7 rounded-md px-2 text-xs"
                style={{ color: 'var(--text-muted)', backgroundColor: 'var(--bg-card)' }}
              >
                Clear
              </button>
            )}
          </div>

          <div className="workspace-actions">
            <button
              className="control"
              type="button"
              disabled={paused}
              aria-pressed={browsing}
              title={paused ? 'Resume live updates to browse' : undefined}
              onClick={() => {
                setPage(0)
                setBrowse(!browse)
              }}
            >
              Browse collected processes
            </button>
            {browsing && (
              <button type="button" className="control" onClick={() => setRefresh((n) => n + 1)}>
                Refresh inventory
              </button>
            )}
            <ControlGroup label="Filter">
              <SegmentedControl
                value={quickFilter}
                onChange={(value) => {
                  setPage(0)
                  setQuickFilter(value)
                }}
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
        </div>

        {browsing && pageStatus !== 'ready' && (
          <p className="workspace-meta" role="status">
            {pageStatus === 'loading'
              ? 'Reading cached process inventory...'
              : 'Current inventory unavailable. Try refreshing after collection resumes.'}
          </p>
        )}
        <div className="table-scroll process-table-scroll">
          <table className="workspace-table" data-density={density}>
            <caption className="sr-only">
              Collected processes. CPU is the provider value and can exceed 100%.
            </caption>
            <thead>
              <tr>
                {(
                  [
                    ['name', 'Name'],
                    ['cpuPercent', 'CPU (%)'],
                    ['memoryBytes', 'Memory'],
                    ['pid', 'PID']
                  ] as const
                ).map(([key, label]) => (
                  <th
                    scope="col"
                    key={key}
                    aria-sort={
                      key === sortKey ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined
                    }
                  >
                    <ColHeader
                      label={label}
                      sortKey={key}
                      current={sortKey}
                      direction={sortDir}
                      onSort={handleSort}
                    />
                  </th>
                ))}
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((process) => {
                const isTopCpu = process.pid === topConsumers.cpuPid
                const isTopMemory = process.pid === topConsumers.memoryPid
                return (
                  <tr key={process.pid} data-highlight={isTopCpu || isTopMemory}>
                    <th scope="row">
                      <button
                        className="process-name"
                        title={process.name}
                        aria-label={`View details for ${process.name}, PID ${process.pid}`}
                        onClick={() => void openProcessDetails(process)}
                      >
                        {process.name}
                      </button>
                      {(isTopCpu || isTopMemory) && density === 'comfortable' && (
                        <span className="process-top">
                          {[isTopCpu && 'Top CPU', isTopMemory && 'Top memory']
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      )}
                    </th>
                    <td className="tabular-nums" style={{ color: cpuColor(process.cpuPercent) }}>
                      {formatPercent(process.cpuPercent)}
                    </td>
                    <td className="tabular-nums">{formatBytes(process.memoryBytes)}</td>
                    <td className="tabular-nums">{process.pid}</td>
                    <td>
                      <button
                        className="control process-terminate"
                        title={`Terminate ${process.name}`}
                        aria-label={`Terminate ${process.name}`}
                        onClick={() => void terminateProcess(process)}
                      >
                        &times;
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {(browsing ? pageStatus === 'ready' : processes) && filtered.length === 0 && (
            <p className="workspace-meta py-8 text-center">No processes match these filters.</p>
          )}
        </div>
        {browsing && result && (
          <div className="workspace-actions mt-3" aria-label="Process inventory pages">
            <button
              className="control"
              disabled={result.page === 0}
              onClick={() => setPage(result.page - 1)}
            >
              Previous
            </button>
            <span className="workspace-meta">
              Page {result.page + 1} of {result.pageCount}
            </span>
            <button
              className="control"
              disabled={result.page + 1 >= result.pageCount}
              onClick={() => setPage(result.page + 1)}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
