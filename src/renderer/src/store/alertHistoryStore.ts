import { create } from 'zustand'
import type { AlertAnalytics, AlertHistoryEntry } from '../../../shared/contracts'

interface AlertHistoryState {
  alerts: AlertHistoryEntry[]
  analytics: AlertAnalytics | null
  initialized: boolean
  initialize: () => Promise<void>
  markAllRead: () => Promise<void>
  clear: () => Promise<void>
}

let initialization: Promise<void> | null = null
let stopListening: (() => void) | null = null
let stopAnalyticsListening: (() => void) | null = null

export const useAlertHistoryStore = create<AlertHistoryState>()((set, get) => ({
  alerts: [],
  analytics: null,
  initialized: false,

  initialize: async () => {
    if (get().initialized) return
    if (!stopListening) {
      stopListening = window.electronAPI.onAlertHistoryUpdated((alerts) => set({ alerts }))
    }
    if (!stopAnalyticsListening) {
      stopAnalyticsListening = window.electronAPI.onAlertAnalyticsUpdated((analytics) =>
        set({ analytics })
      )
    }
    initialization ??= Promise.all([
      window.electronAPI.getAlertHistory(),
      window.electronAPI.getAlertAnalytics()
    ])
      .then(([alerts, analytics]) => set({ alerts, analytics, initialized: true }))
      .catch((error) => {
        console.error('Failed to load alert history:', error)
        set({ initialized: true })
      })
    await initialization
  },

  markAllRead: async () => {
    const alerts = await window.electronAPI.markAllAlertsRead()
    set({ alerts })
  },

  clear: async () => {
    const alerts = await window.electronAPI.clearAlertHistory()
    set({ alerts })
  }
}))
