import { useEffect, useState } from 'react'
import { AppSettings } from '../../../main/storage/settings'

const DEFAULT_SETTINGS: AppSettings = {
  launchAtLogin: false,
  hideFromDock: false,
  pollIntervalMs: 2000,
  tempUnit: 'C',
  dataRetentionDays: 7,
  anomalySensitivity: 'balanced',
  anomalyNotifications: true
}

// ── Reusable primitives ────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h3
        className="text-xs font-semibold uppercase tracking-widest mb-3"
        style={{ color: 'var(--text-secondary)' }}
      >
        {title}
      </h3>
      <div
        className="rounded-xl divide-y"
        style={{ background: 'var(--card-bg)', border: '1px solid var(--border)' }}
      >
        {children}
      </div>
    </div>
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
    <div className="flex items-center justify-between px-4 py-3 gap-4">
      <div className="flex flex-col min-w-0">
        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          {label}
        </span>
        {description && (
          <span className="text-xs mt-0.5 leading-snug" style={{ color: 'var(--text-secondary)' }}>
            {description}
          </span>
        )}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="relative inline-flex items-center w-10 h-5 rounded-full transition-colors duration-200 focus:outline-none"
      style={{ background: checked ? 'var(--accent)' : 'var(--border)' }}
    >
      <span
        className="inline-block w-4 h-4 rounded-full bg-white shadow transition-transform duration-200"
        style={{ transform: checked ? 'translateX(22px)' : 'translateX(2px)' }}
      />
    </button>
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
      className="text-sm rounded-lg px-2 py-1 pr-6 appearance-none focus:outline-none"
      style={{
        background: 'var(--card-bg)',
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
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.electronAPI.getSettings().then((s) => {
      setSettings(s)
      setLoading(false)
    })
  }, [])

  async function update<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    const next = { ...settings, [key]: value }
    setSettings(next)

    if (key === 'hideFromDock') {
      if (value) await window.electronAPI.hideDock()
      else await window.electronAPI.showDock()
    }

    await window.electronAPI.saveSettings(next)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Loading settings…
        </span>
      </div>
    )
  }

  const isMac = navigator.platform.toUpperCase().includes('MAC')

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
          Settings
        </h2>
        <span
          className="text-xs transition-opacity duration-300"
          style={{ color: 'var(--accent)', opacity: saved ? 1 : 0 }}
        >
          ✓ Saved
        </span>
      </div>

      {/* ── System — macOS only ──────────────────── */}
      {isMac && (
        <Section title="System">
          <Row label="Launch at login" description="Start Sentinel automatically when you log in">
            <Toggle checked={settings.launchAtLogin} onChange={(v) => update('launchAtLogin', v)} />
          </Row>
          <Row
            label="Hide from Dock"
            description="Remove the app icon from the macOS Dock — still accessible via menu bar"
          >
            <Toggle checked={settings.hideFromDock} onChange={(v) => update('hideFromDock', v)} />
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
          <Toggle
            checked={settings.anomalyNotifications}
            onChange={(v) => update('anomalyNotifications', v)}
          />
        </Row>
      </Section>
    </div>
  )
}
