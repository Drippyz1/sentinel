import { create } from 'zustand'
import type {
  AppSettings,
  DashboardWidget,
  DashboardWidgetVisibility,
  DashboardDensity,
  HistoryMetric,
  ProcessDensity,
  ProcessQuickFilter,
  SettingsPersistenceIssue,
  SystemView,
  UiSettings,
  UiSettingsPatch,
  UiSettingsSnapshot
} from '../../../shared/contracts'
import { DEFAULT_UI_SETTINGS } from '../../../shared/contracts'
import { createUiSettingsTransactions, type UiSaveState } from './uiSettingsTransactions'
import { useHistoryStore } from './historyStore'

interface UiSettingsState extends UiSettings {
  tempUnit: AppSettings['tempUnit']
  initialized: boolean
  persistenceIssue: SettingsPersistenceIssue | null
  loadFailed: boolean
  saveState: UiSaveState
  miniOpenFailed: boolean
  initialize: () => Promise<void>
  retrySave: () => void
  savePreferences: (patch: UiSettingsPatch, retryable?: boolean) => void
  setDashboardPollingPaused: (paused: boolean) => void
  setDashboardDensity: (density: DashboardDensity) => void
  setDashboardWidgets: (widgets: Partial<DashboardWidgetVisibility>) => void
  setDashboardWidgetOrder: (order: DashboardWidget[]) => void
  setDashboardPreferences: (widgets: DashboardWidgetVisibility, order: DashboardWidget[]) => void
  setHistoryView: (view: UiSettings['historyView']) => void
  setHistoryMetricVisible: (metric: HistoryMetric, visible: boolean) => void
  setHistoryRangeMinutes: (minutes: number) => void
  setHistoryAlertMarkers: (visible: boolean) => void
  setProcessDensity: (density: ProcessDensity) => void
  setProcessQuickFilter: (filter: ProcessQuickFilter) => void
  setSystemView: (view: SystemView) => void
}

let initialization: Promise<void> | undefined
let listening = false
let revision = -1

export const useUiSettingsStore = create<UiSettingsState>()((set, get) => {
  const transactions = createUiSettingsTransactions({
    save: (patch) => window.electronAPI.saveUiSettings(patch),
    revision: () => revision,
    onStatus: (saveState) => set({ saveState })
  })

  function accept(snapshot: UiSettingsSnapshot): void {
    if (snapshot.revision <= revision) return
    revision = snapshot.revision
    if (get().dashboardPollingPaused !== snapshot.ui.dashboardPollingPaused)
      useHistoryStore.getState().interrupt()
    set({
      ...snapshot.ui,
      tempUnit: snapshot.tempUnit,
      persistenceIssue: snapshot.persistenceIssue,
      initialized: true,
      loadFailed: false
    })
    transactions.onRevision()
  }

  function submit(patch: UiSettingsPatch, retryable = true): void {
    if (get().loadFailed || get().persistenceIssue || !get().initialized) return
    transactions.submit(patch, retryable)
  }

  return {
    ...DEFAULT_UI_SETTINGS,
    initialized: false,
    tempUnit: 'C',
    persistenceIssue: null,
    loadFailed: false,
    saveState: { saving: false, failed: false, canRetry: false },
    miniOpenFailed: false,
    retrySave: transactions.retry,
    savePreferences: submit,

    initialize: async () => {
      if (get().initialized && !get().loadFailed) return
      if (!listening) {
        window.electronAPI.onUiSettingsChanged(accept)
        listening = true
      }
      if (!initialization) {
        initialization = window.electronAPI
          .getUiSettings()
          .then(accept)
          .catch(() => {
            if (revision < 0) set({ initialized: true, loadFailed: true })
          })
          .finally(() => {
            initialization = undefined
          })
      }
      await initialization
    },

    setDashboardPollingPaused: (dashboardPollingPaused) => submit({ dashboardPollingPaused }),
    setDashboardDensity: (dashboardDensity) => submit({ dashboardDensity }),
    setDashboardWidgets: (dashboardWidgets) =>
      submit({ dashboardWidgets, dashboardLayout: { ...get().dashboardLayout, preset: 'custom' } }),
    setDashboardWidgetOrder: (dashboardWidgetOrder) =>
      submit({
        dashboardWidgetOrder,
        dashboardLayout: { ...get().dashboardLayout, preset: 'custom' }
      }),
    setDashboardPreferences: (dashboardWidgets, dashboardWidgetOrder) =>
      submit({ dashboardWidgets, dashboardWidgetOrder }),
    setHistoryView: (historyView) => submit({ historyView }),
    setHistoryMetricVisible: (metric, visible) => submit({ historyMetrics: { [metric]: visible } }),
    setHistoryRangeMinutes: (historyRangeMinutes) => submit({ historyRangeMinutes }),
    setHistoryAlertMarkers: (historyAlertMarkers) => submit({ historyAlertMarkers }),
    setProcessDensity: (processDensity) => submit({ processDensity }),
    setProcessQuickFilter: (processQuickFilter) => submit({ processQuickFilter }),
    setSystemView: (systemView) => submit({ systemView })
  }
})

export async function showMiniMonitorWithFeedback(): Promise<void> {
  let shown = false
  try {
    shown = await window.electronAPI.showMiniMonitor()
  } catch {
    // The error indicator also covers a rejected invoke.
  }
  useUiSettingsStore.setState({ miniOpenFailed: !shown })
}
