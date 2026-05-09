import { useEffect, useState } from 'react'
import { Card } from '../components/ui/Card'
import { AppSettings } from '../../../main/settings'

// ── Primitives ───────────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{
        width: '40px',
        height: '22px',
        borderRadius: '11px',
        backgroundColor: checked ? 'var(--accent-blue)' : 'var(--border)',
        border: 'none',
        cursor: 'pointer',
        position: 'relative',
        transition: 'background-color 0.2s',
        flexShrink: 0,
        outline: 'none',
      }}
    >
      <span
        style={{
          position: 'absolute',
          width: '16px',
          height: '16px',
          borderRadius: '50%',
          backgroundColor: 'white',
          top: '3px',
          left: checked ? '21px' : '3px',
          transition: 'left 0.2s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
        }}
      />
    </button>
  )
}

function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div
      style={{
        display: 'flex',
        borderRadius: '8px',
        overflow: 'hidden',
        border: '1px solid var(--border)',
        backgroundColor: 'var(--bg-base)',
      }}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            padding: '5px 12px',
            fontSize: '12px',
            fontWeight: 500,
            backgroundColor: value === opt.value ? 'var(--accent-blue)' : 'transparent',
            color: value === opt.value ? 'white' : 'var(--text-muted)',
            border: 'none',
            cursor: 'pointer',
            transition: 'background-color 0.15s, color 0.15s',
            outline: 'none',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ── Layout helpers ───────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3
      className="text-xs font-semibold uppercase tracking-widest mb-3"
      style={{ color: 'var(--text-muted)' }}
    >
      {children}
    </h3>
  )
}

function SettingRow({
  label,
  description,
  last,
  children,
}: {
  label: string
  description?: string
  last?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className="flex items-center justify-between gap-4 py-3"
      style={last ? undefined : { borderBottom: '1px solid var(--border)' }}
    >
      <div className="flex-1">
        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          {label}
        </p>
        {description && (
          <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            {description}
          </p>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

const SENSITIVITY_OPTIONS: { label: string; value: AppSettings['anomalySensitivity'] }[] = [
  { label: 'Sensitive',    value: 'sensitive' },
  { label: 'Balanced',     value: 'balanced' },
  { label: 'Conservative', value: 'conservative' },
]

const RETENTION_OPTIONS: { label: string; value: number }[] = [
  { label: '1 day',   value: 1 },
  { label: '7 days',  value: 7 },
  { label: '14 days', value: 14 },
  { label: '30 days', value: 30 },
]

const DEFAULT_SETTINGS: AppSettings = {
  hideFromDock:       false,
  dataRetentionDays:  7,
  anomalySensitivity: 'balanced',
}

export function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    window.electronAPI.getSettings().then((s) => {
      if (s) setSettings(s as AppSettings)
    })
  }, [])

  function apply(patch: Partial<AppSettings>) {
    const next = { ...settings, ...patch }
    setSettings(next)
    window.electronAPI.saveSettings(next)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
          Settings
        </h2>
        {saved && (
          <span
            className="text-xs font-medium"
            style={{ color: 'var(--accent-green)' }}
          >
            Saved
          </span>
        )}
      </div>

      {/* General */}
      <div>
        <SectionHeader>General</SectionHeader>
        <Card>
          <SettingRow
            label="Hide from Dock"
            description="When enabled, Sentinel won't appear in the Dock. Access it via the menu bar icon instead."
            last
          >
            <Toggle
              checked={settings.hideFromDock}
              onChange={(v) => apply({ hideFromDock: v })}
            />
          </SettingRow>
        </Card>
      </div>

      {/* Anomaly Detection */}
      <div>
        <SectionHeader>Anomaly Detection</SectionHeader>
        <Card>
          <SettingRow
            label="Sensitivity"
            description={
              settings.anomalySensitivity === 'sensitive'
                ? 'Flags ~5% of readings. Best for catching subtle issues early.'
                : settings.anomalySensitivity === 'conservative'
                  ? 'Flags ~0.3% of readings. Only surfaces major spikes.'
                  : 'Flags ~1% of readings. Recommended for most setups.'
            }
            last
          >
            <SegmentedControl
              options={SENSITIVITY_OPTIONS}
              value={settings.anomalySensitivity}
              onChange={(v) => apply({ anomalySensitivity: v })}
            />
          </SettingRow>
        </Card>
      </div>

      {/* Data */}
      <div>
        <SectionHeader>Data</SectionHeader>
        <Card>
          <SettingRow
            label="History Retention"
            description="Metric history older than this is automatically deleted from the local database."
            last
          >
            <SegmentedControl
              options={RETENTION_OPTIONS}
              value={settings.dataRetentionDays}
              onChange={(v) => apply({ dataRetentionDays: v })}
            />
          </SettingRow>
        </Card>
      </div>

      {/* About */}
      <div>
        <SectionHeader>About</SectionHeader>
        <Card>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span style={{ color: 'var(--text-muted)' }}>Version</span>
              <span style={{ color: 'var(--text-primary)' }}>1.0.0</span>
            </div>
            <div
              className="flex justify-between text-sm pt-2"
              style={{ borderTop: '1px solid var(--border)' }}
            >
              <span style={{ color: 'var(--text-muted)' }}>Data stored locally at</span>
              <span
                className="text-xs font-mono"
                style={{ color: 'var(--text-muted)' }}
              >
                ~/Library/Application Support/sentinel/
              </span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
