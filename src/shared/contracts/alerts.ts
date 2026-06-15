export type MonitoringAlertType = 'cpu' | 'memory' | 'disk' | 'battery'
export type MonitoringAlertSeverity = 'warning' | 'critical'

export interface AlertMarker {
  id: number
  timestamp: number
  type: MonitoringAlertType
  severity: MonitoringAlertSeverity
  title: string
  message: string
  metricValue: number
  threshold: number
}

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

export interface AlertAnalytics {
  alertsLast24Hours: number
  alertsLast7Days: number
  unreadAlerts: number
  mostCommonType: MonitoringAlertType | null
  lastAlertTimestamp: number | null
  countsByType: Record<MonitoringAlertType, number>
  countsBySeverity: Record<MonitoringAlertSeverity, number>
}

export type NewAlertHistoryEntry = Omit<AlertHistoryEntry, 'id' | 'read'>
