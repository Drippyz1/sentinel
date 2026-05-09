import { contextBridge, ipcRenderer } from 'electron'

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electronAPI', {
      getCpuMetrics:     () => ipcRenderer.invoke('get-cpu-metrics'),
      getMemoryMetrics:  () => ipcRenderer.invoke('get-memory-metrics'),
      getDiskMetrics:    () => ipcRenderer.invoke('get-disk-metrics'),
      getNetworkMetrics: () => ipcRenderer.invoke('get-network-metrics'),
      getProcessMetrics: () => ipcRenderer.invoke('get-process-metrics'),
    })
  } catch (error) {
    console.error(error)
  }
}