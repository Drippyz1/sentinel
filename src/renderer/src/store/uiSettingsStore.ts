import { create } from 'zustand'
import type {
  DashboardWidget,
  DashboardWidgetVisibility,
  DashboardDensity,
  HistoryMetric,
  ProcessDensity,
  ProcessQuickFilter,
  SystemView,
  UiSettings,
  UiSettingsPatch
} from '../../../shared/contracts'
import { DASHBOARD_WIDGET_KEYS } from '../../../shared/contracts'

interface UiSettingsState extends UiSettings {
  initialized: boolean
  initialize: () => Promise<void>
  setDashboardPollingPaused: (paused: boolean) => void
  setDashboardDensity: (density: DashboardDensity) => void
  setDashboardWidgets: (widgets: DashboardWidgetVisibility) => void
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

export const DEFAULT_DASHBOARD_WIDGETS: DashboardWidgetVisibility = {
  cpu: true,
  memory: true,
  gpu: true,
  disk: true,
  network: true,
  battery: true,
  anomalies: true
}
export const DEFAULT_DASHBOARD_WIDGET_ORDER: DashboardWidget[] = [...DASHBOARD_WIDGET_KEYS]

const DEFAULT_UI_SETTINGS: UiSettings = {
  dashboardPollingPaused: false,
  dashboardDensity: 'comfortable',
  miniMonitorVisible: false,
  miniMonitorAlwaysOnTop: true,
  miniMonitorPosition: null,
  dashboardWidgets: DEFAULT_DASHBOARD_WIDGETS,
  dashboardWidgetOrder: DEFAULT_DASHBOARD_WIDGET_ORDER,
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
  historyAlertMarkers: true,
  processDensity: 'comfortable',
  processQuickFilter: 'all',
  systemView: 'advanced'
}

let initialization: Promise<void> | null = null
let stopListening: (() => void) | null = null

function mergePatch(state: UiSettingsState, patch: UiSettingsPatch): Partial<UiSettingsState> {
  return {
    ...patch,
    dashboardWidgets: patch.dashboardWidgets
      ? { ...state.dashboardWidgets, ...patch.dashboardWidgets }
      : state.dashboardWidgets,
    historyMetrics: patch.historyMetrics
      ? { ...state.historyMetrics, ...patch.historyMetrics }
      : state.historyMetrics
  }
}

function persist(patch: UiSettingsPatch): void {
  void window.electronAPI
    .saveUiSettings(patch)
    .then((saved) => {
      if (!saved) console.error('Failed to save UI settings')
    })
    .catch((error) => console.error('Failed to save UI settings:', error))
}

export const useUiSettingsStore = create<UiSettingsState>()((set, get) => ({
  ...DEFAULT_UI_SETTINGS,
  initialized: false,

  initialize: async () => {
    if (get().initialized) return
    if (!initialization) {
      if (!stopListening) {
        stopListening = window.electronAPI.onUiSettingsChanged((patch) => {
          set((state) => mergePatch(state, patch))
        })
      }
      initialization = window.electronAPI
        .getSettings()
        .then((settings) => {
          set({ ...settings.ui, initialized: true })
        })
        .catch((error) => {
          console.error('Failed to load UI settings:', error)
          set({ initialized: true })
        })
    }
    await initialization
  },

  setDashboardPollingPaused: (paused) => {
    set({ dashboardPollingPaused: paused })
    persist({ dashboardPollingPaused: paused })
  },

  setDashboardDensity: (dashboardDensity) => {
    set({ dashboardDensity })
    persist({ dashboardDensity })
  },

  setDashboardWidgets: (widgets) => {
    set({ dashboardWidgets: widgets })
    persist({ dashboardWidgets: widgets })
  },

  setDashboardWidgetOrder: (dashboardWidgetOrder) => {
    set({ dashboardWidgetOrder })
    persist({ dashboardWidgetOrder })
  },

  setDashboardPreferences: (dashboardWidgets, dashboardWidgetOrder) => {
    set({ dashboardWidgets, dashboardWidgetOrder })
    persist({ dashboardWidgets, dashboardWidgetOrder })
  },

  setHistoryView: (view) => {
    set({ historyView: view })
    persist({ historyView: view })
  },

  setHistoryMetricVisible: (metric, visible) => {
    set((state) => ({
      historyMetrics: { ...state.historyMetrics, [metric]: visible }
    }))
    persist({ historyMetrics: { [metric]: visible } })
  },

  setHistoryRangeMinutes: (minutes) => {
    set({ historyRangeMinutes: minutes })
    persist({ historyRangeMinutes: minutes })
  },

  setHistoryAlertMarkers: (historyAlertMarkers) => {
    set({ historyAlertMarkers })
    persist({ historyAlertMarkers })
  },

  setProcessDensity: (density) => {
    set({ processDensity: density })
    persist({ processDensity: density })
  },

  setProcessQuickFilter: (filter) => {
    set({ processQuickFilter: filter })
    persist({ processQuickFilter: filter })
  },

  setSystemView: (view) => {
    set({ systemView: view })
    persist({ systemView: view })
  }
}))
