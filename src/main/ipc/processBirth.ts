import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { promisify } from 'node:util'

const run = promisify(execFile)

export function linuxStartTicks(stat: string): string | null {
  const end = stat.lastIndexOf(')')
  const start =
    end >= 0
      ? stat
          .slice(end + 1)
          .trim()
          .split(/\s+/)[19]
      : undefined
  return start && /^\d+$/.test(start) ? start : null
}

export async function processBirth(pid: number): Promise<string | null> {
  if (!Number.isInteger(pid) || pid <= 1 || pid > 2_147_483_647) return null
  if (process.platform === 'darwin') {
    const { stdout } = await run('/bin/ps', ['-p', String(pid), '-o', 'lstart=', '-o', 'comm='], {
      env: { LC_ALL: 'C' },
      timeout: 1000,
      maxBuffer: 16 * 1024
    }).catch(() => ({ stdout: '' }))
    return stdout.trim() || null
  }
  if (process.platform === 'linux') {
    const stat = await readFile(`/proc/${pid}/stat`, 'utf8').catch(() => '')
    return linuxStartTicks(stat)
  }
  return null
}
