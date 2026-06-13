import { execFile } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import type { StartupItem, StartupMetrics } from '../../shared/contracts'

const execFileAsync = promisify(execFile)
const COMMAND_OPTIONS = { timeout: 3000, encoding: 'utf8' as const, maxBuffer: 1024 * 1024 }

export function isValidStartupPathInput(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 4096 &&
    path.isAbsolute(value) &&
    path.extname(value).toLowerCase() === '.plist'
  )
}

export async function getStartupMetrics(): Promise<StartupMetrics> {
  const userAgentsPath = path.join(os.homedir(), 'Library', 'LaunchAgents')
  const [userAgents, systemAgents, daemons, loginItems] = await Promise.all([
    readPlistDirectory(userAgentsPath, 'LaunchAgent'),
    readPlistDirectory('/Library/LaunchAgents', 'LaunchAgent'),
    readPlistDirectory('/Library/LaunchDaemons', 'LaunchDaemon'),
    getLoginItems()
  ])
  const items = [...userAgents, ...systemAgents, ...daemons, ...loginItems]

  items.sort((a, b) => a.name.localeCompare(b.name))

  return {
    items,
    totalCount: items.length,
    enabledCount: items.filter((item) => item.enabled).length
  }
}

export async function disableStartupItem(itemPath: string): Promise<boolean> {
  const canonicalPath = await resolveEditableStartupItemPath(itemPath)
  if (!canonicalPath) return false

  try {
    try {
      await runCommand('launchctl', ['unload', canonicalPath])
    } catch {
      // Fine if the item was not loaded.
    }

    try {
      await runCommand('plutil', ['-convert', 'xml1', canonicalPath])
    } catch {
      console.warn('Could not convert plist to XML:', canonicalPath)
      return false
    }

    try {
      await fs.chmod(canonicalPath, 0o644)
    } catch {
      // The write below will safely report a permissions failure.
    }

    let content = await fs.readFile(canonicalPath, 'utf8')

    if (content.includes('<dict/>')) {
      content = content.replace('<dict/>', '<dict>\n\t<key>Disabled</key>\n\t<true/>\n</dict>')
    } else if (content.includes('<key>Disabled</key>')) {
      content = content.replace(
        /<key>Disabled<\/key>\s*<(true|false)\/>/,
        '<key>Disabled</key>\n\t<true/>'
      )
    } else {
      content = content.replace(
        /<\/dict>\s*<\/plist>/,
        '\t<key>Disabled</key>\n\t<true/>\n</dict>\n</plist>'
      )
    }

    await fs.writeFile(canonicalPath, content, 'utf8')
    return true
  } catch (error) {
    console.error('Failed to disable startup item:', error)
    return false
  }
}

export async function enableStartupItem(itemPath: string): Promise<boolean> {
  const canonicalPath = await resolveEditableStartupItemPath(itemPath)
  if (!canonicalPath) return false

  try {
    try {
      await runCommand('plutil', ['-convert', 'xml1', canonicalPath])
    } catch {
      console.warn('Could not convert plist to XML:', canonicalPath)
      return false
    }

    try {
      await fs.chmod(canonicalPath, 0o644)
    } catch {
      // The write below will safely report a permissions failure.
    }

    let content = await fs.readFile(canonicalPath, 'utf8')

    if (content.includes('<key>Disabled</key>')) {
      content = content.replace(
        /<key>Disabled<\/key>\s*<(true|false)\/>/,
        '<key>Disabled</key>\n\t<false/>'
      )
      await fs.writeFile(canonicalPath, content, 'utf8')
    }

    try {
      await runCommand('launchctl', ['load', canonicalPath])
    } catch {
      // Fine if the item is already loaded.
    }

    return true
  } catch (error) {
    console.error('Failed to enable startup item:', error)
    return false
  }
}

async function resolveEditableStartupItemPath(itemPath: string): Promise<string | null> {
  if (!isValidStartupPathInput(itemPath)) return null

  try {
    const allowedDirectory = await fs.realpath(path.join(os.homedir(), 'Library', 'LaunchAgents'))
    const canonicalPath = await fs.realpath(itemPath)
    const relativePath = path.relative(allowedDirectory, canonicalPath)
    const stats = await fs.stat(canonicalPath)

    if (
      !stats.isFile() ||
      relativePath === '' ||
      relativePath.startsWith(`..${path.sep}`) ||
      relativePath === '..' ||
      path.isAbsolute(relativePath)
    ) {
      console.warn('Cannot edit startup item outside the user LaunchAgents directory:', itemPath)
      return null
    }

    return canonicalPath
  } catch {
    return null
  }
}

async function runCommand(command: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(command, args, COMMAND_OPTIONS)
  return stdout
}

async function isPlistEditable(itemPath: string): Promise<boolean> {
  try {
    await runCommand('plutil', ['-lint', itemPath])
    return true
  } catch {
    return false
  }
}

async function readPlistDirectory(
  dirPath: string,
  type: 'LaunchAgent' | 'LaunchDaemon'
): Promise<StartupItem[]> {
  try {
    const files = (await fs.readdir(dirPath)).filter((file) => file.endsWith('.plist'))
    const items: StartupItem[] = []

    for (const file of files) {
      try {
        const fullPath = path.join(dirPath, file)
        const name = file.replace('.plist', '')
        const content = await fs.readFile(fullPath, 'utf8')
        const enabled =
          content.includes('<dict/>') ||
          !content.includes('<key>Disabled</key>') ||
          content.includes('<key>Disabled</key>\n\t<false/>')

        items.push({
          name,
          path: fullPath,
          type,
          enabled,
          editable: await isPlistEditable(fullPath),
          description: getItemDescription(name)
        })
      } catch {
        // Skip files that cannot be read or validated.
      }
    }

    return items
  } catch {
    return []
  }
}

async function getLoginItems(): Promise<StartupItem[]> {
  try {
    const output = (
      await runCommand('osascript', [
        '-e',
        'tell application "System Events" to get the name of every login item'
      ])
    ).trim()

    if (!output) return []

    return output.split(', ').map((name) => ({
      name: name.trim(),
      path: '',
      type: 'LoginItem' as const,
      enabled: true,
      editable: false,
      description: 'Login item'
    }))
  } catch {
    return []
  }
}

function getItemDescription(name: string): string {
  const known: Record<string, string> = {
    'com.apple.AirPlayXPCHelper': 'AirPlay streaming service',
    'com.apple.AddressBook.abd': 'Contacts background sync',
    'com.docker.helper': 'Docker Desktop helper',
    'com.google.keystone.agent': 'Google software updater',
    'com.google.keystone.xpcservice': 'Google updater service',
    'com.google.GoogleUpdater': 'Google software updater',
    'com.adobe.AdobeCreativeCloud': 'Adobe Creative Cloud',
    'com.spotify.webhelper': 'Spotify web helper',
    'com.microsoft.autoupdate.fba': 'Microsoft AutoUpdate',
    'homebrew.mxcl': 'Homebrew service',
    'com.epicgames.launcher': 'Epic Games Launcher',
    'com.valvesoftware.steamclean': 'Steam cleanup service',
    'com.DigiDNA.iMazing': 'iMazing helper'
  }

  for (const [key, description] of Object.entries(known)) {
    if (name.toLowerCase().includes(key.toLowerCase())) return description
  }

  return 'Background service'
}
