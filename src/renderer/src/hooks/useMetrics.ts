import { useState, useEffect } from 'react'
import { useMetricsStore } from '../store/metricsStore'
import { AnomalyReport } from '../../../main/analysis/anomalyDetector'

export function useMetricsPolling() {
  const fetchAll = useMetricsStore((state) => state.fetchAll)
  const fetchProcesses = useMetricsStore((state) => state.fetchProcesses)
  const fetchBattery = useMetricsStore((state) => state.fetchBattery)

  useEffect(() => {
    // Hardware + GPU — every 2 seconds
    fetchAll()
    const hardwareInterval = setInterval(fetchAll, 2000)

    // Processes — every 3 seconds
    fetchProcesses()
    const processInterval = setInterval(fetchProcesses, 3000)

    // Battery — every 15 seconds (it barely changes)
    fetchBattery()
    const batteryInterval = setInterval(fetchBattery, 15000)

    return () => {
      clearInterval(hardwareInterval)
      clearInterval(processInterval)
      clearInterval(batteryInterval)
    }
  }, [fetchAll, fetchBattery, fetchProcesses])
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
  const [report, setReport] = useState<AnomalyReport | null>(null)

  useEffect(() => {
    const fetch = async () => {
      const data = await window.electronAPI.getAnomalyReport()
      setReport(data)
    }
    fetch()
    const interval = setInterval(fetch, 2000)
    return () => clearInterval(interval)
  }, [])

  return report
}
