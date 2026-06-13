import { useState, useMemo } from 'react'
import { useProcessMetrics, useProcessMetricsStatus } from '../hooks/useMetrics'
import { formatBytes, formatTime } from '../utils/format'
import { Card } from '../components/ui/Card'
import { SegmentedControl } from '../components/ui/SegmentedControl'
import { useUiSettingsStore } from '../store/uiSettingsStore'

type SortKey = 'cpuPercent' | 'memoryBytes' | 'name' | 'pid'
type SortDir = 'asc' | 'desc'

function cpuColor(pct: number): string {
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

// ── Kill confirmation dialog ───────────────────────────────────────────────

function KillDialog({
  name,
  pid,
  onConfirm,
  onCancel
}: {
  name: string
  pid: number
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={onCancel}
    >
      <div
        className="rounded-xl p-5 w-80 shadow-xl"
        style={{
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
          Kill process?
        </h3>
        <p className="text-xs mb-4 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          This will send SIGKILL to <span style={{ color: 'var(--text-primary)' }}>{name}</span>{' '}
          (PID {pid}). Any unsaved work in that process will be lost.
        </p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{
              backgroundColor: 'var(--bg-base)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)'
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{
              backgroundColor: 'var(--accent-red)',
              color: 'white',
              border: 'none'
            }}
          >
            Kill Process
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────

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
  const [selected, setSelected] = useState<number | null>(null) // hovered PID
  const [killing, setKilling] = useState<{ pid: number; name: string } | null>(null)
  const [killError, setKillError] = useState<string | null>(null)

  const filtered = useMemo(() => {
    if (!processes) return []
    return processes.list
      .filter((process) => {
        if (quickFilter === 'cpu') return process.cpuPercent >= 5
        if (quickFilter === 'memory') return process.memoryPercent >= 1
        return true
      })
      .filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => {
        const aVal = a[sortKey]
        const bVal = b[sortKey]
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

    let topCpu = processes.list[0]
    let topMemory = processes.list[0]

    for (const process of processes.list.slice(1)) {
      if (process.cpuPercent > topCpu.cpuPercent) topCpu = process
      if (process.memoryBytes > topMemory.memoryBytes) topMemory = process
    }

    return { cpuPid: topCpu.pid, memoryPid: topMemory.pid }
  }, [processes])

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  async function handleKillConfirm() {
    if (!killing) return
    try {
      const result = await window.electronAPI.killProcess(killing.pid)
      if (!result.success) {
        setKillError(result.error ?? 'Failed to kill process')
      }
    } catch {
      setKillError('Failed to kill process')
    } finally {
      setKilling(null)
    }
  }

  return (
    <div>
      {killing && (
        <KillDialog
          name={killing.name}
          pid={killing.pid}
          onConfirm={handleKillConfirm}
          onCancel={() => setKilling(null)}
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
          <div className="min-w-0">
            <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>
              Quick filter
            </p>
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
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>
              Row density
            </p>
            <SegmentedControl
              value={density}
              onChange={setDensity}
              ariaLabel="Process list density"
              options={[
                { label: 'Compact', value: 'compact' },
                { label: 'Comfortable', value: 'comfortable' }
              ]}
            />
          </div>
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
              const isHovered = selected === process.pid

              return (
                <div
                  key={process.pid}
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
                  onMouseEnter={() => setSelected(process.pid)}
                  onMouseLeave={() => setSelected(null)}
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
                    {process.cpuPercent.toFixed(1)}%
                  </span>
                  <span className="text-sm font-mono" style={{ color: 'var(--text-muted)' }}>
                    {formatBytes(process.memoryBytes)}
                  </span>
                  <span className="text-sm font-mono" style={{ color: 'var(--text-muted)' }}>
                    {process.pid}
                  </span>

                  {/* Kill button — only visible on hover */}
                  <button
                    onClick={() => setKilling({ pid: process.pid, name: process.name })}
                    title={`Kill ${process.name}`}
                    aria-label={`Kill ${process.name}`}
                    onFocus={() => setSelected(process.pid)}
                    onBlur={() => setSelected(null)}
                    className="flex items-center justify-center w-6 h-6 rounded transition-all"
                    style={{
                      opacity: selected === process.pid ? 1 : 0,
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

            {filtered.length === 0 && (
              <p className="text-sm text-center py-12" style={{ color: 'var(--text-muted)' }}>
                {processes ? 'No processes match these filters.' : 'Loading...'}
              </p>
            )}
          </div>
        </div>
      </Card>
    </div>
  )
}
