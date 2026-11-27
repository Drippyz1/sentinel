import { useUiSettingsStore } from '../../store/uiSettingsStore'

export function UiSettingsFeedback({ compact = false }: { compact?: boolean }) {
  const state = useUiSettingsStore((store) => store.saveState)
  const persistenceIssue = useUiSettingsStore((store) => store.persistenceIssue)
  const loadFailed = useUiSettingsStore((store) => store.loadFailed)
  const miniOpenFailed = useUiSettingsStore((store) => store.miniOpenFailed)
  const retrySave = useUiSettingsStore((store) => store.retrySave)
  const initialize = useUiSettingsStore((store) => store.initialize)

  if (persistenceIssue) {
    return (
      <p className="text-xs" role="alert" style={{ color: 'var(--accent-amber)' }}>
        {compact
          ? 'Settings need recovery. See Settings.'
          : 'Preferences are read-only. Back up or restore settings.json in the Sentinel profile, then restart.'}
      </p>
    )
  }
  if (state.saving)
    return (
      <p className="text-xs" role="status">
        Saving settings...
      </p>
    )
  if (!state.failed && !loadFailed && !miniOpenFailed) return null

  const error = loadFailed
    ? 'Could not load settings.'
    : state.failed
      ? 'Could not save settings.'
      : 'Could not open Mini Monitor.'

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      <span role="alert" style={{ color: 'var(--accent-amber)' }}>
        {error}
      </span>
      {loadFailed || state.canRetry ? (
        <button
          type="button"
          className="underline"
          onClick={loadFailed ? () => void initialize() : retrySave}
        >
          Retry
        </button>
      ) : (
        <span>Try the control again.</span>
      )}
    </div>
  )
}
