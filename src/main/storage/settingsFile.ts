import { randomUUID } from 'node:crypto'
import {
  closeSync,
  lstatSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import type { SettingsPersistenceIssue } from '../../shared/contracts/settings'

export function readSettingsFile(
  path: string,
  version: number
): { value: unknown; issue: SettingsPersistenceIssue | null } {
  let raw: string
  try {
    const stat = lstatSync(path)
    if (!stat.isFile() || stat.size > 1024 * 1024) return { value: null, issue: 'unreadable' }
    raw = readFileSync(path, 'utf8')
  } catch (error) {
    return {
      value: {},
      issue: (error as NodeJS.ErrnoException).code === 'ENOENT' ? null : 'unreadable'
    }
  }
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { value: null, issue: 'invalid' }
    }
    if ('settingsVersion' in value && value.settingsVersion !== version) {
      return { value: null, issue: 'incompatible' }
    }
    return { value, issue: null }
  } catch {
    return { value: null, issue: 'invalid' }
  }
}

export function replaceSettingsFile(
  path: string,
  value: unknown,
  tempId: string = randomUUID()
): void {
  const temporary = `${path}.${tempId}.tmp`
  // Only clean up after exclusive creation succeeds; a collision is not ours.
  const fd = openSync(temporary, 'wx', 0o600)
  try {
    try {
      writeFileSync(fd, JSON.stringify(value, null, 2), 'utf8')
    } finally {
      closeSync(fd)
    }
    renameSync(temporary, path)
  } catch (error) {
    try {
      unlinkSync(temporary)
    } catch {
      // The primary write or rename failure is more useful to the caller.
    }
    throw error
  }
}
