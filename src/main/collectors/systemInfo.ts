import si from 'systeminformation'
import { totalmem, uptime } from 'node:os'
import type { SystemInfo } from '../../shared/contracts'
import { getCpuInventory } from '../../monitoring/collectors/cpu'
import { cachedProbe } from '../../monitoring/probe'

const getInventory = cachedProbe(async () => {
  const [osInfo, cpu, system] = await Promise.all([si.osInfo(), getCpuInventory(), si.system()])

  return {
    platform: osInfo.platform,
    distro: osInfo.distro,
    release: osInfo.release,
    arch: osInfo.arch,
    hostname: osInfo.hostname,

    cpuBrand: cpu.brand,
    cpuCores: cpu.physicalCores,
    cpuThreads: cpu.cores,
    cpuBaseSpeed: cpu.speed,

    model: system.model,
    manufacturer: system.manufacturer,
    // Redact middle of serial for privacy when sharing screenshots
    serial: redactSerial(system.serial ?? '')
  }
})

export async function getSystemInfo(): Promise<SystemInfo> {
  return { ...(await getInventory()), totalMemory: totalmem(), uptimeSeconds: Math.floor(uptime()) }
}

function redactSerial(serial: string): string {
  if (serial.length < 6) return serial
  const keep = 3
  return serial.slice(0, keep) + '•••••' + serial.slice(-keep)
}
