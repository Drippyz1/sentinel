import { useState, useMemo } from 'react'
import { useProcessMetrics } from '../../hooks/useMetrics'
import { formatBytes } from '../../utils/format'
import { Card } from '../ui/Card'

type SortKey = 'cpuPercent' | 'memoryBytes' | 'name' | 'pid'
type SortDir = 'asc' | 'desc'

function cpuColor(pct: number): string {
  if (pct >= 20) return 'var(--accent-red)'
  if (pct >= 5)  return 'var(--accent-amber)'
  return 'var(--accent-green)'
}

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

  const [search,    setSearch]    = useState('')
  const [sortKey,   setSortKey]   = useState<SortKey>('cpuPercent')
  const [sortDir,   setSortDir]   = useState<SortDir>('desc')

  const filtered = useMemo(() => {
    if (!processes) return []

    return processes.list
      .filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => {
        const aVal = a[sortKey]
        const bVal = b[sortKey]

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
      <input
        type="text"
        placeholder="Search..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full text-sm px-3 py-2 rounded-lg mb-3 outline-none"
        style={{
          backgroundColor: 'var(--bg-base)',
          border:          '1px solid var(--border)',
          color:           'var(--text-primary)',
        }}
      />

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

      <div className="overflow-y-auto" style={{ maxHeight: '320px' }}>
        {filtered.length === 0 && (
          <p className="text-sm text-center py-8" style={{ color: 'var(--text-muted)' }}>
            {search ? 'No matches.' : 'Loading...'}
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
            <span
              className="text-sm truncate font-medium"
              style={{ color: 'var(--text-primary)' }}
              title={process.name}
            >
              {process.name}
            </span>
            <span
              className="text-sm font-mono font-medium"
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
          </div>
        ))}
      </div>
    </Card>
  )
}