import { contextBridge, ipcRenderer } from 'electron'
import type {
  AlertAnalytics,
  AlertHistoryEntry,
  AlertMarker,
  AppSettings,
  DiagnosticBundleExport,
  LiveMetricsFrame,
  NetworkConnectionsResult,
  ProcessDetails,
  ProcessIdentity,
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
      copyText: (text: string) => ipcRenderer.invoke('copy-text', text),
      setTrayCompact: (compact: boolean) => ipcRenderer.invoke('set-tray-compact', compact),
      showMiniMonitor: () => ipcRenderer.invoke('show-mini-monitor'),
      hideMiniMonitor: () => ipcRenderer.invoke('hide-mini-monitor'),
      setMiniMonitorAlwaysOnTop: (alwaysOnTop: boolean) =>
        ipcRenderer.invoke('set-mini-monitor-always-on-top', alwaysOnTop),

      // Live metrics
      getLatestMetrics: () => ipcRenderer.invoke('get-latest-metrics'),
      onMetricsUpdated: (callback: (snapshot: LiveMetricsFrame) => void) => {
        const listener = (_event: Electron.IpcRendererEvent, snapshot: LiveMetricsFrame) =>
          callback(snapshot)
        ipcRenderer.on('metrics-updated', listener)
        return () => ipcRenderer.removeListener('metrics-updated', listener)
      },
      getNetworkConnections: (): Promise<NetworkConnectionsResult> =>
        ipcRenderer.invoke('get-network-connections'),
      getProcessDetails: (pid: number): Promise<ProcessDetails | null> =>
        ipcRenderer.invoke('get-process-details', pid),
      revealProcess: (pid: number): Promise<boolean> => ipcRenderer.invoke('reveal-process', pid),

      // Advanced collectors
      getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
      getThermalMetrics: () => ipcRenderer.invoke('get-thermal-metrics'),
      getStartupMetrics: () => ipcRenderer.invoke('get-startup-metrics'),
      exportSystemReport: (format: SystemReportFormat) =>
        ipcRenderer.invoke('export-system-report', format),
      exportDiagnosticBundle: (): Promise<DiagnosticBundleExport> =>
        ipcRenderer.invoke('export-diagnostic-bundle'),
      getAlertHistory: (): Promise<AlertHistoryEntry[]> => ipcRenderer.invoke('get-alert-history'),
      getAlertAnalytics: (): Promise<AlertAnalytics> => ipcRenderer.invoke('get-alert-analytics'),
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
      onAlertAnalyticsUpdated: (callback: (analytics: AlertAnalytics) => void) => {
        const listener = (_event: Electron.IpcRendererEvent, analytics: AlertAnalytics) =>
          callback(analytics)
        ipcRenderer.on('alert-analytics-updated', listener)
        return () => ipcRenderer.removeListener('alert-analytics-updated', listener)
      },
      killProcess: ({ pid, name, started }: ProcessIdentity) =>
        ipcRenderer.invoke('kill-process', { pid, name, started }),

      // Settings
      getSettings: () => ipcRenderer.invoke('get-settings'),
      saveSettings: (settings: AppSettings): Promise<SettingsSaveResult> =>
        ipcRenderer.invoke('save-settings', settings),
      onTempUnitChanged: (callback: (unit: AppSettings['tempUnit']) => void) => {
        const listener = (_event: Electron.IpcRendererEvent, unit: AppSettings['tempUnit']) =>
          callback(unit)
        ipcRenderer.on('temp-unit-changed', listener)
        return () => ipcRenderer.removeListener('temp-unit-changed', listener)
      },
      saveUiSettings: (patch: UiSettingsPatch) => ipcRenderer.invoke('save-ui-settings', patch),
      onUiSettingsChanged: (callback: (patch: UiSettingsPatch) => void) => {
        const listener = (_event: Electron.IpcRendererEvent, patch: UiSettingsPatch) =>
          callback(patch)
        ipcRenderer.on('ui-settings-changed', listener)
        return () => ipcRenderer.removeListener('ui-settings-changed', listener)
      },

      // Historical data
      getHistoryDownsampled: (minutes: number) =>
        ipcRenderer.invoke('get-history-downsampled', minutes)
    })
  } catch (error) {
    console.error(error)
  }
}
