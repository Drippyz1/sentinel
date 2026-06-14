import { useEffect, useState } from 'react'
import type {
  AlertHistoryEntry,
  AppSettings,
  MonitoringAlertRule,
  MonitoringAlerts
} from '../../../shared/contracts'
import { ToggleSwitch } from '../components/ui/ToggleSwitch'
import { useAlertHistoryStore } from '../store/alertHistoryStore'

const DEFAULT_SETTINGS: AppSettings = {
  settingsVersion: 1,
  launchAtLogin: false,
  hideFromDock: false,
  pollIntervalMs: 2000,
  tempUnit: 'C',
  dataRetentionDays: 7,
  anomalySensitivity: 'balanced',
  anomalyNotifications: true,
  monitoringAlerts: {
    cpu: { enabled: false, thresholdPercent: 90 },
    memory: { enabled: false, thresholdPercent: 90 },
    disk: { enabled: false, thresholdPercent: 90 },
    battery: { enabled: false, thresholdPercent: 20 },
    cooldownMinutes: 15
  },
  ui: {
    dashboardPollingPaused: false,
    dashboardWidgets: {
      cpu: true,
      memory: true,
      gpu: true,
      disk: true,
      network: true,
      battery: true,
      anomalies: true
    },
    historyView: 'chart',
    historyMetrics: {
      cpu: true,
      memory: true,
      network: true,
      disk: true,
      gpu: true,
      battery: true
    },
    historyRangeMinutes: 60,
    processDensity: 'comfortable',
    processQuickFilter: 'all',
    systemView: 'advanced'
  }
}

// ── Reusable primitives ────────────────────────────────────────────────────

function Section({
  title,
  description,
  children
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="mb-7">
      <div className="mb-3">
        <h3
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: 'var(--text-muted)' }}
        >
          {title}
        </h3>
        {description && (
          <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            {description}
          </p>
        )}
      </div>
      <div
        className="rounded-xl divide-y"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
      >
        {children}
      </div>
    </section>
  )
}

function Row({
  label,
  description,
  children
}: {
  label: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between px-4 py-3.5 gap-4">
      <div className="flex flex-col min-w-0">
        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          {label}
        </span>
        {description && (
          <span
            className="text-xs mt-1 leading-relaxed"
            style={{ color: 'var(--text-muted)', maxWidth: '34rem' }}
          >
            {description}
          </span>
        )}
      </div>
      <div className="flex max-w-full flex-shrink-0 items-center sm:ml-auto">{children}</div>
    </div>
  )
}

