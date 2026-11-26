import { execFile } from 'node:child_process'
import { readFile, readdir, readlink } from 'node:fs/promises'
import { promisify } from 'node:util'
import type { ByteCounters } from '../counterRates'
import { nonNegative } from '../probe'

const run = promisify(execFile)

export function parseDarwinDiskCounters(output: string): ByteCounters[] {
  const counters: ByteCounters[] = []
  let id: string | undefined
  for (const line of output.split('\n')) {
    if (line.includes('+-o ')) id = line.match(/\bid (0x[\da-f]+)/i)?.[1]
    if (!id || !line.includes('"Statistics" =')) continue
    const read = line.match(/"Bytes \(Read\)"\s*=\s*(\d+)/)?.[1]
    const write = line.match(/"Bytes \(Write\)"\s*=\s*(\d+)/)?.[1]
    if (read !== undefined || write !== undefined) {
      counters.push({ id, read: nonNegative(Number(read)), write: nonNegative(Number(write)) })
    }
  }
  return counters
}

export function parseLinuxDiskCounters(
  output: string,
  devices: Map<string, string>
): ByteCounters[] {
  return output.split('\n').flatMap((line) => {
    const fields = line.trim().split(/\s+/)
    const id = devices.get(fields[2])
    if (!id) return []
    // Linux diskstats uses invariant 512-byte sectors, not the drive's logical sector size.
    return [
      {
        id: `${fields[0]}:${fields[1]}:${id}`,
        read: nonNegative(Number(fields[5]) * 512),
        write: nonNegative(Number(fields[9]) * 512)
      }
    ]
  })
}

export async function readDiskCounters(platform: 'darwin' | 'linux'): Promise<ByteCounters[]> {
  if (platform === 'darwin') {
    const { stdout } = await run(
      '/usr/sbin/ioreg',
      ['-r', '-c', 'IOBlockStorageDriver', '-k', 'Statistics', '-w', '0', '-d', '1'],
      { timeout: 2000, maxBuffer: 4 * 1024 * 1024 }
    )
    return parseDarwinDiskCounters(stdout)
  }
  const [devices, stats] = await Promise.all([
    readdir('/sys/block'),
    readFile('/proc/diskstats', 'utf8')
  ])
  const ids = await Promise.all(
    devices.map(async (name) => {
      const target = await readlink(`/sys/block/${name}`).catch(() => '')
      return [name, target] as const
    })
  )
  // Count backing disks once, not their partitions, loop devices or stacked mapper devices.
  return parseLinuxDiskCounters(
    stats,
    new Map(ids.filter(([, target]) => target && !target.includes('/virtual/block/')))
  )
}
