import { useEffect, useState } from 'react'
import type { AppSettings } from '../../../shared/contracts'
import { ToggleSwitch } from '../components/ui/ToggleSwitch'

const DEFAULT_SETTINGS: AppSettings = {
  settingsVersion: 1,
  launchAtLogin: false,
  hideFromDock: false,
  pollIntervalMs: 2000,
  tempUnit: 'C',
  dataRetentionDays: 7,
  anomalySensitivity: 'balanced',
  anomalyNotifications: true,
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-7">
      <h3
        className="text-xs font-semibold uppercase tracking-widest mb-3"
        style={{ color: 'var(--text-muted)' }}
      >
        {title}
      </h3>
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
  onChange
}: {
  value: T
  options: { label: string; value: T }[]
  onChange: (v: T) => void
}) {
  return (
    <select
      value={value}
      onChange={(e) => {
        const raw = e.target.value
        onChange((typeof value === 'number' ? Number(raw) : raw) as T)
      }}
      className="max-w-full min-h-9 text-sm rounded-lg px-3 py-2 pr-8 appearance-none focus:outline-none"
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

// ── Main page ──────────────────────────────────────────────────────────────

export function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

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

  async function update<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    const previous = settings
    const next = { ...settings, [key]: value }
    setSettings(next)
    setSaveStatus('idle')

    try {
      const saved = await window.electronAPI.saveSettings(next)
      if (!saved) throw new Error('Settings write failed')
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 1500)
    } catch (error) {
      console.error('Failed to save settings:', error)
      setSettings(previous)
      setSaveStatus('error')
    }
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
          <Row label="Launch at login" description="Start Sentinel automatically when you log in">
            <ToggleSwitch
              checked={settings.launchAtLogin}
              label="Launch at login"
              onChange={(value) => update('launchAtLogin', value)}
            />
          </Row>
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
            value={settings.tempUnit}
            onChange={(v) => update('tempUnit', v)}
            options={[
              { label: 'Celsius (°C)', value: 'C' },
              { label: 'Fahrenheit (°F)', value: 'F' }
            ]}
          />
        </Row>
      </Section>

      {/* ── Data & Storage ───────────────────────── */}
      <Section title="Data & Storage">
        <Row label="History retention" description="How long metric snapshots are kept on disk">
          <Select
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
