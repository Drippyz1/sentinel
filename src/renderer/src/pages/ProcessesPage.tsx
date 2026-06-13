import { useState, useMemo } from 'react'
import { useProcessMetrics } from '../hooks/useMetrics'
import { formatBytes } from '../utils/format'
import { Card } from '../components/ui/Card'

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
          backgroundColor: 'var(--card-bg)',
          border: '1px solid var(--border)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
          Kill process?
        </h3>
        <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
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
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('cpuPercent')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [selected, setSelected] = useState<number | null>(null) // hovered PID
  const [killing, setKilling] = useState<{ pid: number; name: string } | null>(null)
  const [killError, setKillError] = useState<string | null>(null)

  const filtered = useMemo(() => {
    if (!processes) return []
    return processes.list
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
  }, [processes, search, sortKey, sortDir])

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

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
          Processes
        </h2>
        {processes && (
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {processes.total} total — showing top {filtered.length}
          </span>
        )}
      </div>

      <Card>
        <input
          type="text"
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full text-sm px-3 py-2 rounded-lg mb-4 outline-none"
          style={{
            backgroundColor: 'var(--bg-base)',
            border: '1px solid var(--border)',
            color: 'var(--text-primary)'
          }}
        />

        {/* Column headers — now with an extra column for the kill button */}
        <div
          className="grid gap-4 px-3 pb-2 mb-1"
          style={{
            gridTemplateColumns: '1fr 100px 120px 80px 32px',
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
          <div /> {/* spacer for kill column */}
        </div>

        <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
          {filtered.map((process) => (
            <div
              key={process.pid}
              className="grid gap-4 px-3 py-2 rounded-lg items-center group"
              style={{
                gridTemplateColumns: '1fr 100px 120px 80px 32px',
                backgroundColor: selected === process.pid ? 'var(--bg-card-hover)' : 'transparent'
              }}
              onMouseEnter={() => setSelected(process.pid)}
              onMouseLeave={() => setSelected(null)}
            >
              <span
                className="text-sm font-medium truncate"
                style={{ color: 'var(--text-primary)' }}
                title={process.name}
              >
                {process.name}
              </span>
              <span className="text-sm font-mono" style={{ color: cpuColor(process.cpuPercent) }}>
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
          ))}

          {filtered.length === 0 && (
            <p className="text-sm text-center py-12" style={{ color: 'var(--text-muted)' }}>
              {search ? 'No matches.' : 'Loading...'}
            </p>
          )}
        </div>
      </Card>
    </div>
  )
}
