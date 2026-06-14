import Database from 'better-sqlite3'
import { getDatabase } from './database'
import type {
  AlertHistoryEntry,
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
