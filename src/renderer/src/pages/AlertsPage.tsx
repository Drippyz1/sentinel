import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import type {
  AlertAnalytics,
  AlertHistoryEntry,
  MonitoringAlertType
} from '../../../shared/contracts'
import { Card } from '../components/ui/Card'
import { ControlGroup } from '../components/ui/ControlGroup'
import { SegmentedControl } from '../components/ui/SegmentedControl'
import { useAlertHistoryStore } from '../store/alertHistoryStore'

type AlertFilter = 'all' | MonitoringAlertType | 'warning' | 'critical' | 'unread'

const ALERT_TYPE_LABELS: Record<MonitoringAlertType, string> = {
  cpu: 'CPU',
  memory: 'Memory',
  disk: 'Disk',
  battery: 'Battery'
}

function AlertAnalyticsPanel({
  analytics,
  loading
}: {
  analytics: AlertAnalytics | null
  loading: boolean
}) {
  if (loading) {
    return (
      <Card>
        <div className="py-8 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
          Loading alert analytics...
        </div>
      </Card>
    )
  }

  if (!analytics) {
    return (
      <Card>
        <div className="py-8 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
          Alert analytics are unavailable.
        </div>
      </Card>
    )
  }

  const lastAlert = analytics.lastAlertTimestamp
    ? new Date(analytics.lastAlertTimestamp).toLocaleString([], {
        dateStyle: 'medium',
        timeStyle: 'short'
      })
    : 'No alerts yet'
  const overview = [
    { label: 'Last 24 hours', value: analytics.alertsLast24Hours.toString() },
    { label: 'Last 7 days', value: analytics.alertsLast7Days.toString() },
    { label: 'Unread', value: analytics.unreadAlerts.toString() },
    {
      label: 'Most common',
      value: analytics.mostCommonType ? ALERT_TYPE_LABELS[analytics.mostCommonType] : 'None'
    },
    { label: 'Last alert', value: lastAlert }
  ]

  return (
    <Card>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        {overview.map((item) => (
          <div
            key={item.label}
            className="min-w-0 rounded-lg px-3 py-2.5"
            style={{ backgroundColor: 'var(--bg-base)', border: '1px solid var(--border)' }}
          >
            <p
              className="text-[10px] font-semibold uppercase tracking-wide"
              style={{ color: 'var(--text-muted)' }}
            >
              {item.label}
            </p>
            <p
              className="mt-1 truncate text-sm font-semibold tabular-nums"
              style={{ color: 'var(--text-primary)' }}
              title={item.value}
            >
              {item.value}
            </p>
          </div>
        ))}
      </div>

      <div
        className="mt-4 grid gap-4 border-t pt-4 sm:grid-cols-2"
        style={{ borderColor: 'var(--border)' }}
      >
        <div>
          <p
            className="mb-2 text-[10px] font-semibold uppercase tracking-wide"
            style={{ color: 'var(--text-muted)' }}
          >
            By type
          </p>
          <div className="flex flex-wrap gap-2">
            {(Object.entries(analytics.countsByType) as [MonitoringAlertType, number][]).map(
              ([type, count]) => (
                <span
                  key={type}
                  className="rounded-md px-2 py-1 text-xs tabular-nums"
                  style={{ color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                >
                  {ALERT_TYPE_LABELS[type]} {count}
                </span>
              )
            )}
          </div>
        </div>
        <div>
          <p
            className="mb-2 text-[10px] font-semibold uppercase tracking-wide"
            style={{ color: 'var(--text-muted)' }}
          >
            By severity
          </p>
          <div className="flex flex-wrap gap-2">
            <span
              className="rounded-md px-2 py-1 text-xs tabular-nums"
              style={{ color: 'var(--accent-amber)', border: '1px solid var(--border)' }}
            >
              Warning {analytics.countsBySeverity.warning}
            </span>
            <span
              className="rounded-md px-2 py-1 text-xs tabular-nums"
              style={{ color: 'var(--accent-red)', border: '1px solid var(--border)' }}
            >
              Critical {analytics.countsBySeverity.critical}
            </span>
          </div>
        </div>
      </div>
    </Card>
  )
}

function AlertHistoryItem({
  alert,
  selected,
  onSelect
}: {
  alert: AlertHistoryEntry
  selected: boolean
  onSelect: () => void
}) {
  const timestamp = new Date(alert.timestamp).toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short'
  })

  return (
    <li className="alert-ledger-row" data-unread={!alert.read} data-selected={selected}>
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="alert-read-state">{alert.read ? 'Read' : 'Unread'}</span>
          <p className="truncate text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            <button
              className="incident-select"
              type="button"
              aria-pressed={selected}
              onClick={onSelect}
            >
              {alert.title}
            </button>
          </p>
          <span
            className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase"
            style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
          >
            {ALERT_TYPE_LABELS[alert.type]}
          </span>
        </div>
        <span className="shrink-0 text-[11px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
          {timestamp}
        </span>
      </div>
      <p className="mt-2 text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
        Recorded {alert.metricValue.toFixed(1)}% · Threshold {alert.threshold}% ·{' '}
        <span
          className="capitalize"
          style={{
            color: alert.severity === 'critical' ? 'var(--accent-red)' : 'var(--accent-amber)'
          }}
        >
          {alert.severity}
        </span>
      </p>
    </li>
  )
}

