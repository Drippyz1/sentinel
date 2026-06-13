import { create } from 'zustand'
import type {
  HistoryMetric,
  ProcessDensity,
  ProcessQuickFilter,
  SystemView,
  UiSettings,
  UiSettingsPatch
} from '../../../main/storage/settings'

interface UiSettingsState extends UiSettings {
  initialized: boolean
  initialize: () => Promise<void>
  setDashboardPollingPaused: (paused: boolean) => void
  setHistoryView: (view: UiSettings['historyView']) => void
  setHistoryMetricVisible: (metric: HistoryMetric, visible: boolean) => void
  setHistoryRangeMinutes: (minutes: number) => void
  setProcessDensity: (density: ProcessDensity) => void
  setProcessQuickFilter: (filter: ProcessQuickFilter) => void
  setSystemView: (view: SystemView) => void
}

const DEFAULT_UI_SETTINGS: UiSettings = {
  dashboardPollingPaused: false,
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

let initialization: Promise<void> | null = null
let stopListening: (() => void) | null = null

function mergePatch(state: UiSettingsState, patch: UiSettingsPatch): Partial<UiSettingsState> {
  return {
    ...patch,
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
