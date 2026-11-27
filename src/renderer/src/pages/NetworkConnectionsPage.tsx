import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  NetworkConnection,
  NetworkConnectionProtocol,
  NetworkConnectionsResult
} from '../../../shared/contracts'
import { Card } from '../components/ui/Card'
import { ControlGroup } from '../components/ui/ControlGroup'
import { SegmentedControl } from '../components/ui/SegmentedControl'

type ProtocolFilter = 'all' | NetworkConnectionProtocol
type GroupMode = 'connections' | 'process'
type ConnectionOrder = 'observed' | 'process' | 'protocol' | 'state' | 'local'
type DisplayRow =
  | { kind: 'connection'; connection: NetworkConnection }
  | { kind: 'group'; key: string; label: string; count: number }

function endpoint(address: string, port: string | null): string {
  if (!port) return address
  return address.includes(':') && !address.startsWith('[')
    ? `[${address}]:${port}`
    : `${address}:${port}`
}

function processLabel(connection: NetworkConnection): string {
  return connection.processName ?? (connection.pid ? `PID ${connection.pid}` : 'Unknown process')
}

function groupKey(connection: NetworkConnection): string {
  return `${connection.processName ?? ''}:${connection.pid ?? 'unknown'}`
}

function rowDetails(connection: NetworkConnection): string {
  return [
    `Process: ${processLabel(connection)}`,
    `PID: ${connection.pid ?? 'Unavailable'}`,
    `Protocol: ${connection.protocol}`,
    `Local: ${endpoint(connection.localAddress, connection.localPort)}`,
    `Remote: ${endpoint(connection.remoteAddress, connection.remotePort)}`,
    `State: ${connection.state ?? 'Unavailable'}`
  ].join('\n')
}

