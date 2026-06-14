import Database from 'better-sqlite3'
import path from 'path'
import { app } from 'electron'

let db: Database.Database | null = null

export function getDatabasePath(): string {
  return path.join(app.getPath('userData'), 'sentinel.db')
}

export function getDatabase(): Database.Database {
  if (db) return db

  const dbPath = getDatabasePath()
  console.log('Database location:', dbPath)

  db = new Database(dbPath)

  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')

  initializeSchema(db)
  return db
}

function initializeSchema(db: Database.Database) {
  // Create table with nullable disk_read/disk_write/net_down/net_up —
  // these come from OS counters that can return null on the first poll
  // or when the hardware counter hasn't been populated yet
  db.exec(`
    CREATE TABLE IF NOT EXISTS metric_snapshots (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp    INTEGER NOT NULL,
      cpu_usage    REAL    NOT NULL,
      memory_usage REAL    NOT NULL,
      memory_used  INTEGER NOT NULL,
      disk_usage   REAL    NOT NULL,
      disk_read    REAL,
      disk_write   REAL,
      net_down     REAL,
      net_up       REAL,
      gpu_usage    REAL,
      battery      REAL,
      cpu_temperature REAL,
      gpu_temperature REAL
    )
  `)

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_snapshots_timestamp
    ON metric_snapshots(timestamp)
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS alert_history (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp    INTEGER NOT NULL,
      type         TEXT    NOT NULL,
      severity     TEXT    NOT NULL,
      title        TEXT    NOT NULL,
      message      TEXT    NOT NULL,
      metric_value REAL    NOT NULL,
      threshold    REAL    NOT NULL,
      is_read      INTEGER NOT NULL DEFAULT 0
    )
  `)

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_alert_history_timestamp
    ON alert_history(timestamp DESC)
  `)

  // Migrate existing databases that have the old NOT NULL constraints.
  // SQLite can't ALTER COLUMN, so we recreate the table if the old
  // schema is detected by checking the column info.
  migrateSchema(db)

  console.log('Database schema ready')
}

function migrateSchema(db: Database.Database) {
  try {
    let cols = db.pragma('table_info(metric_snapshots)') as {
      name: string
      notnull: number
    }[]

    const diskRead = cols.find((c) => c.name === 'disk_read')

    // If disk_read still has NOT NULL, recreate the table without that constraint
    if (diskRead?.notnull === 1) {
      console.log('Migrating schema: removing NOT NULL from IO columns...')

      db.exec(`
        BEGIN;

        CREATE TABLE metric_snapshots_new (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp    INTEGER NOT NULL,
          cpu_usage    REAL    NOT NULL,
          memory_usage REAL    NOT NULL,
          memory_used  INTEGER NOT NULL,
          disk_usage   REAL    NOT NULL,
          disk_read    REAL,
          disk_write   REAL,
          net_down     REAL,
          net_up       REAL,
          gpu_usage    REAL,
          battery      REAL,
          cpu_temperature REAL,
          gpu_temperature REAL
        );

        INSERT INTO metric_snapshots_new
          SELECT id, timestamp, cpu_usage, memory_usage, memory_used,
                 disk_usage, disk_read, disk_write, net_down, net_up,
                 gpu_usage, battery, NULL, NULL
          FROM metric_snapshots;

        DROP TABLE metric_snapshots;

        ALTER TABLE metric_snapshots_new RENAME TO metric_snapshots;

        CREATE INDEX IF NOT EXISTS idx_snapshots_timestamp
          ON metric_snapshots(timestamp);

        COMMIT;
      `)

      console.log('Schema migration complete')
      cols = db.pragma('table_info(metric_snapshots)') as {
        name: string
        notnull: number
      }[]
    }

    const columnNames = new Set(cols.map((column) => column.name))
    if (!columnNames.has('cpu_temperature')) {
      db.exec('ALTER TABLE metric_snapshots ADD COLUMN cpu_temperature REAL')
      console.log('Schema migration complete: added CPU temperature history')
    }
    if (!columnNames.has('gpu_temperature')) {
      db.exec('ALTER TABLE metric_snapshots ADD COLUMN gpu_temperature REAL')
      console.log('Schema migration complete: added GPU temperature history')
    }

    db.exec(`
      UPDATE metric_snapshots
      SET cpu_temperature = NULL
      WHERE cpu_temperature IS NOT NULL
        AND (cpu_temperature <= 0 OR cpu_temperature >= 1.7976931348623157e308);

      UPDATE metric_snapshots
      SET gpu_temperature = NULL
      WHERE gpu_temperature IS NOT NULL
        AND (gpu_temperature <= 0 OR gpu_temperature >= 1.7976931348623157e308);
    `)
  } catch (err) {
    console.error('Schema migration failed:', err)
  }
}

export function closeDatabase() {
  if (db) {
    db.close()
    db = null
  }
}
