import { contextBridge, ipcRenderer } from 'electron'
import type { ElectronApi } from '../shared/contracts/electronApi'
import type { EventChannel } from '../shared/contracts/ipcPolicy'

function subscribe<T>(channel: EventChannel, callback: (value: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, value: T) => callback(value)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: ElectronApi = {
  openMainWindow: () => ipcRenderer.invoke('open-main-window'),
  quitApp: () => ipcRenderer.invoke('quit-app'),
  copyText: (text) => ipcRenderer.invoke('copy-text', text),
  setTrayCompact: (compact) => ipcRenderer.invoke('set-tray-compact', compact),
  showMiniMonitor: () => ipcRenderer.invoke('show-mini-monitor'),
  hideMiniMonitor: () => ipcRenderer.invoke('hide-mini-monitor'),
  setMiniMonitorAlwaysOnTop: (alwaysOnTop) =>
    ipcRenderer.invoke('set-mini-monitor-always-on-top', alwaysOnTop),

  getLatestMetrics: () => ipcRenderer.invoke('get-latest-metrics'),
  onMetricsUpdated: (callback) => subscribe('metrics-updated', callback),
  getNetworkConnections: () => ipcRenderer.invoke('get-network-connections'),
  getProcessDetails: (pid) => ipcRenderer.invoke('get-process-details', pid),
  getProcessPage: (request) => ipcRenderer.invoke('get-process-page', request),
  revealProcess: (pid) => ipcRenderer.invoke('reveal-process', pid),
  killProcess: (identity) => ipcRenderer.invoke('kill-process', identity),

  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
  getThermalMetrics: () => ipcRenderer.invoke('get-thermal-metrics'),
  getStartupMetrics: () => ipcRenderer.invoke('get-startup-metrics'),
  exportSystemReport: (format) => ipcRenderer.invoke('export-system-report', format),
  exportDiagnosticBundle: () => ipcRenderer.invoke('export-diagnostic-bundle'),
  getAlertHistory: () => ipcRenderer.invoke('get-alert-history'),
  getAlertAnalytics: () => ipcRenderer.invoke('get-alert-analytics'),
  getTrayAlertSummary: () => ipcRenderer.invoke('get-tray-alert-summary'),
  getAlertMarkers: (minutes) => ipcRenderer.invoke('get-alert-markers', minutes),
  markAllAlertsRead: () => ipcRenderer.invoke('mark-all-alerts-read'),
  clearAlertHistory: () => ipcRenderer.invoke('clear-alert-history'),
  onAlertHistoryUpdated: (callback) => subscribe('alert-history-updated', callback),
  onAlertAnalyticsUpdated: (callback) => subscribe('alert-analytics-updated', callback),
  onTrayAlertSummaryUpdated: (callback) => subscribe('tray-alert-summary-updated', callback),

  getSettings: () => ipcRenderer.invoke('get-settings'),
  getUiSettings: () => ipcRenderer.invoke('get-ui-settings'),
  saveSettings: (settings, applyLogin) => ipcRenderer.invoke('save-settings', settings, applyLogin),
  saveUiSettings: (patch) => ipcRenderer.invoke('save-ui-settings', patch),
  importAppearanceProfile: () => ipcRenderer.invoke('import-appearance-profile'),
  exportAppearanceProfile: (profile) => ipcRenderer.invoke('export-appearance-profile', profile),
  onUiSettingsChanged: (callback) => subscribe('ui-settings-changed', callback),

  getHistoryDownsampled: (minutes) => ipcRenderer.invoke('get-history-downsampled', minutes),

  getStorageSession: () => ipcRenderer.invoke('storage-session'),
  chooseStorageScope: () => ipcRenderer.invoke('storage-choose'),
  startStorageScan: (id) => ipcRenderer.invoke('storage-start', id),
  cancelStorageScan: (id) => ipcRenderer.invoke('storage-cancel', id),
  dropStorageScan: (id) => ipcRenderer.invoke('storage-drop', id),
  queryStorageScan: (id, query) => ipcRenderer.invoke('storage-query', id, query),
  getDuplicateSession: () => ipcRenderer.invoke('duplicate-session'),
  chooseDuplicateScope: (mode) => ipcRenderer.invoke('duplicate-choose', mode),
  startDuplicateScan: (id) => ipcRenderer.invoke('duplicate-start', id),
  cancelDuplicateScan: (id) => ipcRenderer.invoke('duplicate-cancel', id),
  dropDuplicateScan: (id) => ipcRenderer.invoke('duplicate-drop', id),
  queryDuplicateScan: (id, query) => ipcRenderer.invoke('duplicate-query', id, query),
  previewDuplicateMember: (id, group, entry) =>
    ipcRenderer.invoke('duplicate-preview', id, group, entry)
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electronAPI', api)
  } catch (error) {
    console.error(error)
  }
}