function CopyButton({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await window.electronAPI.copyText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch (error) {
      console.error(`Failed to copy ${label.toLowerCase()}:`, error)
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="min-h-7 rounded-md px-2 text-[10px] font-semibold transition-colors"
      style={{
        color: copied ? 'var(--accent-green)' : 'var(--text-muted)',
        backgroundColor: 'var(--bg-base)',
        border: '1px solid var(--border)'
      }}
      aria-label={`Copy ${label.toLowerCase()}`}
      title={`Copy ${label.toLowerCase()}`}
    >
      {copied ? 'Copied' : label}
    </button>
  )
}

export function NetworkConnectionsPage() {
  const [result, setResult] = useState<NetworkConnectionsResult | null>(null)
  const [search, setSearch] = useState('')
  const [protocol, setProtocol] = useState<ProtocolFilter>('all')
  const [stateFilter, setStateFilter] = useState('all')
  const [groupMode, setGroupMode] = useState<GroupMode>('connections')
  const [order, setOrder] = useState<ConnectionOrder>('observed')
  const [selection, setSelection] = useState<NetworkConnection | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setResult(await window.electronAPI.getNetworkConnections())
    } catch (refreshError) {
      console.error('Failed to load network connections:', refreshError)
      setError('Network connections could not be loaded. Try refreshing in a moment.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const initialLoad = setTimeout(() => void refresh(), 0)
    return () => clearTimeout(initialLoad)
  }, [refresh])

  const states = useMemo(
    () =>
      Array.from(
        new Set(
          (result?.connections ?? [])
            .map((connection) => connection.state)
            .filter((state): state is string => Boolean(state))
        )
      ).sort(),
    [result]
  )

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    const matches = (result?.connections ?? []).filter((connection) => {
      if (protocol !== 'all' && connection.protocol !== protocol) return false
      if (stateFilter !== 'all' && connection.state !== stateFilter) return false
      if (!query) return true

      return [
        connection.processName,
        connection.pid?.toString(),
        connection.protocol,
        connection.localAddress,
        connection.localPort,
        connection.remoteAddress,
        connection.remotePort,
        connection.state
      ].some((value) => value?.toLowerCase().includes(query))
    })
    if (order === 'observed') return matches
    const key = (connection: NetworkConnection) => {
      if (order === 'process') return processLabel(connection)
      if (order === 'local') return endpoint(connection.localAddress, connection.localPort)
      return connection[order] ?? ''
    }
    return matches.sort((a, b) => key(a).localeCompare(key(b), undefined, { numeric: true }))
  }, [order, protocol, result, search, stateFilter])
  const inspected = selection && filtered.includes(selection) ? selection : null

  const rows = useMemo(() => {
    if (groupMode === 'connections') {
      return filtered.map<DisplayRow>((connection) => ({ kind: 'connection', connection }))
    }

    const groups = new Map<string, NetworkConnection[]>()
    for (const connection of filtered) {
      const key = groupKey(connection)
      const existing = groups.get(key)
      if (existing) existing.push(connection)
      else groups.set(key, [connection])
    }

    return Array.from(groups.entries())
      .sort(([, left], [, right]) => processLabel(left[0]).localeCompare(processLabel(right[0])))
      .flatMap<DisplayRow>(([key, connections]) => [
        { kind: 'group', key, label: processLabel(connections[0]), count: connections.length },
        ...connections.map<DisplayRow>((connection) => ({ kind: 'connection', connection }))
      ])
  }, [filtered, groupMode])

  const lastRefreshed = result
    ? new Date(result.collectedAt).toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit'
      })
    : null

  return (
    <div className="connections-workspace">
      <div className="workspace-header workbench-toolbar">
        <div>
          <h2 className="sr-only">Network Connections</h2>
          <p className="track-kicker">Local endpoint inventory</p>
        </div>
        <div className="flex items-center gap-3">
          {lastRefreshed && (
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Refreshed {lastRefreshed}
            </span>
          )}
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="control control--accent"
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {result?.supported && result.limitation && (
        <p className="workspace-meta mb-3">{result.limitation}</p>
      )}
      <div className="workbench-toolbar connection-tools">
        <div className="workbench-search">
          <label
            htmlFor="network-search"
            className="mb-1.5 block text-xs font-semibold"
            style={{ color: 'var(--text-muted)' }}
          >
            Search connections
          </label>
          <div className="relative">
            <input
              id="network-search"
              type="search"
              placeholder="Process, PID, address, port, or state"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="control w-full pr-16"
              style={{
                color: 'var(--text-primary)',
                backgroundColor: 'var(--bg-base)',
                border: '1px solid var(--border-strong)'
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
        </div>

        <div className="workspace-actions">
          <ControlGroup label="Protocol">
            <SegmentedControl
              value={protocol}
              onChange={setProtocol}
              ariaLabel="Network protocol filter"
              options={[
                { label: 'All', value: 'all' },
                { label: 'TCP', value: 'TCP' },
                { label: 'UDP', value: 'UDP' }
              ]}
            />
          </ControlGroup>
          <ControlGroup label="Sort">
            <select
              className="control"
              aria-label="Connection sort order"
              value={order}
              onChange={(event) => {
                const next = event.currentTarget.value
                if (
                  next === 'observed' ||
                  next === 'process' ||
                  next === 'protocol' ||
                  next === 'state' ||
                  next === 'local'
                )
                  setOrder(next)
              }}
            >
              <option value="observed">Observed</option>
              <option value="process">Process</option>
              <option value="protocol">Protocol</option>
              <option value="state">State</option>
              <option value="local">Local endpoint</option>
            </select>
          </ControlGroup>
          <ControlGroup label="State">
            <select
              value={stateFilter}
              onChange={(event) => setStateFilter(event.target.value)}
              className="min-h-10 max-w-full rounded-lg px-3 py-2 text-xs outline-none"
              style={{
                color: 'var(--text-primary)',
                backgroundColor: 'var(--bg-base)',
                border: '1px solid var(--border)'
              }}
              aria-label="Connection state filter"
            >
              <option value="all">All states</option>
              {states.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </select>
          </ControlGroup>
          <ControlGroup label="View">
            <SegmentedControl
              value={groupMode}
              onChange={setGroupMode}
              ariaLabel="Network connection grouping"
              options={[
                { label: 'Connections', value: 'connections' },
                { label: 'Group by process', value: 'process' }
              ]}
            />
          </ControlGroup>
          <p className="ml-auto text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>
            {filtered.length} of {result?.connections.length ?? 0} connections
          </p>
        </div>
      </div>
      <Card className="connection-surface">
        {error ? (
          <div
            role="alert"
            className="rounded-lg px-4 py-10 text-center text-sm"
            style={{ color: 'var(--accent-red)', backgroundColor: 'var(--bg-base)' }}
          >
            <p>{error}</p>
            <button
              type="button"
              onClick={() => void refresh()}
              className="mt-3 min-h-9 rounded-lg px-3 text-xs font-semibold"
              style={{ color: 'var(--text-primary)', border: '1px solid var(--border)' }}
            >
              Try Again
            </button>
          </div>
        ) : result && !result.supported ? (
          <div
            className="rounded-lg px-4 py-10 text-center"
            style={{ color: 'var(--text-muted)', backgroundColor: 'var(--bg-base)' }}
          >
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Network connections are unavailable
            </p>
            <p className="mt-1 text-xs">{result.limitation}</p>
          </div>
        ) : loading && !result ? (
          <div
            className="rounded-lg px-4 py-10 text-center text-sm"
            style={{ color: 'var(--text-muted)', backgroundColor: 'var(--bg-base)' }}
          >
            Loading active connections...
          </div>
        ) : filtered.length === 0 ? (
          <div
            className="rounded-lg px-4 py-10 text-center"
            style={{ color: 'var(--text-muted)', backgroundColor: 'var(--bg-base)' }}
          >
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {result?.connections.length
                ? 'No connections match these filters'
                : 'No active connections found'}
            </p>
            <p className="mt-1 text-xs">
              {result?.connections.length
                ? 'Adjust the search or filters to see more results.'
                : 'Refresh after network activity begins.'}
            </p>
          </div>
        ) : (
          <div
            className="connection-scroll"
            role="region"
            tabIndex={0}
            aria-label="Connection results"
          >
            <div className="connection-table" role="table" aria-label="Connections">
              <div className="connection-row connection-heading" role="row">
                <span role="columnheader">Process</span>
                <span role="columnheader">PID</span>
                <span role="columnheader">Protocol</span>
                <span role="columnheader">Local</span>
                <span role="columnheader">Remote</span>
                <span role="columnheader">State</span>
                <span role="columnheader">Copy</span>
              </div>
              <div className="max-h-[calc(100vh-340px)] min-h-32 overflow-y-auto" role="rowgroup">
                {rows.map((row, index) => {
                  if (row.kind === 'group') {
                    return (
                      <div
                        key={`group-${row.key}`}
                        role="row"
                        className="sticky top-0 z-10 flex items-center justify-between px-3 py-2 text-xs font-semibold"
                        style={{
                          color: 'var(--text-primary)',
                          backgroundColor: 'var(--bg-card)',
                          borderBottom: '1px solid var(--border)'
                        }}
                      >
                        <span role="cell" aria-colspan={6}>
                          {row.label}
                        </span>
                        <span
                          role="cell"
                          className="tabular-nums"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {row.count} connection{row.count === 1 ? '' : 's'}
                        </span>
                      </div>
                    )
                  }

                  const connection = row.connection
                  const local = endpoint(connection.localAddress, connection.localPort)
                  const remote = endpoint(connection.remoteAddress, connection.remotePort)
                  const key = `${groupKey(connection)}:${connection.protocol}:${local}:${remote}:${index}`

                  return (
                    <div
                      key={key}
                      className="connection-row"
                      role="row"
                      data-selected={connection === inspected}
                    >
                      <span
                        role="cell"
                        className="truncate text-sm font-medium"
                        style={{ color: 'var(--text-primary)' }}
                        title={processLabel(connection)}
                      >
                        <button
                          type="button"
                          className="connection-select"
                          aria-pressed={connection === inspected}
                          onClick={() => setSelection(connection === inspected ? null : connection)}
                        >
                          {processLabel(connection)}
                        </button>
                      </span>
                      <span
                        role="cell"
                        className="text-xs font-mono"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {connection.pid ?? '—'}
                      </span>
                      <span
                        role="cell"
                        className="text-xs font-semibold"
                        style={{
                          color:
                            connection.protocol === 'TCP'
                              ? 'var(--accent-blue)'
                              : 'var(--accent-purple)'
                        }}
                      >
                        {connection.protocol}
                      </span>
                      <span
                        role="cell"
                        className="truncate text-xs font-mono"
                        style={{ color: 'var(--text-primary)' }}
                        title={local}
                      >
                        {local}
                      </span>
                      <span
                        role="cell"
                        className="truncate text-xs font-mono"
                        style={{ color: 'var(--text-primary)' }}
                        title={remote}
                      >
                        {remote}
                      </span>
                      <span
                        role="cell"
                        className="truncate text-xs font-medium"
                        style={{ color: 'var(--text-muted)' }}
                        title={connection.state ?? 'Unavailable'}
                      >
                        {connection.state ?? '—'}
                      </span>
                      <div className="flex gap-1" role="cell">
                        <CopyButton label="Local" value={local} />
                        <CopyButton label="Remote" value={remote} />
                        <CopyButton label="Row" value={rowDetails(connection)} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </Card>
      {inspected && (
        <section className="connection-inspector" aria-label="Selected connection">
          <header>
            <h3>{processLabel(inspected)}</h3>
            <button type="button" className="control" onClick={() => setSelection(null)}>
              Close details
            </button>
          </header>
          <dl>
            <dt>Protocol</dt>
            <dd>{inspected.protocol}</dd>
            <dt>State</dt>
            <dd>{inspected.state ?? 'Unavailable'}</dd>
            <dt>Local</dt>
            <dd>{endpoint(inspected.localAddress, inspected.localPort)}</dd>
            <dt>Remote</dt>
            <dd>{endpoint(inspected.remoteAddress, inspected.remotePort)}</dd>
            <dt>Process ID</dt>
            <dd>{inspected.pid ?? 'Unavailable'}</dd>
            <dt>Observed</dt>
            <dd>{lastRefreshed}</dd>
          </dl>
        </section>
      )}
    </div>
  )
}
