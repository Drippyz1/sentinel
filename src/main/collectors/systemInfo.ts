import si from 'systeminformation'
import type { SystemInfo } from '../../shared/contracts'

// Cache the result — this data never changes during a session
let cachedInfo: SystemInfo | null = null

export async function getSystemInfo(): Promise<SystemInfo> {
  if (cachedInfo) return cachedInfo

  const [osInfo, cpu, mem, system] = await Promise.all([
    si.osInfo(),
    si.cpu(),
    si.mem(),
    si.system()
  ])

  cachedInfo = {
    platform: osInfo.platform,
    distro: osInfo.distro,
    release: osInfo.release,
    arch: osInfo.arch,
    hostname: osInfo.hostname,

    cpuBrand: cpu.brand,
    cpuCores: cpu.physicalCores,
    cpuThreads: cpu.cores,
    cpuBaseSpeed: cpu.speed,

    totalMemory: mem.total,

    model: system.model,
    manufacturer: system.manufacturer,
    // Redact middle of serial for privacy when sharing screenshots
    serial: redactSerial(system.serial ?? ''),

    uptimeSeconds: Math.floor(process.uptime())
  }

  return cachedInfo
}

// Invalidate cache so uptime refreshes periodically
export function invalidateSystemInfoCache() {
  cachedInfo = null
}

function redactSerial(serial: string): string {
  if (serial.length < 6) return serial
  const keep = 3
  return serial.slice(0, keep) + '•••••' + serial.slice(-keep)
}
