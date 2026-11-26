interface SchemaDatabase {
  exec: (sql: string) => unknown
  prepare: (sql: string) => { all: () => unknown[] }
}

const columns = {
  id: 'INTEGER PRIMARY KEY AUTOINCREMENT',
  timestamp: 'INTEGER NOT NULL',
  cpu_usage: 'REAL',
  memory_usage: 'REAL',
  memory_used: 'INTEGER',
  disk_usage: 'REAL',
  disk_available: 'INTEGER',
  disk_free: 'INTEGER',
  disk_purgeable: 'INTEGER',
  disk_read: 'REAL',
  disk_write: 'REAL',
  disk_io_in_bytes: 'INTEGER',
  net_down: 'REAL',
  net_up: 'REAL',
  gpu_usage: 'REAL',
  battery: 'REAL',
  cpu_temperature: 'REAL',
  gpu_temperature: 'REAL'
}
const definitions = Object.entries(columns)
  .map(([name, type]) => `${name} ${type}`)
  .join(', ')

export function initializeSchema(db: SchemaDatabase): void {
  db.exec('BEGIN IMMEDIATE')
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS metric_snapshots (${definitions})`)
    const existing = db.prepare('PRAGMA table_info(metric_snapshots)').all() as {
      name: string
      notnull: number
    }[]
    const existingNames = new Set(existing.map(({ name }) => name))

    if (!existingNames.has('id') || !existingNames.has('timestamp')) {
      throw new Error('Metric history has no ID or timestamp column')
    }
    if (existing.some(({ name, notnull }) => name !== 'timestamp' && name !== 'id' && notnull)) {
      if (existing.some(({ name }) => !Object.hasOwn(columns, name))) {
        throw new Error('Cannot migrate unrecognized metric snapshot columns without losing data')
      }
      // Copy the intersection so early and later schemas retain every recorded value and ID.
      const copiedColumns = Object.keys(columns)
        .filter((name) => existingNames.has(name))
        .join(', ')
      db.exec(`
        CREATE TABLE metric_snapshots_new (${definitions});
        INSERT INTO metric_snapshots_new (${copiedColumns})
          SELECT ${copiedColumns} FROM metric_snapshots;
        DROP TABLE metric_snapshots;
        ALTER TABLE metric_snapshots_new RENAME TO metric_snapshots;
      `)
    } else {
      for (const [name, type] of Object.entries(columns)) {
        if (!existingNames.has(name))
          db.exec(`ALTER TABLE metric_snapshots ADD COLUMN ${name} ${type}`)
      }
    }

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_snapshots_timestamp ON metric_snapshots(timestamp);
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
      );
      CREATE INDEX IF NOT EXISTS idx_alert_history_timestamp ON alert_history(timestamp DESC);
    `)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}
