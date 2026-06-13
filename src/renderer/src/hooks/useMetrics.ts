import { useEffect } from 'react'
import { useMetricsStore } from '../store/metricsStore'

export function useMetricsSubscription() {
  const applySnapshot = useMetricsStore((state) => state.applySnapshot)
  const setMetricsError = useMetricsStore((state) => state.setMetricsError)

  useEffect(() => {
    const stopListening = window.electronAPI.onMetricsUpdated(applySnapshot)

    void window.electronAPI
      .getLatestMetrics()
      .then(applySnapshot)
      .catch((error) => {
        setMetricsError(error instanceof Error ? error.message : 'Failed to fetch metrics')
      })

    return stopListening
  }, [applySnapshot, setMetricsError])
}

export function useCpuMetrics() {
  return useMetricsStore((state) => state.cpu)
}

export function useMemoryMetrics() {
  return useMetricsStore((state) => state.memory)
}

export function useDiskMetrics() {
  return useMetricsStore((state) => state.disk)
}

export function useNetworkMetrics() {
  return useMetricsStore((state) => state.network)
}

export function useProcessMetrics() {
  return useMetricsStore((state) => state.processes)
}

export function useProcessMetricsStatus() {
  return useMetricsStore((state) => state.processesUpdatedAt)
}

export function useGpuMetrics() {
  return useMetricsStore((state) => state.gpu)
}

export function useBatteryMetrics() {
  return useMetricsStore((state) => state.battery)
}

export function useMetricsStatus() {
  const isLoading = useMetricsStore((state) => state.isLoading)
  const error = useMetricsStore((state) => state.error)
  const lastUpdated = useMetricsStore((state) => state.lastUpdated)
  return { isLoading, error, lastUpdated }
}

export function useAnomalyReport() {
  return useMetricsStore((state) => state.anomalyReport)
}
