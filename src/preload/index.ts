import { contextBridge, ipcRenderer } from 'electron'

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electronAPI', {
      // Live metrics
      getCpuMetrics:     () => ipcRenderer.invoke('get-cpu-metrics'),
      getMemoryMetrics:  () => ipcRenderer.invoke('get-memory-metrics'),
      getDiskMetrics:    () => ipcRenderer.invoke('get-disk-metrics'),
      getNetworkMetrics: () => ipcRenderer.invoke('get-network-metrics'),
      getProcessMetrics: () => ipcRenderer.invoke('get-process-metrics'),
      getGpuMetrics:     () => ipcRenderer.invoke('get-gpu-metrics'),
      getBatteryMetrics: () => ipcRenderer.invoke('get-battery-metrics'),

      // Historical data
      getHistorySnapshots:   (minutes: number) => ipcRenderer.invoke('get-history-snapshots',   minutes),
      getHistorySummary:     (minutes: number) => ipcRenderer.invoke('get-history-summary',     minutes),
      getHistoryDownsampled: (minutes: number) => ipcRenderer.invoke('get-history-downsampled', minutes),
    })
  } catch (error) {
    console.error(error)
  }
}