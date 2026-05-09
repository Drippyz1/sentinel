import { useEffect } from 'react'
import { useMetricsStore } from '../store/metricsStore'

export function useMetricsPolling() {
  const fetchAll       = useMetricsStore(state => state.fetchAll)
  const fetchProcesses = useMetricsStore(state => state.fetchProcesses)

  useEffect(() => {
    fetchAll()
    const hardwareInterval = setInterval(fetchAll, 2000)

    fetchProcesses()
    const processInterval = setInterval(fetchProcesses, 3000)

    return () => {
      clearInterval(hardwareInterval)
      clearInterval(processInterval)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])  // ← empty array, not [fetchAll, fetchProcesses]
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

export function useProcessMetrics() {
  return useMetricsStore(state => state.processes)
}

export function useMetricsStatus() {
  const isLoading   = useMetricsStore(state => state.isLoading)
  const error       = useMetricsStore(state => state.error)
  const lastUpdated = useMetricsStore(state => state.lastUpdated)
  return { isLoading, error, lastUpdated }
}