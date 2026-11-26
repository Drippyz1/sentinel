import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { initializeSchema } from '../src/main/storage/schema'

test('legacy history migration retains IDs, optional capacity and temperature values, and alerts', () => {
  const db = new DatabaseSync(':memory:')
  try {
    initializeSchema(db)
    db.exec(`
      DROP TABLE metric_snapshots;
      CREATE TABLE metric_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp INTEGER NOT NULL,
        cpu_usage REAL NOT NULL, memory_usage REAL NOT NULL, memory_used INTEGER NOT NULL,
        disk_usage REAL NOT NULL, disk_read REAL NOT NULL, disk_write REAL,
        disk_available INTEGER, disk_free INTEGER, disk_purgeable INTEGER,
        cpu_temperature REAL, gpu_temperature REAL
      );
      INSERT INTO metric_snapshots VALUES (42, 1000, 30, 40, 4096, 65, 17, 20, 700, 500, 200, 41, 54);
      INSERT INTO alert_history VALUES (9, 1000, 'cpu', 'warning', 'Alert', 'Sample', 91, 90, 1);
    `)
    initializeSchema(db)
    initializeSchema(db)
    const old = db.prepare('SELECT * FROM metric_snapshots WHERE id = 42').get()
    assert.equal(old?.disk_available, 700)
    assert.equal(old?.disk_free, 500)
    assert.equal(old?.disk_purgeable, 200)
    assert.equal(old?.cpu_temperature, 41)
    assert.equal(old?.gpu_temperature, 54)
    assert.equal(old?.disk_read, 17)
    assert.equal(old?.disk_io_in_bytes, null)
    assert.equal(db.prepare('SELECT is_read FROM alert_history WHERE id = 9').get()?.is_read, 1)
    db.exec(
      'INSERT INTO metric_snapshots (timestamp, disk_read, disk_io_in_bytes) VALUES (1001, 0, 1)'
    )
    const latest = db.prepare('SELECT * FROM metric_snapshots WHERE id = 43').get()
    assert.equal(latest?.cpu_usage, null)
    assert.equal(latest?.disk_read, 0)
    assert.equal(latest?.disk_io_in_bytes, 1)
  } finally {
    db.close()
  }
})

test('unrecognized legacy data triggers rollback rather than dropping columns', () => {
  const db = new DatabaseSync(':memory:')
  try {
    db.exec(`
      CREATE TABLE metric_snapshots (
        id INTEGER PRIMARY KEY, timestamp INTEGER NOT NULL, cpu_usage REAL NOT NULL, extra TEXT
      );
      INSERT INTO metric_snapshots VALUES (1, 1000, 30, 'keep this');
    `)
    assert.throws(() => initializeSchema(db), /unrecognized/)
    assert.equal(db.prepare('SELECT extra FROM metric_snapshots').get()?.extra, 'keep this')
    assert.equal(
      db
        .prepare('SELECT COUNT(*) AS count FROM sqlite_master WHERE name = ?')
        .get('metric_snapshots_new')?.count,
      0
    )
  } finally {
    db.close()
  }
})
