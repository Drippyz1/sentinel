export type MonitoringAlertType = 'cpu' | 'memory' | 'disk' | 'battery'
export type MonitoringAlertSeverity = 'warning' | 'critical'

export interface AlertHistoryEntry {
  id: number
  timestamp: number
  type: MonitoringAlertType
  severity: MonitoringAlertSeverity
  title: string
  message: string
  metricValue: number
  threshold: number
  read: boolean
}

export type NewAlertHistoryEntry = Omit<AlertHistoryEntry, 'id' | 'read'>
