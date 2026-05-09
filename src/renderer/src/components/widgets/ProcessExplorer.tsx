import { useState, useMemo } from 'react'
import { useProcessMetrics } from '../../hooks/useMetrics'
import { formatBytes } from '../../utils/format'
import { Card } from '../ui/Card'

// Which column are we currently sorting by
type SortKey = 'cpuPercent' | 'memoryBytes' | 'name' | 'pid'
type SortDir = 'asc' | 'desc'

// Color for the CPU usage badge
function cpuColor(pct: number): string {
  if (pct >= 20) return 'var(--accent-red)'
  if (pct >= 5)  return 'var(--accent-amber)'
  return 'var(--accent-green)'
}

// Column header button — shows a sort arrow when active
function ColHeader({
  label, sortKey, current, direction, onSort
}: {
  label:     string
  sortKey:   SortKey
  current:   SortKey
  direction: SortDir
  onSort:    (key: SortKey) => void
}) {
  const isActive = current === sortKey
  return (
    <button
      onClick={() => onSort(sortKey)}
      className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider
                 hover:opacity-100 transition-opacity"
      style={{ color: isActive ? 'var(--text-primary)' : 'var(--text-muted)' }}
    >
      {label}
      <span style={{ opacity: isActive ? 1 : 0 }}>
        {direction === 'desc' ? '↓' : '↑'}
      </span>
    </button>
  )
}

export function ProcessExplorer() {
  const processes = useProcessMetrics()

  // Local state — only this component cares about these values
  const [search,    setSearch]    = useState('')
  const [sortKey,   setSortKey]   = useState<SortKey>('cpuPercent')
  const [sortDir,   setSortDir]   = useState<SortDir>('desc')

  // useMemo recalculates only when its dependencies change
  // Without this, we'd re-sort 60 items on every single render
  const filtered = useMemo(() => {
    if (!processes) return []

    return processes.list
      .filter(p =>
        // Case-insensitive name search
        p.name.toLowerCase().includes(search.toLowerCase())
      )
      .sort((a, b) => {
        const aVal = a[sortKey]
        const bVal = b[sortKey]

        // Handle string vs number sorting
        if (typeof aVal === 'string' && typeof bVal === 'string') {
          return sortDir === 'asc'
            ? aVal.localeCompare(bVal)
            : bVal.localeCompare(aVal)
        }

        return sortDir === 'asc'
          ? (aVal as number) - (bVal as number)
          : (bVal as number) - (aVal as number)
      })
  }, [processes, search, sortKey, sortDir])

  // When clicking a column: if it's already the active sort,
  // flip direction. Otherwise switch to that column descending.
  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  return (
    <Card
      title="Processes"
      subtitle={processes ? `${processes.total} total` : undefined}
    >
      {/* Search bar */}
      <input
        type="text"
        placeholder="Filter processes..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full text-sm px-3 py-2 rounded-lg mb-3 outline-none"
        style={{
          backgroundColor: 'var(--bg-base)',
          border:          '1px solid var(--border)',
          color:           'var(--text-primary)',
        }}
      />

      {/* Table header */}
      <div
        className="grid gap-2 px-2 pb-2 mb-1 text-xs"
        style={{
          gridTemplateColumns: '1fr 80px 90px 60px',
          borderBottom: '1px solid var(--border)'
        }}
      >
        <ColHeader label="Name"   sortKey="name"        current={sortKey} direction={sortDir} onSort={handleSort} />
        <ColHeader label="CPU"    sortKey="cpuPercent"  current={sortKey} direction={sortDir} onSort={handleSort} />
        <ColHeader label="Memory" sortKey="memoryBytes" current={sortKey} direction={sortDir} onSort={handleSort} />
        <ColHeader label="PID"    sortKey="pid"         current={sortKey} direction={sortDir} onSort={handleSort} />
      </div>

      {/* Process rows — scrollable */}
      <div className="overflow-y-auto" style={{ maxHeight: '320px' }}>
        {filtered.length === 0 && (
          <p className="text-sm text-center py-8" style={{ color: 'var(--text-muted)' }}>
            {search ? 'No processes match your search' : 'Loading processes...'}
          </p>
        )}

        {filtered.map(process => (
          <div
            key={process.pid}
            className="grid gap-2 px-2 py-1.5 rounded-lg items-center
                       hover:opacity-80 transition-opacity"
            style={{
              gridTemplateColumns: '1fr 80px 90px 60px',
              backgroundColor: 'transparent',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLDivElement).style.backgroundColor = 'var(--bg-card-hover)'
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent'
            }}
          >
            {/* Name */}
            <span
              className="text-sm truncate font-medium"
              style={{ color: 'var(--text-primary)' }}
              title={process.name}
            >
              {process.name}
            </span>

            {/* CPU % */}
            <span
              className="text-sm font-mono font-medium"
              style={{ color: cpuColor(process.cpuPercent) }}
            >
              {process.cpuPercent.toFixed(1)}%
            </span>

            {/* Memory */}
            <span className="text-sm font-mono" style={{ color: 'var(--text-muted)' }}>
              {formatBytes(process.memoryBytes)}
            </span>

            {/* PID */}
            <span className="text-sm font-mono" style={{ color: 'var(--text-muted)' }}>
              {process.pid}
            </span>
          </div>
        ))}
      </div>
    </Card>
  )
}