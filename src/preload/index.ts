import { contextBridge, ipcRenderer } from 'electron'
import type {
  AlertHistoryEntry,
  AlertMarker,
  AppSettings,
  MetricsSnapshot,
  ProcessDetails,
  SettingsSaveResult,
  SystemReportFormat,
  UiSettingsPatch
} from '../shared/contracts'

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electronAPI', {
      // Mini tray interface
      openMainWindow: () => ipcRenderer.invoke('open-main-window'),
      quitApp: () => ipcRenderer.invoke('quit-app'),
      setTrayCompact: (compact: boolean) => ipcRenderer.invoke('set-tray-compact', compact),

      // Live metrics
      getLatestMetrics: () => ipcRenderer.invoke('get-latest-metrics'),
      onMetricsUpdated: (callback: (snapshot: MetricsSnapshot) => void) => {
        const listener = (_event: Electron.IpcRendererEvent, snapshot: MetricsSnapshot) =>
          callback(snapshot)
        ipcRenderer.on('metrics-updated', listener)
        return () => ipcRenderer.removeListener('metrics-updated', listener)
      },
      getCpuMetrics: () => ipcRenderer.invoke('get-cpu-metrics'),
      getMemoryMetrics: () => ipcRenderer.invoke('get-memory-metrics'),
      getDiskMetrics: () => ipcRenderer.invoke('get-disk-metrics'),
      getNetworkMetrics: () => ipcRenderer.invoke('get-network-metrics'),
      getProcessMetrics: () => ipcRenderer.invoke('get-process-metrics'),
      getProcessDetails: (pid: number): Promise<ProcessDetails | null> =>
        ipcRenderer.invoke('get-process-details', pid),
      revealProcess: (pid: number): Promise<boolean> => ipcRenderer.invoke('reveal-process', pid),
      getGpuMetrics: () => ipcRenderer.invoke('get-gpu-metrics'),
      getBatteryMetrics: () => ipcRenderer.invoke('get-battery-metrics'),

      // Advanced collectors
      getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
      getThermalMetrics: () => ipcRenderer.invoke('get-thermal-metrics'),
      getStartupMetrics: () => ipcRenderer.invoke('get-startup-metrics'),
      exportSystemReport: (format: SystemReportFormat) =>
        ipcRenderer.invoke('export-system-report', format),
      getAnomalyReport: () => ipcRenderer.invoke('get-anomaly-report'),
      getAlertHistory: (): Promise<AlertHistoryEntry[]> => ipcRenderer.invoke('get-alert-history'),
      getAlertMarkers: (minutes: number): Promise<AlertMarker[]> =>
        ipcRenderer.invoke('get-alert-markers', minutes),
      markAllAlertsRead: (): Promise<AlertHistoryEntry[]> =>
        ipcRenderer.invoke('mark-all-alerts-read'),
      clearAlertHistory: (): Promise<AlertHistoryEntry[]> =>
        ipcRenderer.invoke('clear-alert-history'),
      onAlertHistoryUpdated: (callback: (alerts: AlertHistoryEntry[]) => void) => {
        const listener = (_event: Electron.IpcRendererEvent, alerts: AlertHistoryEntry[]) =>
          callback(alerts)
        ipcRenderer.on('alert-history-updated', listener)
        return () => ipcRenderer.removeListener('alert-history-updated', listener)
      },
      toggleStartupItem: (itemPath: string, enable: boolean) =>
        ipcRenderer.invoke('toggle-startup-item', itemPath, enable),

      killProcess: (pid: number) => ipcRenderer.invoke('kill-process', pid),

      // Settings
      getSettings: () => ipcRenderer.invoke('get-settings'),
      saveSettings: (settings: AppSettings): Promise<SettingsSaveResult> =>
        ipcRenderer.invoke('save-settings', settings),
      saveUiSettings: (patch: UiSettingsPatch) => ipcRenderer.invoke('save-ui-settings', patch),
      onUiSettingsChanged: (callback: (patch: UiSettingsPatch) => void) => {
        const listener = (_event: Electron.IpcRendererEvent, patch: UiSettingsPatch) =>
          callback(patch)
        ipcRenderer.on('ui-settings-changed', listener)
        return () => ipcRenderer.removeListener('ui-settings-changed', listener)
      },
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
