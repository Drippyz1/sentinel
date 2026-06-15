import Database from 'better-sqlite3'
import { getDatabase } from './database'
import type {
  AlertAnalytics,
  AlertHistoryEntry,
  AlertMarker,
  MonitoringAlertSeverity,
  MonitoringAlertType,
  NewAlertHistoryEntry
} from '../../shared/contracts'

const ALERT_HISTORY_LIMIT = 100

interface AlertHistoryRow {
  id: number
  timestamp: number
  type: MonitoringAlertType
  severity: MonitoringAlertSeverity
  title: string
  message: string
  metric_value: number
  threshold: number
  is_read: number
}

interface AlertAnalyticsRow {
  alerts_last_24_hours: number | null
  alerts_last_7_days: number | null
  unread_alerts: number | null
  last_alert_timestamp: number | null
  cpu_count: number | null
  memory_count: number | null
  disk_count: number | null
  battery_count: number | null
  warning_count: number | null
  critical_count: number | null
}

let cachedAlerts: AlertHistoryEntry[] | null = null
let insertStatement: Database.Statement | null = null
let trimStatement: Database.Statement | null = null

function mapRow(row: AlertHistoryRow): AlertHistoryEntry {
  return {
    id: row.id,
    timestamp: row.timestamp,
    type: row.type,
    severity: row.severity,
    title: row.title,
    message: row.message,
    metricValue: row.metric_value,
    threshold: row.threshold,
    read: row.is_read === 1
  }
}

function loadAlertHistory(): AlertHistoryEntry[] {
  const rows = getDatabase()
    .prepare(
      `SELECT id, timestamp, type, severity, title, message, metric_value, threshold, is_read
       FROM alert_history
       ORDER BY timestamp DESC, id DESC
       LIMIT ?`
    )
    .all(ALERT_HISTORY_LIMIT) as AlertHistoryRow[]

  return rows.map(mapRow)
}

export function getAlertHistory(): AlertHistoryEntry[] {
  if (!cachedAlerts) cachedAlerts = loadAlertHistory()
  return [...cachedAlerts]
}

export function getAlertAnalytics(): AlertAnalytics {
  const now = Date.now()
  const row = getDatabase()
    .prepare(
      `SELECT
         SUM(CASE WHEN timestamp >= @dayCutoff THEN 1 ELSE 0 END) AS alerts_last_24_hours,
         SUM(CASE WHEN timestamp >= @weekCutoff THEN 1 ELSE 0 END) AS alerts_last_7_days,
         SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) AS unread_alerts,
         MAX(timestamp) AS last_alert_timestamp,
         SUM(CASE WHEN type = 'cpu' THEN 1 ELSE 0 END) AS cpu_count,
         SUM(CASE WHEN type = 'memory' THEN 1 ELSE 0 END) AS memory_count,
         SUM(CASE WHEN type = 'disk' THEN 1 ELSE 0 END) AS disk_count,
         SUM(CASE WHEN type = 'battery' THEN 1 ELSE 0 END) AS battery_count,
         SUM(CASE WHEN severity = 'warning' THEN 1 ELSE 0 END) AS warning_count,
         SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END) AS critical_count
       FROM alert_history`
    )
    .get({
      dayCutoff: now - 24 * 60 * 60 * 1000,
      weekCutoff: now - 7 * 24 * 60 * 60 * 1000
    }) as AlertAnalyticsRow

  const countsByType: AlertAnalytics['countsByType'] = {
    cpu: row.cpu_count ?? 0,
    memory: row.memory_count ?? 0,
    disk: row.disk_count ?? 0,
    battery: row.battery_count ?? 0
  }
  const mostCommonType = (
    Object.entries(countsByType) as [MonitoringAlertType, number][]
  ).reduce<MonitoringAlertType | null>(
    (mostCommon, [type, count]) =>
      count > 0 && (mostCommon === null || count > countsByType[mostCommon]) ? type : mostCommon,
    null
  )

  return {
    alertsLast24Hours: row.alerts_last_24_hours ?? 0,
    alertsLast7Days: row.alerts_last_7_days ?? 0,
    unreadAlerts: row.unread_alerts ?? 0,
    mostCommonType,
    lastAlertTimestamp: row.last_alert_timestamp,
    countsByType,
    countsBySeverity: {
      warning: row.warning_count ?? 0,
      critical: row.critical_count ?? 0
    }
  }
}

export function getAlertMarkers(minutes: number): AlertMarker[] {
  const cutoff = Date.now() - minutes * 60 * 1000
  const rows = getDatabase()
    .prepare(
      `SELECT id, timestamp, type, severity, title, message, metric_value, threshold
       FROM alert_history
       WHERE timestamp > ?
       ORDER BY timestamp ASC, id ASC`
    )
    .all(cutoff) as Omit<AlertHistoryRow, 'is_read'>[]

  return rows.map((row) => ({
    id: row.id,
    timestamp: row.timestamp,
    type: row.type,
    severity: row.severity,
    title: row.title,
    message: row.message,
    metricValue: row.metric_value,
    threshold: row.threshold
  }))
}

export function recordAlertHistory(entries: NewAlertHistoryEntry[]): AlertHistoryEntry[] {
  if (entries.length === 0) return getAlertHistory()

  const database = getDatabase()
  insertStatement ??= database.prepare(`
    INSERT INTO alert_history (
      timestamp, type, severity, title, message, metric_value, threshold, is_read
    ) VALUES (
      @timestamp, @type, @severity, @title, @message, @metricValue, @threshold, 0
    )
  `)
  trimStatement ??= database.prepare(`
    DELETE FROM alert_history
    WHERE id NOT IN (
      SELECT id FROM alert_history
      ORDER BY timestamp DESC, id DESC
      LIMIT ${ALERT_HISTORY_LIMIT}
    )
  `)

  database.transaction((newEntries: NewAlertHistoryEntry[]) => {
    for (const entry of newEntries) insertStatement?.run(entry)
    trimStatement?.run()
  })(entries)

  cachedAlerts = loadAlertHistory()
  return [...cachedAlerts]
}

export function markAllAlertHistoryRead(): AlertHistoryEntry[] {
  getDatabase().prepare('UPDATE alert_history SET is_read = 1 WHERE is_read = 0').run()
  cachedAlerts = loadAlertHistory()
  return [...cachedAlerts]
}

export function clearAlertHistory(): AlertHistoryEntry[] {
  getDatabase().prepare('DELETE FROM alert_history').run()
  cachedAlerts = []
  return []
}
