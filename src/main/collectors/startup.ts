import { execFile } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { StartupItem, StartupMetrics } from '../../shared/contracts'
import { cachedProbe } from '../../monitoring/probe'

const run = promisify(execFile)

export const getStartupMetrics = cachedProbe(async (): Promise<StartupMetrics> => {
  if (process.platform !== 'darwin') {
    return { items: [], limitation: 'Startup inventory is only available on macOS.' }
  }
  const groups = await Promise.all([
    readPlistDirectory(join(homedir(), 'Library', 'LaunchAgents'), 'LaunchAgent'),
    readPlistDirectory('/Library/LaunchAgents', 'LaunchAgent'),
    readPlistDirectory('/Library/LaunchDaemons', 'LaunchDaemon')
  ])
  return {
    items: groups.flat().sort((a, b) => a.name.localeCompare(b.name)),
    limitation:
      'Read-only LaunchAgent and LaunchDaemon inventory. Plist settings do not indicate launchd overrides or running state. Other macOS login items are not listed.'
  }
}, 0)

async function readPlistDirectory(dir: string, type: StartupItem['type']): Promise<StartupItem[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  const items: StartupItem[] = []
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.plist')) continue
    let configuration: StartupItem['configuration'] = 'unknown'
    try {
      const { stdout } = await run(
        '/usr/bin/plutil',
        ['-convert', 'json', '-o', '-', '--', join(dir, entry.name)],
        {
          timeout: 3000,
          maxBuffer: 1024 * 1024
        }
      )
      const plist: unknown = JSON.parse(stdout)
      if (plist && typeof plist === 'object' && !Array.isArray(plist)) {
        const disabled = (plist as Record<string, unknown>).Disabled
        if (disabled === true) configuration = 'disabled'
        else if (disabled === false || disabled === undefined) configuration = 'not-disabled'
      }
    } catch {
      // Keep unreadable or unconvertible entries visible without inferring their configuration.
    }
    items.push({ name: entry.name.slice(0, -6), type, configuration })
  }
  return items
}
