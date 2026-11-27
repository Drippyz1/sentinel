import { useEffect, useRef, useState } from 'react'
import { NavLink, useSearchParams } from 'react-router-dom'
import type {
  AppSettings,
  MonitoringAlertRule,
  MonitoringAlerts,
  SettingsReadResult
} from '../../../shared/contracts'
import { DEFAULT_APP_SETTINGS, METRIC_GROUPS, type MetricGroup } from '../../../shared/contracts'
import {
  COLLECTION_INTERVALS,
  resolveCollectionIntervals
} from '../../../shared/utils/collectionPolicy'
import { ToggleSwitch } from '../components/ui/ToggleSwitch'
import {
  AppearanceSettings,
  DashboardSettings,
  MiniSettings,
  StartupPreference,
  TraySettings
} from '../components/settings/AppearanceSettings'

const categories = [
  ['general', 'General'],
  ['appearance', 'Appearance'],
  ['dashboard', 'Dashboard'],
  ['monitoring', 'Monitoring'],
  ['alerts', 'Alerts'],
  ['mini', 'Mini Monitor'],
  ['tray', 'System Tray'],
  ['data', 'Data and Privacy']
] as const

const GROUP_LABELS: Record<MetricGroup, string> = {
  cpu: 'CPU usage',
  cpuTemperature: 'CPU temperature',
  memory: 'Memory',
  diskCapacity: 'Disk capacity',
  diskIo: 'Disk activity',
  network: 'Network traffic',
  gpu: 'GPU',
  battery: 'Battery',
  processes: 'Processes'
}

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
    <section className="preference-section">
      <div className="preference-heading">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>
          {title}
        </h3>
        {description && (
          <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            {description}
          </p>
        )}
      </div>
      <div
        className="divide-y"
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
    <div className="preference-row">
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

