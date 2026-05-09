import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

export interface StartupItem {
  name:        string
  path:        string
  type:        'LaunchAgent' | 'LaunchDaemon' | 'LoginItem'
  enabled:     boolean
  editable:    boolean
  description: string
}

export interface StartupMetrics {
  items:        StartupItem[]
  totalCount:   number
  enabledCount: number
}

export async function getStartupMetrics(): Promise<StartupMetrics> {
  const items: StartupItem[] = []

  const userAgentsPath   = path.join(os.homedir(), 'Library', 'LaunchAgents')
  const systemAgentsPath = '/Library/LaunchAgents'
  const daemonsPath      = '/Library/LaunchDaemons'

  items.push(...readPlistDirectory(userAgentsPath,   'LaunchAgent'))
  items.push(...readPlistDirectory(systemAgentsPath, 'LaunchAgent'))
  items.push(...readPlistDirectory(daemonsPath,      'LaunchDaemon'))
  items.push(...getLoginItems())

  items.sort((a, b) => a.name.localeCompare(b.name))

  return {
    items,
    totalCount:   items.length,
    enabledCount: items.filter(i => i.enabled).length,
  }
}

// ─────────────────────────────────────────────
// Test whether a plist can be safely edited
// plutil -lint validates the file format
// Returns false for corrupted or unreadable files
// ─────────────────────────────────────────────
function isPlistEditable(itemPath: string): boolean {
  try {
    execSync(`plutil -lint "${itemPath}" 2>/dev/null`, { timeout: 2000 })
    return true
  } catch {
    return false
  }
}

// ─────────────────────────────────────────────
// Disable a user LaunchAgent
// Handles three plist formats:
//   1. Empty self-closing <dict/>  (Google Keystone style)
//   2. Existing <key>Disabled</key> — update its value
//   3. Normal dict with no Disabled key — insert it
// Also ensures the file is writable before modifying
// ─────────────────────────────────────────────
export function disableStartupItem(itemPath: string): boolean {
  try {
    const userAgentsPath = path.join(os.homedir(), 'Library', 'LaunchAgents')
    if (!itemPath.startsWith(userAgentsPath)) {
      console.warn('Cannot disable system-level startup item:', itemPath)
      return false
    }

    // Unload from launchctl — stops the process immediately
    try {
      execSync(`launchctl unload "${itemPath}" 2>/dev/null`, { timeout: 3000 })
    } catch {
      // Fine if it wasn't loaded
    }

    // Convert binary plist to XML so we can edit it as text
    // plutil is a macOS built-in — safe to run on XML plists too (no-op)
    try {
      execSync(`plutil -convert xml1 "${itemPath}"`, { timeout: 3000 })
    } catch {
      console.warn('Could not convert plist to XML:', itemPath)
      return false
    }

    // Ensure the file is writable by the owner
    // Some installers (e.g. Google) create files with read-only permissions
    try {
      execSync(`chmod 644 "${itemPath}"`, { timeout: 1000 })
    } catch {
      // If chmod fails we'll find out on the write below
    }

    let content = fs.readFileSync(itemPath, 'utf8')

    if (content.includes('<dict/>')) {
      // Format 1: empty self-closing dict — expand it and add Disabled=true
      // Google Keystone uses this as a placeholder plist
      content = content.replace(
        '<dict/>',
        '<dict>\n\t<key>Disabled</key>\n\t<true/>\n</dict>'
      )
    } else if (content.includes('<key>Disabled</key>')) {
      // Format 2: Disabled key already exists — flip it to true
      content = content.replace(
        /<key>Disabled<\/key>\s*<(true|false)\/>/,
        '<key>Disabled</key>\n\t<true/>'
      )
    } else {
      // Format 3: normal dict with content but no Disabled key
      // Insert the key before the closing </dict>
      content = content.replace(
        /<\/dict>\s*<\/plist>/,
        '\t<key>Disabled</key>\n\t<true/>\n</dict>\n</plist>'
      )
    }

    fs.writeFileSync(itemPath, content, 'utf8')
    return true

  } catch (err) {
    console.error('Failed to disable startup item:', err)
    return false
  }
}