function Select<T extends string | number>({
  value,
  options,
  onChange,
  ariaLabel,
  disabled = false
}: {
  value: T
  options: { label: string; value: T }[]
  onChange: (v: T) => void
  ariaLabel: string
  disabled?: boolean
}) {
  return (
    <select
      aria-label={ariaLabel}
      disabled={disabled}
      value={value}
      onChange={(e) => {
        const raw = e.target.value
        onChange((typeof value === 'number' ? Number(raw) : raw) as T)
      }}
      className="max-w-full min-h-9 text-sm rounded-lg px-3 py-2 pr-8 appearance-none focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      style={{
        background: 'var(--bg-base)',
        color: 'var(--text-primary)',
        border: '1px solid var(--border)',
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 6px center'
      }}
    >
      {options.map((o) => (
        <option key={String(o.value)} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

function AlertSettingRow({
  label,
  description,
  rule,
  thresholdOptions,
  onChange
}: {
  label: string
  description: string
  rule: MonitoringAlertRule
  thresholdOptions: number[]
  onChange: (rule: MonitoringAlertRule) => void
}) {
  return (
    <Row label={label} description={description}>
      <div className="flex flex-wrap items-center justify-end gap-3">
        <Select
          ariaLabel={`${label} threshold`}
          disabled={!rule.enabled}
          value={rule.thresholdPercent}
          onChange={(thresholdPercent) => onChange({ ...rule, thresholdPercent })}
          options={thresholdOptions.map((threshold) => ({
            label: `${threshold}%`,
            value: threshold
          }))}
        />
        <ToggleSwitch
          checked={rule.enabled}
          label={`Enable ${label.toLowerCase()} alert`}
          onChange={(enabled) => onChange({ ...rule, enabled })}
        />
      </div>
    </Row>
  )
}

function AlertHistoryItem({ alert }: { alert: AlertHistoryEntry }) {
  const timestamp = new Date(alert.timestamp).toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short'
  })

  return (
    <li
      className="rounded-lg px-3 py-3"
      style={{
        backgroundColor: alert.read ? 'var(--bg-base)' : 'rgba(59, 130, 246, 0.08)',
        border: `1px solid ${alert.read ? 'var(--border)' : 'rgba(59, 130, 246, 0.3)'}`
      }}
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {!alert.read && (
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: 'var(--accent-blue)' }}
              aria-label="Unread"
            />
          )}
          <p className="truncate text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {alert.title}
          </p>
        </div>
        <span className="shrink-0 text-[11px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
          {timestamp}
        </span>
      </div>
      <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        {alert.message}
      </p>
      <p className="mt-1.5 text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
        Recorded {alert.metricValue.toFixed(1)}% · Threshold {alert.threshold}% ·{' '}
        <span
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

function AlertHistorySection() {
  const alerts = useAlertHistoryStore((state) => state.alerts)
  const initialized = useAlertHistoryStore((state) => state.initialized)
  const markAllRead = useAlertHistoryStore((state) => state.markAllRead)
  const clear = useAlertHistoryStore((state) => state.clear)
  const unreadCount = alerts.filter((alert) => !alert.read).length
  const [actionPending, setActionPending] = useState<'read' | 'clear' | null>(null)

  async function runAction(action: 'read' | 'clear') {
    setActionPending(action)
    try {
      await (action === 'read' ? markAllRead() : clear())
    } catch (error) {
      console.error(
        `Failed to ${action === 'read' ? 'mark alerts as read' : 'clear alerts'}:`,
        error
      )
    } finally {
      setActionPending(null)
    }
  }

  return (
    <Section
      title="Alert History"
      description="The latest 100 monitoring alerts are stored locally on this device."
    >
      <div className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {unreadCount > 0
              ? `${unreadCount} unread alert${unreadCount === 1 ? '' : 's'}`
              : 'All alerts read'}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={unreadCount === 0 || actionPending !== null}
              onClick={() => void runAction('read')}
              className="min-h-9 rounded-lg px-3 py-2 text-xs font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-40"
              style={{ color: 'var(--text-primary)', border: '1px solid var(--border)' }}
            >
              {actionPending === 'read' ? 'Marking...' : 'Mark all as read'}
            </button>
            <button
              type="button"
              disabled={alerts.length === 0 || actionPending !== null}
              onClick={() => void runAction('clear')}
              className="min-h-9 rounded-lg px-3 py-2 text-xs font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-40"
              style={{ color: 'var(--accent-red)', border: '1px solid var(--border)' }}
            >
              {actionPending === 'clear' ? 'Clearing...' : 'Clear History'}
            </button>
          </div>
        </div>

        {!initialized ? (
          <div className="py-8 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
            Loading alert history...
          </div>
        ) : alerts.length === 0 ? (
          <div
            className="rounded-lg px-4 py-8 text-center text-sm"
            style={{ color: 'var(--text-muted)', backgroundColor: 'var(--bg-base)' }}
          >
            No alerts triggered yet.
          </div>
        ) : (
          <ul className="max-h-96 space-y-2 overflow-y-auto pr-1">
            {alerts.map((alert) => (
              <AlertHistoryItem key={alert.id} alert={alert} />
            ))}
          </ul>
        )}
      </div>
    </Section>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────

export function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [launchAtLoginError, setLaunchAtLoginError] = useState<string | null>(null)
  const [savingLaunchAtLogin, setSavingLaunchAtLogin] = useState(false)
  const initializeAlertHistory = useAlertHistoryStore((state) => state.initialize)

  useEffect(() => {
    window.electronAPI
      .getSettings()
      .then(setSettings)
      .catch((error) => {
        console.error('Failed to load settings:', error)
        setLoadError(true)
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    void initializeAlertHistory()
  }, [initializeAlertHistory])

  async function update<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    const previous = settings
    const next = { ...settings, [key]: value }
    setSettings(next)
    setSaveStatus('idle')
    if (key === 'launchAtLogin') setSavingLaunchAtLogin(true)

    try {
      const result = await window.electronAPI.saveSettings(next)
      if (!result.success) {
        setSettings({
          ...previous,
          launchAtLogin: result.settings.launchAtLogin
        })
        setSaveStatus('error')
        return
      }

      setSettings(result.settings)
      if (key === 'launchAtLogin') {
        if (result.launchAtLoginError) {
          const requestedAction = next.launchAtLogin ? 'enable' : 'disable'
          const developmentNote = result.isPackaged
            ? ''
            : ' Development builds may only support Launch at Login reliably when packaged and signed.'
          setLaunchAtLoginError(
            `macOS did not allow Sentinel to ${requestedAction} Launch at Login. The toggle now reflects the current system setting.${developmentNote}`
          )
          return
        }
        setLaunchAtLoginError(null)
      }

      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 1500)
    } catch (error) {
      console.error('Failed to save settings:', error)
      setSettings(previous)
      setSaveStatus('error')
    } finally {
      if (key === 'launchAtLogin') setSavingLaunchAtLogin(false)
    }
  }

  function updateAlert(
    alert: keyof Omit<MonitoringAlerts, 'cooldownMinutes'>,
    rule: MonitoringAlertRule
  ) {
    void update('monitoringAlerts', {
      ...settings.monitoringAlerts,
      [alert]: rule
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Loading settings…
        </span>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="flex items-center justify-center h-40 text-center">
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Settings could not be loaded
          </p>
          <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
            Restart Sentinel and try again.
          </p>
        </div>
      </div>
    )
  }

  const isMac = navigator.platform.toUpperCase().includes('MAC')

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-7">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
          Settings
        </h2>
        {saveStatus !== 'idle' && (
          <span
            className="text-xs transition-opacity duration-300"
            style={{
              color: saveStatus === 'saved' ? 'var(--accent-green)' : 'var(--accent-red)'
            }}
          >
            {saveStatus === 'saved' ? 'Saved' : 'Could not save'}
          </span>
        )}
      </div>

      {/* ── System — macOS only ──────────────────── */}
      {isMac && (
        <Section title="System">
          <div>
            <Row
              label="Launch at login"
              description="Launch at login may require a packaged macOS build and system permission approval."
            >
              <ToggleSwitch
                checked={settings.launchAtLogin}
                disabled={savingLaunchAtLogin}
                label="Launch at login"
                onChange={(value) => update('launchAtLogin', value)}
              />
            </Row>
            {launchAtLoginError && (
              <div
                role="alert"
                className="mx-4 mb-3 rounded-lg px-3 py-2.5 text-xs leading-relaxed"
                style={{
                  color: 'var(--accent-amber)',
                  backgroundColor: 'rgba(245, 158, 11, 0.1)',
                  border: '1px solid rgba(245, 158, 11, 0.3)'
                }}
              >
                {launchAtLoginError}
              </div>
            )}
          </div>
          <Row
            label="Hide from Dock"
            description="Remove the app icon from the macOS Dock — still accessible via menu bar"
          >
            <ToggleSwitch
              checked={settings.hideFromDock}
              label="Hide from Dock"
              onChange={(value) => update('hideFromDock', value)}
            />
          </Row>
        </Section>
      )}

      {/* ── Monitoring ───────────────────────────── */}
      <Section title="Monitoring">
        <Row label="Poll interval" description="How often hardware metrics are refreshed">
          <Select
            ariaLabel="Poll interval"
            value={settings.pollIntervalMs}
            onChange={(v) => update('pollIntervalMs', v)}
            options={[
              { label: '1 second', value: 1000 },
              { label: '2 seconds', value: 2000 },
              { label: '5 seconds', value: 5000 },
              { label: '10 seconds', value: 10000 }
            ]}
          />
        </Row>
        <Row label="Temperature unit" description="Unit used across all thermal readings">
          <Select
            ariaLabel="Temperature unit"
            value={settings.tempUnit}
            onChange={(v) => update('tempUnit', v)}
            options={[
              { label: 'Celsius (°C)', value: 'C' },
              { label: 'Fahrenheit (°F)', value: 'F' }
            ]}
          />
        </Row>
      </Section>

      <Section
        title="Alerts"
        description="Native notifications are sent after a threshold remains exceeded for 10 seconds."
      >
        <AlertSettingRow
          label="CPU usage"
          description="Notify when total processor usage stays at or above this threshold"
          rule={settings.monitoringAlerts.cpu}
          thresholdOptions={[50, 60, 70, 75, 80, 85, 90, 95, 100]}
          onChange={(rule) => updateAlert('cpu', rule)}
        />
        <AlertSettingRow
          label="Memory usage"
          description="Notify when system memory usage stays at or above this threshold"
          rule={settings.monitoringAlerts.memory}
          thresholdOptions={[50, 60, 70, 75, 80, 85, 90, 95, 100]}
          onChange={(rule) => updateAlert('memory', rule)}
        />
        <AlertSettingRow
          label="Disk usage"
          description="Notify when any mounted volume stays at or above this capacity threshold"
          rule={settings.monitoringAlerts.disk}
          thresholdOptions={[50, 60, 70, 75, 80, 85, 90, 95, 100]}
          onChange={(rule) => updateAlert('disk', rule)}
        />
        <AlertSettingRow
          label="Low battery"
          description="Notify when battery charge stays at or below this level while not charging"
          rule={settings.monitoringAlerts.battery}
          thresholdOptions={[5, 10, 15, 20, 25, 30, 40, 50]}
          onChange={(rule) => updateAlert('battery', rule)}
        />
        <Row
          label="Notification cooldown"
          description="Minimum time between monitoring alert notifications"
        >
          <Select
            ariaLabel="Notification cooldown"
            value={settings.monitoringAlerts.cooldownMinutes}
            onChange={(cooldownMinutes) =>
              void update('monitoringAlerts', {
                ...settings.monitoringAlerts,
                cooldownMinutes
              })
            }
            options={[
              { label: '5 minutes', value: 5 },
              { label: '10 minutes', value: 10 },
              { label: '15 minutes', value: 15 },
              { label: '30 minutes', value: 30 },
              { label: '60 minutes', value: 60 }
            ]}
          />
        </Row>
      </Section>

      <AlertHistorySection />

      {/* ── Data & Storage ───────────────────────── */}
      <Section title="Data & Storage">
        <Row label="History retention" description="How long metric snapshots are kept on disk">
          <Select
            ariaLabel="History retention"
            value={settings.dataRetentionDays}
            onChange={(v) => update('dataRetentionDays', v)}
            options={[
              { label: '1 day', value: 1 },
              { label: '3 days', value: 3 },
              { label: '7 days', value: 7 },
              { label: '14 days', value: 14 },
              { label: '30 days', value: 30 }
            ]}
          />
        </Row>
      </Section>

      {/* ── Anomaly Detection ────────────────────── */}
      <Section title="Anomaly Detection">
        <Row label="Sensitivity" description="How aggressively unusual activity is flagged">
          <Select
            ariaLabel="Anomaly sensitivity"
            value={settings.anomalySensitivity}
            onChange={(v) => update('anomalySensitivity', v)}
            options={[
              { label: 'Sensitive — flags ~5% of readings', value: 'sensitive' },
              { label: 'Balanced — flags ~1% of readings', value: 'balanced' },
              { label: 'Conservative — flags ~0.3% of readings', value: 'conservative' }
            ]}
          />
        </Row>
        <Row
          label="Anomaly notifications"
          description="Send a system notification when an anomaly is detected"
        >
          <ToggleSwitch
            checked={settings.anomalyNotifications}
            label="Anomaly notifications"
            onChange={(value) => update('anomalyNotifications', value)}
          />
        </Row>
      </Section>
    </div>
  )
}
