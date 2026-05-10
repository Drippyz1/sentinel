import Database from 'better-sqlite3'
import path from 'path'
import { app } from 'electron'

let db: Database.Database | null = null

export function getDatabase(): Database.Database {
  if (db) return db

  const dbPath = path.join(app.getPath('userData'), 'sentinel.db')
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
      battery      REAL
    )
  `)

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_snapshots_timestamp
    ON metric_snapshots(timestamp)
  `)

  // Migrate existing databases that have the old NOT NULL constraints.
  // SQLite can't ALTER COLUMN, so we recreate the table if the old
  // schema is detected by checking the column info.
  migrateSchema(db)

  console.log('Database schema ready')
}

function migrateSchema(db: Database.Database) {
  try {
    const cols = db.pragma('table_info(metric_snapshots)') as {
      name: string
      notnull: number
    }[]

    const diskRead = cols.find(c => c.name === 'disk_read')

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
          battery      REAL
        );

        INSERT INTO metric_snapshots_new
          SELECT id, timestamp, cpu_usage, memory_usage, memory_used,
                 disk_usage, disk_read, disk_write, net_down, net_up,
                 gpu_usage, battery
          FROM metric_snapshots;

        DROP TABLE metric_snapshots;

        ALTER TABLE metric_snapshots_new RENAME TO metric_snapshots;

        CREATE INDEX IF NOT EXISTS idx_snapshots_timestamp
          ON metric_snapshots(timestamp);

        COMMIT;
      `)

      console.log('Schema migration complete')
    }
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