export function SettingsPage() {
  const [params] = useSearchParams()
  const category = categories.find(([key]) => key === params.get('section'))?.[0] ?? 'general'
  const [view, setView] = useState<SettingsReadResult>({
    settings: DEFAULT_APP_SETTINGS,
    launchAtLoginActual: null,
    persistenceIssue: null
  })
  const { settings, launchAtLoginActual, persistenceIssue } = view
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const saving = useRef(false)
  const failedSave = useRef<{ next: AppSettings; login: boolean } | null>(null)

  useEffect(() => {
    let current = true
    window.electronAPI
      .getSettings()
      .then((result) => {
        if (current) setView(result)
      })
      .catch(() => {
        if (current) setLoadError(true)
      })
      .finally(() => {
        if (current) setLoading(false)
      })
    return () => {
      current = false
    }
  }, [])

  async function commit(next: AppSettings, login: boolean): Promise<void> {
    if (saving.current || persistenceIssue) return
    saving.current = true
    failedSave.current = null
    setSaveStatus('saving')
    try {
      const result = await window.electronAPI.saveSettings(next, login)
      setView(result)
      if (result.success) {
        setSaveStatus(result.launchAtLoginError ? 'idle' : 'saved')
        return
      }
    } catch (error) {
      console.error('Failed to save settings:', error)
    } finally {
      saving.current = false
    }
    failedSave.current = { next, login }
    setSaveStatus('error')
  }

  function update<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
    void commit({ ...settings, [key]: value }, key === 'launchAtLogin')
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

  function updateCollectionInterval(group: MetricGroup, value: number) {
    const overrides = { ...settings.collectionIntervalsMs }
    if (value === 0) delete overrides[group]
    else overrides[group] = value
    void update('collectionIntervalsMs', overrides)
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
    <fieldset
      className="preferences-workspace min-w-0"
      disabled={saveStatus === 'saving' || Boolean(persistenceIssue)}
    >
      <div className="workbench-toolbar preferences-header">
        <h2 className="sr-only">Settings</h2>
        <p className="track-kicker">Application preferences</p>
        {saveStatus !== 'idle' && (
          <div className="flex items-center gap-2 text-xs">
            <span role={saveStatus === 'error' ? 'alert' : 'status'}>
              {saveStatus === 'saving'
                ? 'Saving settings...'
                : saveStatus === 'saved'
                  ? 'Saved'
                  : 'Could not save settings.'}
            </span>
            {saveStatus === 'error' && !persistenceIssue && (
              <button
                type="button"
                className="underline"
                onClick={() => {
                  const failed = failedSave.current
                  if (failed) void commit(failed.next, failed.login)
                }}
              >
                Retry
              </button>
            )}
          </div>
        )}
      </div>

      <nav className="settings-nav" aria-label="Settings categories">
        {categories.map(([key, label]) => (
          <NavLink
            key={key}
            to={`?section=${key}`}
            className="control"
            aria-current={key === category ? 'page' : false}
            data-current={key === category}
          >
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="preferences-content">
        <h3 className="preferences-page-name">
          {categories.find(([key]) => key === category)?.[1]}
        </h3>
        {category === 'appearance' && <AppearanceSettings />}
        {category === 'dashboard' && <DashboardSettings />}
        {category === 'general' && <StartupPreference />}
        {category === 'mini' && (
          <MiniSettings opacitySupported={isMac || navigator.platform.startsWith('Win')} />
        )}
        {category === 'tray' && <TraySettings />}

        {category === 'general' && isMac && (
          <Section title="macOS">
            <div>
              <Row
                label="Launch at login"
                description="Launch at login may require a packaged macOS build and system permission approval."
              >
                <ToggleSwitch
                  checked={launchAtLoginActual ?? false}
                  disabled={launchAtLoginActual === null}
                  label="Launch at login"
                  onChange={(value) => update('launchAtLogin', value)}
                />
              </Row>
              {launchAtLoginActual !== settings.launchAtLogin && (
                <div
                  role="alert"
                  className="mx-4 mb-3 rounded-lg px-3 py-2.5 text-xs leading-relaxed"
                  style={{
                    color: 'var(--accent-amber)',
                    backgroundColor: 'rgba(245, 158, 11, 0.1)',
                    border: '1px solid rgba(245, 158, 11, 0.3)'
                  }}
                >
                  {launchAtLoginActual === null
                    ? 'Could not read the macOS login-item status.'
                    : `macOS has Launch at Login ${launchAtLoginActual ? 'enabled' : 'disabled'}.`}{' '}
                  Saved preference: {settings.launchAtLogin ? 'enabled' : 'disabled'}.{' '}
                  <button
                    type="button"
                    className="underline"
                    onClick={() => update('launchAtLogin', settings.launchAtLogin)}
                  >
                    Apply saved preference
                  </button>
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

        {category === 'monitoring' && (
          <Section title="Monitoring">
            <Row label="Poll interval" description="Default cadence for live counters">
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
            <details>
              <summary className="cursor-pointer px-4 py-3.5 text-sm font-medium">
                Collection intervals
              </summary>
              {METRIC_GROUPS.map((group) => (
                <Row key={group} label={GROUP_LABELS[group]}>
                  <Select
                    ariaLabel={`${GROUP_LABELS[group]} interval`}
                    value={settings.collectionIntervalsMs[group] ?? 0}
                    onChange={(value) => updateCollectionInterval(group, value)}
                    options={[
                      {
                        label: `Default (${resolveCollectionIntervals(settings.pollIntervalMs)[group] / 1000}s)`,
                        value: 0
                      },
                      ...COLLECTION_INTERVALS.map((ms) => ({
                        label: `${ms / 1000} seconds`,
                        value: ms
                      }))
                    ]}
                  />
                </Row>
              ))}
            </details>
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
        )}

        {category === 'alerts' && (
          <>
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
                label="Active memory"
                description="Notify when the active share of physical memory stays at or above this threshold"
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
          </>
        )}
        {category === 'data' && (
          <Section title="Data and Privacy">
            <Row
              label="History retention"
              description="Metric snapshots are stored locally. This controls how long they are kept."
            >
              <Select
                ariaLabel="History retention"
                value={settings.dataRetentionDays}
                onChange={(v) => update('dataRetentionDays', v)}
                options={[1, 3, 7, 14, 30].map((value) => ({
                  label: `${value} ${value === 1 ? 'day' : 'days'}`,
                  value
                }))}
              />
            </Row>
          </Section>
        )}
      </div>
    </fieldset>
  )
}
