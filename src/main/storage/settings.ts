import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync } from 'fs'

export interface AppSettings {
  // System
  launchAtLogin: boolean
  hideFromDock: boolean
  // Monitoring
  pollIntervalMs: number
  tempUnit: 'C' | 'F'
  // Data
  dataRetentionDays: number
  // Anomaly detection
  anomalySensitivity: 'sensitive' | 'balanced' | 'conservative'
  anomalyNotifications: boolean
}

export const SENSITIVITY_THRESHOLD: Record<AppSettings['anomalySensitivity'], number> = {
  sensitive: 2.0,
  balanced: 2.5,
  conservative: 3.0
}

const DEFAULTS: AppSettings = {
  launchAtLogin: false,
  hideFromDock: false,
  pollIntervalMs: 2000,
  tempUnit: 'C',
  dataRetentionDays: 7,
  anomalySensitivity: 'balanced',
  anomalyNotifications: true
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

export function saveSettings(settings: AppSettings): boolean {
  try {
    // Apply launch at login via Electron's native API
    app.setLoginItemSettings({
      openAtLogin: settings.launchAtLogin,
      openAsHidden: true // start minimised to tray, not foregrounded
    })

    writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), 'utf8')
    return true
  } catch (err) {
    console.error('Failed to save settings:', err)
    return false
  }
}

// Read the actual OS login item state so the toggle
// reflects reality on first launch, not just our saved value
export function getLaunchAtLoginState(): boolean {
  try {
    return app.getLoginItemSettings().openAtLogin
  } catch {
    return false
  }
}
