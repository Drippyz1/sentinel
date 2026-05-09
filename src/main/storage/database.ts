import Database from 'better-sqlite3'
import path from 'path'
import { app } from 'electron'

// app.getPath('userData') gives us the correct OS-specific location
// On macOS: ~/Library/Application Support/sentinel/
// On Windows: C:\Users\<user>\AppData\Roaming\sentinel\
// This is the right place to store app data — not the project folder
let db: Database.Database | null = null

export function getDatabase(): Database.Database {
  if (db) return db

  const dbPath = path.join(app.getPath('userData'), 'sentinel.db')
  console.log('Database location:', dbPath)

  db = new Database(dbPath)

  // WAL mode makes writes faster and allows reads during writes
  db.pragma('journal_mode = WAL')
  // Relaxed durability — tiny risk of losing 1 reading on crash, much faster
  db.pragma('synchronous = NORMAL')

  initializeSchema(db)
  return db
}

function initializeSchema(db: Database.Database) {

  // Create the main snapshots table if it doesn't exist yet
  // "IF NOT EXISTS" means this is safe to run every time the app starts
  db.exec(`
    CREATE TABLE IF NOT EXISTS metric_snapshots (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp    INTEGER NOT NULL,
      cpu_usage    REAL    NOT NULL,
      memory_usage REAL    NOT NULL,
      memory_used  INTEGER NOT NULL,
      disk_usage   REAL    NOT NULL,
      disk_read    REAL    NOT NULL,
      disk_write   REAL    NOT NULL,
      net_down     REAL    NOT NULL,
      net_up       REAL    NOT NULL,
      gpu_usage    REAL,
      battery      REAL
    )
  `)

  // Index on timestamp so time-range queries are fast
  // Without this, "give me the last hour" would scan every row
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_snapshots_timestamp
    ON metric_snapshots(timestamp)
  `)

  console.log('Database schema ready')
}

// Called on app quit to cleanly close the connection
export function closeDatabase() {
  if (db) {
    db.close()
    db = null
  }
}