import { contextBridge, ipcRenderer } from 'electron'
import type { AppSettings, UiSettingsPatch } from '../main/storage/settings'

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electronAPI', {
      // Mini tray interface
      openMainWindow: () => ipcRenderer.invoke('open-main-window'),

      // Live metrics
      getCpuMetrics: () => ipcRenderer.invoke('get-cpu-metrics'),
      getMemoryMetrics: () => ipcRenderer.invoke('get-memory-metrics'),
      getDiskMetrics: () => ipcRenderer.invoke('get-disk-metrics'),
      getNetworkMetrics: () => ipcRenderer.invoke('get-network-metrics'),
      getProcessMetrics: () => ipcRenderer.invoke('get-process-metrics'),
      getGpuMetrics: () => ipcRenderer.invoke('get-gpu-metrics'),
      getBatteryMetrics: () => ipcRenderer.invoke('get-battery-metrics'),

      // Advanced collectors
      getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
      getThermalMetrics: () => ipcRenderer.invoke('get-thermal-metrics'),
      getStartupMetrics: () => ipcRenderer.invoke('get-startup-metrics'),
      getAnomalyReport: () => ipcRenderer.invoke('get-anomaly-report'),
      toggleStartupItem: (itemPath: string, enable: boolean) =>
        ipcRenderer.invoke('toggle-startup-item', itemPath, enable),

      killProcess: (pid: number) => ipcRenderer.invoke('kill-process', pid),

      // Settings
      getSettings: () => ipcRenderer.invoke('get-settings'),
      saveSettings: (settings: AppSettings) => ipcRenderer.invoke('save-settings', settings),
      saveUiSettings: (patch: UiSettingsPatch) => ipcRenderer.invoke('save-ui-settings', patch),
      showDock: () => ipcRenderer.invoke('show-dock'),
      hideDock: () => ipcRenderer.invoke('hide-dock'),

      // Historical data
      getHistorySnapshots: (minutes: number) =>
        ipcRenderer.invoke('get-history-snapshots', minutes),
      getHistorySummary: (minutes: number) => ipcRenderer.invoke('get-history-summary', minutes),
      getHistoryDownsampled: (minutes: number) =>
        ipcRenderer.invoke('get-history-downsampled', minutes)
    })
  } catch (error) {
    console.error(error)
  }
}