// ─────────────────────────────────────────────
// Enable a user LaunchAgent
// Mirrors the same three-format handling as
// disableStartupItem, then loads with launchctl
// ─────────────────────────────────────────────
export function enableStartupItem(itemPath: string): boolean {
  try {
    const userAgentsPath = path.join(os.homedir(), 'Library', 'LaunchAgents')
    if (!itemPath.startsWith(userAgentsPath)) {
      console.warn('Cannot enable system-level startup item:', itemPath)
      return false
    }

    // Convert binary plist to XML so we can edit it as text
    try {
      execSync(`plutil -convert xml1 "${itemPath}"`, { timeout: 3000 })
    } catch {
      console.warn('Could not convert plist to XML:', itemPath)
      return false
    }

    // Ensure the file is writable by the owner
    try {
      execSync(`chmod 644 "${itemPath}"`, { timeout: 1000 })
    } catch {
      // If chmod fails we'll find out on the write below
    }

    let content = fs.readFileSync(itemPath, 'utf8')

    if (content.includes('<dict/>')) {
      // Format 1: empty self-closing dict — already effectively enabled
      // No Disabled key means launchctl will load it normally
      // No file write needed, just load it below
    } else if (content.includes('<key>Disabled</key>')) {
      // Format 2: Disabled key exists — flip it to false
      content = content.replace(
        /<key>Disabled<\/key>\s*<(true|false)\/>/,
        '<key>Disabled</key>\n\t<false/>'
      )
      fs.writeFileSync(itemPath, content, 'utf8')
    }
    // Format 3: no Disabled key — already enabled by default
    // No file write needed, just load it below

    // Start it immediately without requiring a reboot
    try {
      execSync(`launchctl load "${itemPath}" 2>/dev/null`, { timeout: 3000 })
    } catch {
      // Fine if already loaded
    }

    return true

  } catch (err) {
    console.error('Failed to enable startup item:', err)
    return false
  }
}

// ─────────────────────────────────────────────
// Private helpers
// ─────────────────────────────────────────────

function readPlistDirectory(
  dirPath: string,
  type: 'LaunchAgent' | 'LaunchDaemon'
): StartupItem[] {
  const items: StartupItem[] = []

  try {
    if (!fs.existsSync(dirPath)) return items

    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.plist'))

    for (const file of files) {
      try {
        const fullPath = path.join(dirPath, file)
        const name     = file.replace('.plist', '')
        const content  = fs.readFileSync(fullPath, 'utf8')

        // A plist with no Disabled key is enabled by default
        // An empty <dict/> is also effectively enabled
        const enabled = content.includes('<dict/>') ||
                        !content.includes('<key>Disabled</key>') ||
                        content.includes('<key>Disabled</key>\n\t<false/>')

        // Only show a toggle button if the file passes validation
        const editable = isPlistEditable(fullPath)

        items.push({
          name,
          path:        fullPath,
          type,
          enabled,
          editable,
          description: getItemDescription(name),
        })
      } catch {
        // Skip files we can't read (permission denied, binary format, etc.)
      }
    }
  } catch {
    // Directory not accessible
  }

  return items
}

function getLoginItems(): StartupItem[] {
  try {
    const output = execSync(
      `osascript -e 'tell application "System Events" to get the name of every login item'`,
      { timeout: 3000, encoding: 'utf8' }
    ).trim()

    if (!output) return []

    return output.split(', ').map(name => ({
      name:        name.trim(),
      path:        '',
      type:        'LoginItem' as const,
      enabled:     true,
      editable:    false,
      description: 'Login item',
    }))
  } catch {
    return []
  }
}

function getItemDescription(name: string): string {
  const known: Record<string, string> = {
    'com.apple.AirPlayXPCHelper':   'AirPlay streaming service',
    'com.apple.AddressBook.abd':    'Contacts background sync',
    'com.docker.helper':            'Docker Desktop helper',
    'com.google.keystone.agent':    'Google software updater',
    'com.google.keystone.xpcservice': 'Google updater service',
    'com.google.GoogleUpdater':     'Google software updater',
    'com.adobe.AdobeCreativeCloud': 'Adobe Creative Cloud',
    'com.spotify.webhelper':        'Spotify web helper',
    'com.microsoft.autoupdate.fba': 'Microsoft AutoUpdate',
    'homebrew.mxcl':                'Homebrew service',
    'com.epicgames.launcher':       'Epic Games Launcher',
    'com.valvesoftware.steamclean': 'Steam cleanup service',
    'com.DigiDNA.iMazing':          'iMazing helper',
  }

  for (const [key, desc] of Object.entries(known)) {
    if (name.toLowerCase().includes(key.toLowerCase())) return desc
  }

  return 'Background service'
}