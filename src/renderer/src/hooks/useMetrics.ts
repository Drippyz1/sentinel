import { useEffect } from 'react'
import { useMetricsStore } from '../store/metricsStore'

export function useMetricsPolling() {
  // We grab fetchAll once using the selector pattern
  const fetchAll = useMetricsStore(state => state.fetchAll)

  useEffect(() => {
    // Fetch immediately, then every 2 seconds
    fetchAll()
    const interval = setInterval(fetchAll, 2000)
    return () => clearInterval(interval)
  }, [fetchAll]) // fetchAll is stable so this only runs once
}

export function useCpuMetrics() {
  return useMetricsStore(state => state.cpu)
}

export function useMemoryMetrics() {
  return useMetricsStore(state => state.memory)
}

export function useDiskMetrics() {
  return useMetricsStore(state => state.disk)
}

export function useNetworkMetrics() {
  return useMetricsStore(state => state.network)
}

export function useMetricsStatus() {
  const isLoading   = useMetricsStore(state => state.isLoading)
  const error       = useMetricsStore(state => state.error)
  const lastUpdated = useMetricsStore(state => state.lastUpdated)
  return { isLoading, error, lastUpdated }
}