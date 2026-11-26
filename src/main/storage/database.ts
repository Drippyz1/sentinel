import Database from 'better-sqlite3'
import { lstatSync, openSync, closeSync, chmodSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { initializeSchema } from './schema'

let db: Database.Database | null = null
let initializationError: Error | null = null
let closed = false

export function getDatabasePath(): string {
  return join(app.getPath('userData'), 'sentinel.db')
}

export function getDatabase(): Database.Database {
  if (closed) throw new Error('Local history is closed')
  if (db) return db
  if (initializationError) throw initializationError

  let opened: Database.Database | undefined
  try {
    const path = getDatabasePath()
    try {
      closeSync(openSync(path, 'wx', 0o600))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      const stat = lstatSync(path)
      if (!stat.isFile() || stat.nlink !== 1) throw new Error('History path must be a regular file')
      if (process.getuid && stat.uid !== process.getuid()) {
        throw new Error('History file must belong to the current user')
      }
      if (process.platform !== 'win32' && (stat.mode & 0o077) !== 0) chmodSync(path, 0o600)
    }
    opened = new Database(path, { timeout: 1000 })
    opened.pragma('trusted_schema = OFF')
    opened.pragma('journal_mode = WAL')
    opened.pragma('synchronous = NORMAL')
    initializeSchema(opened)
    db = opened
    return db
  } catch (error) {
    opened?.close()
    initializationError = new Error('Could not open local history storage', { cause: error })
    throw initializationError
  }
}

export function canRecordHistory(): boolean {
  return db !== null && !closed
}

export function closeDatabase(): void {
  closed = true
  db?.close()
  db = null
}
