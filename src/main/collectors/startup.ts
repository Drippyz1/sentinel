import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

export interface StartupItem {
  name:        string
  path:        string
  type:        'LaunchAgent' | 'LaunchDaemon' | 'LoginItem'
  enabled:     boolean
  description: string
}

export interface StartupMetrics {
  items:        StartupItem[]
  totalCount:   number
  enabledCount: number
}

export async function getStartupMetrics(): Promise<StartupMetrics> {
  const items: StartupItem[] = []

  // Check user LaunchAgents — apps that start on login for this user
  const userAgentsPath = path.join(os.homedir(), 'Library', 'LaunchAgents')
  items.push(...readPlistDirectory(userAgentsPath, 'LaunchAgent'))

  // Check system LaunchAgents
  const systemAgentsPath = '/Library/LaunchAgents'
  items.push(...readPlistDirectory(systemAgentsPath, 'LaunchAgent'))

  // Check system LaunchDaemons — background system services
  const daemonsPath = '/Library/LaunchDaemons'
  items.push(...readPlistDirectory(daemonsPath, 'LaunchDaemon'))

  // Get login items via osascript (the GUI login items in System Settings)
  const loginItems = getLoginItems()
  items.push(...loginItems)

  // Sort by name
  items.sort((a, b) => a.name.localeCompare(b.name))

  return {
    items,
    totalCount:   items.length,
    enabledCount: items.filter(i => i.enabled).length,
  }
}

function readPlistDirectory(
  dirPath: string,
  type: 'LaunchAgent' | 'LaunchDaemon'
): StartupItem[] {
  const items: StartupItem[] = []

  try {
    if (!fs.existsSync(dirPath)) return items

    const files = fs.readdirSync(dirPath)
      .filter(f => f.endsWith('.plist'))

    for (const file of files) {
      try {
        const fullPath = path.join(dirPath, file)
        const name     = file.replace('.plist', '')

        // Read the plist to check if it's disabled
        // Disabled items have a key "Disabled" set to true
        const content = fs.readFileSync(fullPath, 'utf8')
        const enabled = !content.includes('<key>Disabled</key>') ||
                        content.includes('<key>Disabled</key>\n\t<false/>')

        items.push({
          name,
          path:    fullPath,
          type,
          enabled,
          description: getItemDescription(name),
        })
      } catch {
        // Skip files we can't read (permission denied etc.)
      }
    }
  } catch {
    // Directory not accessible
  }

  return items
}

function getLoginItems(): StartupItem[] {
  try {
    // Use osascript to list login items
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
      description: 'Login item',
    }))
  } catch {
    return []
  }
}

// Recognize common items and give friendly descriptions
function getItemDescription(name: string): string {
  const known: Record<string, string> = {
    'com.apple.AirPlayXPCHelper':    'AirPlay streaming service',
    'com.apple.AddressBook.abd':     'Contacts background sync',
    'com.docker.helper':             'Docker Desktop helper',
    'com.google.keystone.agent':     'Google software updater',
    'com.adobe.AdobeCreativeCloud':  'Adobe Creative Cloud',
    'com.spotify.webhelper':         'Spotify web helper',
    'com.microsoft.autoupdate.fba':  'Microsoft AutoUpdate',
    'homebrew.mxcl':                 'Homebrew service',
  }

  for (const [key, desc] of Object.entries(known)) {
    if (name.toLowerCase().includes(key.toLowerCase())) return desc
  }

  return 'Background service'
}