export function AlertsPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const alerts = useAlertHistoryStore((state) => state.alerts)
  const analytics = useAlertHistoryStore((state) => state.analytics)
  const initialized = useAlertHistoryStore((state) => state.initialized)
  const loadFailed = useAlertHistoryStore((state) => state.loadFailed)
  const initialize = useAlertHistoryStore((state) => state.initialize)
  const markAllRead = useAlertHistoryStore((state) => state.markAllRead)
  const clear = useAlertHistoryStore((state) => state.clear)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<AlertFilter>('all')
  const [actionPending, setActionPending] = useState<'read' | 'clear' | null>(null)
  const [actionFailed, setActionFailed] = useState(false)
  const [selection, setSelection] = useState<AlertHistoryEntry['id'] | null>(null)

  useEffect(() => {
    void initialize()
  }, [initialize])

  useEffect(() => {
    const command = location.state?.command
    if (command !== 'focus-alert-history' && command !== 'focus-alert-analytics') return
    const targetId = command === 'focus-alert-history' ? 'alert-history' : 'alert-analytics'
    const scrollTimer = setTimeout(() => {
      document.getElementById(targetId)?.scrollIntoView({
        block: 'start',
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'instant'
          : 'smooth'
      })
      navigate(location.pathname, { replace: true, state: null })
    }, 0)
    return () => clearTimeout(scrollTimer)
  }, [location.pathname, location.state, navigate])

  const unreadCount = analytics?.unreadAlerts ?? alerts.filter((alert) => !alert.read).length
  const filteredAlerts = useMemo(() => {
    const query = search.trim().toLowerCase()
    return alerts.filter((alert) => {
      if (filter === 'unread' && alert.read) return false
      if (
        (filter === 'cpu' || filter === 'memory' || filter === 'disk' || filter === 'battery') &&
        alert.type !== filter
      ) {
        return false
      }
      if ((filter === 'warning' || filter === 'critical') && alert.severity !== filter) {
        return false
      }
      if (!query) return true

      return [
        alert.title,
        alert.message,
        ALERT_TYPE_LABELS[alert.type],
        alert.severity,
        alert.metricValue.toString(),
        alert.threshold.toString()
      ].some((value) => value.toLowerCase().includes(query))
    })
  }, [alerts, filter, search])

  async function runAction(action: 'read' | 'clear') {
    setActionPending(action)
    setActionFailed(false)
    try {
      await (action === 'read' ? markAllRead() : clear())
    } catch (error) {
      setActionFailed(true)
      console.error(
        `Failed to ${action === 'read' ? 'mark alerts as read' : 'clear alerts'}:`,
        error
      )
    } finally {
      setActionPending(null)
    }
  }

  const inspected = filteredAlerts.find((entry) => entry.id === selection) ?? filteredAlerts[0]
  return (
    <div className="alerts-workspace">
      <div className="workspace-header workbench-toolbar">
        <div>
          <h2 className="sr-only">Alerts</h2>
          <p className="track-kicker">Event ledger</p>
        </div>
        <div className="workspace-actions">
          <Link className="control" to="/settings?section=alerts">
            Configure alerts
          </Link>
          <button
            type="button"
            disabled={unreadCount === 0 || actionPending !== null}
            onClick={() => void runAction('read')}
            className="min-h-10 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-40"
            style={{ color: 'var(--text-primary)', border: '1px solid var(--border)' }}
          >
            {actionPending === 'read' ? 'Marking...' : 'Mark all as read'}
          </button>
          <button
            type="button"
            disabled={alerts.length === 0 || actionPending !== null}
            onClick={() => void runAction('clear')}
            className="min-h-10 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-40"
            style={{ color: 'var(--accent-red)', border: '1px solid var(--border)' }}
          >
            {actionPending === 'clear' ? 'Clearing...' : 'Clear History'}
          </button>
        </div>
      </div>

      {(loadFailed || actionFailed) && (
        <p role="alert" className="mb-4 text-sm" style={{ color: 'var(--accent-amber)' }}>
          {loadFailed
            ? 'Alert history could not be loaded.'
            : 'Alert history could not be updated.'}
        </p>
      )}
      <div className="incident-workbench">
        <section id="alert-history" className="scroll-mt-4" hidden={loadFailed}>
          <Card>
            <div className="workbench-search incident-search">
              <label
                htmlFor="alert-search"
                className="mb-1.5 block text-xs font-semibold"
                style={{ color: 'var(--text-muted)' }}
              >
                Search alerts
              </label>
              <div className="relative">
                <input
                  id="alert-search"
                  type="search"
                  placeholder="Title, message, type, severity, or value"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="min-h-10 w-full rounded-lg py-2.5 pl-3.5 pr-16 text-sm outline-none"
                  style={{
                    color: 'var(--text-primary)',
                    backgroundColor: 'var(--bg-base)',
                    border: '1px solid var(--accent-blue)'
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

            <div className="workbench-toolbar incident-filters">
              <ControlGroup label="Filter">
                <SegmentedControl
                  value={filter}
                  onChange={setFilter}
                  ariaLabel="Alert history filter"
                  options={[
                    { label: 'All', value: 'all' },
                    { label: 'CPU', value: 'cpu' },
                    { label: 'Memory', value: 'memory' },
                    { label: 'Disk', value: 'disk' },
                    { label: 'Battery', value: 'battery' },
                    { label: 'Warning', value: 'warning' },
                    { label: 'Critical', value: 'critical' },
                    { label: 'Unread', value: 'unread' }
                  ]}
                />
              </ControlGroup>
              <p className="text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>
                {filteredAlerts.length} of {alerts.length} alerts
              </p>
            </div>

            {!initialized ? (
              <div className="py-12 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                Loading alert history...
              </div>
            ) : alerts.length === 0 ? (
              <div
                className="rounded-lg px-4 py-12 text-center"
                style={{ color: 'var(--text-muted)', backgroundColor: 'var(--bg-base)' }}
              >
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  No alerts triggered yet.
                </p>
                <p className="mt-1 text-xs">Triggered monitoring alerts will appear here.</p>
              </div>
            ) : filteredAlerts.length === 0 ? (
              <div
                className="rounded-lg px-4 py-12 text-center"
                style={{ color: 'var(--text-muted)', backgroundColor: 'var(--bg-base)' }}
              >
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  No alerts match these filters.
                </p>
                <p className="mt-1 text-xs">Adjust the search or filter to see more results.</p>
              </div>
            ) : (
              <ul className="incident-list">
                {filteredAlerts.map((alert) => (
                  <AlertHistoryItem
                    key={alert.id}
                    alert={alert}
                    selected={inspected?.id === alert.id}
                    onSelect={() => setSelection(alert.id)}
                  />
                ))}
              </ul>
            )}
          </Card>
        </section>
        {!loadFailed && (
          <aside className="incident-inspector" aria-label="Alert inspection">
            {inspected && (
              <section className="incident-detail">
                <h3 className="track-kicker">Selected event</h3>
                <strong>{inspected.title}</strong>
                <p>{inspected.message}</p>
                <dl>
                  <dt>Observed</dt>
                  <dd>{new Date(inspected.timestamp).toLocaleString()}</dd>
                  <dt>Recorded value</dt>
                  <dd>{inspected.metricValue.toFixed(1)}%</dd>
                  <dt>Threshold</dt>
                  <dd>{inspected.threshold}%</dd>
                  <dt>Severity</dt>
                  <dd className="capitalize">{inspected.severity}</dd>
                  <dt>Status</dt>
                  <dd>{inspected.read ? 'Read' : 'Unread'}</dd>
                </dl>
              </section>
            )}
            <section id="alert-analytics">
              <AlertAnalyticsPanel analytics={analytics} loading={!initialized} />
            </section>
          </aside>
        )}
      </div>
    </div>
  )
}
