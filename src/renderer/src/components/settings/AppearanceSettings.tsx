import { PercentDisplay } from '../widgets/MetricVisuals'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  ACCENTS,
  AUX_METRICS,
  DEFAULT_APPEARANCE,
  MAX_PROFILES,
  STARTUP_PAGES,
  THEMES,
  isAccent,
  isProfileName,
  type Appearance,
  type AppearanceProfile
} from '../../../../shared/contracts/personalization'
import { dashboardPreset } from '../../../../shared/utils/dashboardLayout'
import { useUiSettingsStore } from '../../store/uiSettingsStore'
import { Modal } from '../ui/Modal'

const pages = [
  'Overview',
  'Processes',
  'Network Connections',
  'System',
  'History',
  'Alerts',
  'Settings'
]

function Options<T extends string | number>({
  label,
  values,
  value,
  change
}: {
  label: string
  values: readonly T[]
  value: T
  change: (value: T) => void
}) {
  return (
    <label className="preference-row">
      <span>{label}</span>
      <select
        className="control capitalize"
        value={value}
        onChange={(event) => {
          const choice = values.find((item) => String(item) === event.target.value)
          if (choice !== undefined) change(choice)
        }}
      >
        {values.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
    </label>
  )
}

function Preferences({ title, children }: { title: string; children: ReactNode }) {
  const disabled = useUiSettingsStore(
    (state) => state.saveState.saving || Boolean(state.persistenceIssue)
  )
  return (
    <fieldset className="preference-section" disabled={disabled}>
      <legend>{title}</legend>
      {children}
    </fieldset>
  )
}

export function AppearanceSettings() {
  const appearance = useUiSettingsStore((state) => state.appearance)
  const save = useUiSettingsStore((state) => state.savePreferences)
  const [accent, setAccent] = useState<string | null>(null)
  function change<K extends keyof Appearance>(key: K, value: Appearance[K]) {
    save({ appearance: { ...appearance, [key]: value } })
  }
  return (
    <>
      <Preferences title="Appearance">
        <div className="theme-choices" aria-label="Theme" role="group">
          {THEMES.map((theme) => (
            <button
              key={theme}
              className="control theme-choice capitalize"
              type="button"
              aria-label={theme[0].toUpperCase() + theme.slice(1)}
              aria-pressed={theme === appearance.theme}
              onClick={() => change('theme', theme)}
            >
              <span className="theme-sample" data-sample={theme} aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              {theme}
            </button>
          ))}
        </div>
        <div
          className="appearance-instrument-preview"
          aria-label="Theme preview with example readings"
        >
          <div>
            <strong>Live appearance preview</strong>
            <p className="workspace-meta">Example readings</p>
          </div>
          <div data-preview-series="cpu">
            <PercentDisplay value={42} style="gauge" note="Processor" />
          </div>
          <div data-preview-series="memory">
            <PercentDisplay value={68} style="ring" note="Active memory" />
          </div>
        </div>
        <div className="preference-row">
          <span>Accent</span>
          <div className="workspace-actions">
            {ACCENTS.map((color, index) => (
              <button
                className="accent-swatch"
                type="button"
                key={color}
                aria-label={['Teal', 'Blue', 'Violet', 'Copper', 'Rose'][index]}
                aria-pressed={appearance.accent === color}
                style={{ backgroundColor: color }}
                onClick={() => {
                  setAccent(null)
                  change('accent', color)
                }}
              >
                {appearance.accent === color && <span aria-hidden="true">&#10003;</span>}
              </button>
            ))}
            <input
              className="accent-picker"
              type="color"
              aria-label="Custom accent"
              value={accent ?? appearance.accent}
              onChange={(event) => setAccent(event.target.value)}
            />
            <button
              className="control"
              type="button"
              disabled={!isAccent(accent) || accent === appearance.accent}
              onClick={() => {
                if (isAccent(accent)) {
                  change('accent', accent)
                  setAccent(null)
                }
              }}
            >
              Apply accent
            </button>
          </div>
        </div>
        <Options
          label="Interface density"
          values={['compact', 'comfortable']}
          value={appearance.density}
          change={(value) => change('density', value)}
        />
        <Options
          label="Text size"
          values={[14, 15, 16]}
          value={appearance.textSize}
          change={(value) => change('textSize', value)}
        />
        <Options
          label="Sidebar"
          values={['expanded', 'collapsed']}
          value={appearance.sidebar}
          change={(value) => change('sidebar', value)}
        />
        <Options
          label="Chart style"
          values={['area', 'line']}
          value={appearance.chart}
          change={(value) => change('chart', value)}
        />
        <button
          className="control"
          onClick={() => {
            setAccent(null)
            save({ appearance: DEFAULT_APPEARANCE })
          }}
        >
          Reset appearance
        </button>
      </Preferences>
      <Profiles />
    </>
  )
}

export function StartupPreference() {
  const appearance = useUiSettingsStore((state) => state.appearance)
  const save = useUiSettingsStore((state) => state.savePreferences)
  return (
    <Preferences title="On launch">
      <label className="preference-row">
        <span>Startup page</span>
        <select
          className="control"
          value={appearance.startupPage}
          onChange={(event) => {
            const startupPage = STARTUP_PAGES.find((page) => page === event.target.value)
            if (startupPage) save({ appearance: { ...appearance, startupPage } })
          }}
        >
          {STARTUP_PAGES.map((page, index) => (
            <option key={page} value={page}>
              {pages[index]}
            </option>
          ))}
        </select>
      </label>
    </Preferences>
  )
}

export function DashboardSettings() {
  const preset = useUiSettingsStore((state) => state.dashboardLayout.preset)
  const save = useUiSettingsStore((state) => state.savePreferences)
  return (
    <Preferences title="Dashboard layout">
      <div className="preference-row">
        <span>Current layout</span>
        <strong className="capitalize">{preset}</strong>
      </div>
      <div className="workspace-actions">
        <Link className="control" to="/?edit=layout">
          Customize Dashboard
        </Link>
        <button className="control" onClick={() => save(dashboardPreset('essential'))}>
          Reset dashboard layout
        </button>
      </div>
    </Preferences>
  )
}

function Profiles() {
  const profiles = useUiSettingsStore((state) => state.appearanceProfiles)
  const save = useUiSettingsStore((state) => state.savePreferences)
  const [editing, setEditing] = useState<{
    profile: AppearanceProfile
    previousName?: string
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ message: string; error?: boolean } | null>(null)

  function current(): AppearanceProfile {
    const {
      appearance,
      dashboardDensity,
      dashboardWidgets,
      dashboardWidgetOrder,
      dashboardLayout
    } = useUiSettingsStore.getState()
    return {
      name: '',
      version: 1,
      appearance,
      dashboard: { dashboardDensity, dashboardWidgets, dashboardWidgetOrder, dashboardLayout }
    }
  }
  function apply(profile: AppearanceProfile) {
    setNotice(null)
    save({ appearance: profile.appearance, ...profile.dashboard })
  }
  async function importProfile() {
    setBusy(true)
    setNotice(null)
    try {
      const result = await window.electronAPI.importAppearanceProfile()
      if (result.status === 'ready') setEditing({ profile: result.profile })
      else if (result.status !== 'cancelled')
        setNotice({
          error: true,
          message:
            result.status === 'invalid'
              ? 'This file is not a supported appearance profile.'
              : 'Could not read the appearance profile.'
        })
    } catch {
      setNotice({ error: true, message: 'Could not read the appearance profile.' })
    } finally {
      setBusy(false)
    }
  }
  async function exportProfile(profile: AppearanceProfile) {
    setBusy(true)
    setNotice(null)
    try {
      const result = await window.electronAPI.exportAppearanceProfile(profile)
      if (result !== 'cancelled')
        setNotice({
          error: result !== 'saved',
          message:
            result === 'saved'
              ? 'Profile exported.'
              : result === 'exists'
                ? 'That file already exists. Choose a new name.'
                : 'Could not export the profile.'
        })
    } catch {
      setNotice({ error: true, message: 'Could not export the profile.' })
    } finally {
      setBusy(false)
    }
  }
  const name = editing?.profile.name.trim() ?? ''
  const canSave =
    isProfileName(name) &&
    !profiles.some(
      (profile) =>
        profile.name !== editing?.previousName && profile.name.toLowerCase() === name.toLowerCase()
    )
  return (
    <Preferences title="Appearance and layout profiles">
      {notice && (
        <p className="workspace-meta" role={notice.error ? 'alert' : 'status'}>
          {notice.message}
        </p>
      )}
      {profiles.length ? (
        <ul className="profile-list">
          {profiles.map((profile) => (
            <li key={profile.name} className="preference-row">
              <span className="profile-name">{profile.name}</span>
              <div className="workspace-actions">
                <button className="control" onClick={() => apply(profile)}>
                  Apply
                </button>
                <button
                  className="control"
                  onClick={() => setEditing({ profile, previousName: profile.name })}
                >
                  Rename
                </button>
                <button
                  className="control"
                  disabled={busy}
                  onClick={() => void exportProfile(profile)}
                >
                  Export
                </button>
                <button
                  className="control"
                  onClick={() =>
                    save({ appearanceProfiles: profiles.filter((item) => item !== profile) })
                  }
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="workspace-meta">No saved profiles.</p>
      )}
      <div className="workspace-actions">
        <button
          className="control control--accent"
          disabled={profiles.length >= MAX_PROFILES}
          onClick={() => setEditing({ profile: current() })}
        >
          Save current setup
        </button>
        <button
          className="control"
          disabled={busy || profiles.length >= MAX_PROFILES}
          onClick={() => void importProfile()}
        >
          Import profile
        </button>
      </div>
      {editing && (
        <Modal titleId="profile-title" onClose={() => setEditing(null)}>
          <form
            className="profile-form"
            onSubmit={(event) => {
              event.preventDefault()
              if (!canSave) return
              const profile = { ...editing.profile, name }
              save({
                appearanceProfiles:
                  editing.previousName === undefined
                    ? [...profiles, profile]
                    : profiles.map((item) => (item.name === editing.previousName ? profile : item))
              })
              setEditing(null)
            }}
          >
            <h3 className="workspace-title" id="profile-title">
              {editing.previousName ? 'Rename profile' : 'Save appearance profile'}
            </h3>
            <p className="workspace-meta capitalize">
              {editing.profile.appearance.theme} appearance ·{' '}
              {editing.profile.dashboard.dashboardLayout.preset} layout
            </p>
            <label className="preference-row">
              Name
              <input
                required
                className="control"
                maxLength={48}
                data-initial-focus
                value={editing.profile.name}
                onChange={(event) =>
                  setEditing({
                    ...editing,
                    profile: { ...editing.profile, name: event.target.value }
                  })
                }
              />
            </label>
            <div className="workspace-actions">
              <button className="control" type="button" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button className="control control--accent" type="submit" disabled={!canSave}>
                Save profile
              </button>
            </div>
          </form>
        </Modal>
      )}
    </Preferences>
  )
}

export function MiniSettings({ opacitySupported }: { opacitySupported: boolean }) {
  const presentation = useUiSettingsStore((state) => state.miniPresentation)
  const save = useUiSettingsStore((state) => state.savePreferences)
  return (
    <Preferences title="Mini Monitor">
      <Options
        label="Size"
        values={['small', 'standard', 'large']}
        value={presentation.size}
        change={(size) => save({ miniPresentation: { ...presentation, size } })}
      />
      <Options
        label="Layout"
        values={['grid', 'list']}
        value={presentation.layout}
        change={(layout) => save({ miniPresentation: { ...presentation, layout } })}
      />
      {opacitySupported && (
        <Options
          label="Opacity (%)"
          values={[85, 90, 95, 100]}
          value={presentation.opacity}
          change={(opacity) => save({ miniPresentation: { ...presentation, opacity } })}
        />
      )}
      <div className="preference-row">
        <span>Metrics</span>
        <div className="workspace-actions">
          {AUX_METRICS.filter((id) => id !== 'disk').map((id) => (
            <label key={id} className="capitalize">
              <input
                type="checkbox"
                checked={presentation.metrics.includes(id)}
                disabled={presentation.metrics.includes(id) && presentation.metrics.length === 1}
                onChange={(event) =>
                  save({
                    miniPresentation: {
                      ...presentation,
                      metrics: event.target.checked
                        ? [...presentation.metrics, id]
                        : presentation.metrics.filter((metric) => metric !== id)
                    }
                  })
                }
              />{' '}
              {id}
            </label>
          ))}
        </div>
      </div>
    </Preferences>
  )
}

export function TraySettings() {
  const presentation = useUiSettingsStore((state) => state.trayPresentation)
  const save = useUiSettingsStore((state) => state.savePreferences)
  return (
    <Preferences title="System Tray">
      <label className="preference-row">
        <span>Compact summary</span>
        <input
          type="checkbox"
          checked={presentation.compact}
          onChange={(event) =>
            save({ trayPresentation: { ...presentation, compact: event.target.checked } })
          }
        />
      </label>
      <div className="preference-row">
        <span>Metrics</span>
        <div className="workspace-actions">
          {AUX_METRICS.map((id) => (
            <label key={id} className="capitalize">
              <input
                type="checkbox"
                checked={presentation.metrics.includes(id)}
                disabled={presentation.metrics.includes(id) && presentation.metrics.length === 1}
                onChange={(event) =>
                  save({
                    trayPresentation: {
                      ...presentation,
                      metrics: event.target.checked
                        ? [...presentation.metrics, id]
                        : presentation.metrics.filter((metric) => metric !== id)
                    }
                  })
                }
              />{' '}
              {id}
            </label>
          ))}
        </div>
      </div>
    </Preferences>
  )
}
