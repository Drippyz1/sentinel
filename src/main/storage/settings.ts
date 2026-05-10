import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync } from 'fs'

export interface AppSettings {
  hideFromDock:       boolean
  dataRetentionDays:  number
  anomalySensitivity: 'sensitive' | 'balanced' | 'conservative'
}

export const SENSITIVITY_THRESHOLD: Record<AppSettings['anomalySensitivity'], number> = {
  sensitive:    2.0,
  balanced:     2.5,
  conservative: 3.0,
}

const DEFAULTS: AppSettings = {
  hideFromDock:       false,
  dataRetentionDays:  7,
  anomalySensitivity: 'balanced',
}

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export function loadSettings(): AppSettings {
  try {
    const raw = readFileSync(settingsPath(), 'utf8')
    return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULTS }
  }
}

// Returns boolean so the IPC handler and frontend
// can confirm whether the save actually succeeded
export function saveSettings(settings: AppSettings): boolean {
  try {
    writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), 'utf8')
    return true
  } catch (err) {
    console.error('Failed to save settings:', err)
    return false
  }
}