import { create } from 'zustand'
import type { AlertHistoryEntry } from '../../../shared/contracts'

interface AlertHistoryState {
  alerts: AlertHistoryEntry[]
  initialized: boolean
  initialize: () => Promise<void>
  markAllRead: () => Promise<void>
  clear: () => Promise<void>
}

let initialization: Promise<void> | null = null
let stopListening: (() => void) | null = null

export const useAlertHistoryStore = create<AlertHistoryState>()((set, get) => ({
  alerts: [],
  initialized: false,

  initialize: async () => {
    if (get().initialized) return
    if (!stopListening) {
      stopListening = window.electronAPI.onAlertHistoryUpdated((alerts) => set({ alerts }))
    }
    initialization ??= window.electronAPI
      .getAlertHistory()
      .then((alerts) => set({ alerts, initialized: true }))
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
