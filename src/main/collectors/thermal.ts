import { execFile } from 'child_process'
import { promisify } from 'util'
import type { ThermalLevel, ThermalMetrics } from '../../shared/contracts'
import { cachedProbe } from '../../monitoring/probe'

const execFileAsync = promisify(execFile)

const DESCRIPTIONS: Record<ThermalLevel, string> = {
  nominal: 'System is running normally',
  moderate: 'System is warm — minor throttling may occur',
  heavy: 'System is hot — performance is being reduced',
  trapping: 'System is critically hot — significant throttling active',
  unknown: 'Thermal data requires elevated permissions on this Mac'
}

export const getThermalMetrics = cachedProbe(async (): Promise<ThermalMetrics> => {
  if (process.platform !== 'darwin') {
    return {
      level: 'unknown',
      isThrottling: false,
      cpuSpeedLimit: null,
      schedulerLimit: null,
      diskSpeedLimit: null,
      description: 'Thermal pressure is not supported on this platform.',
      source: 'none',
      requiresSudo: false
    }
  }
  const method1 = await tryPowermetricsSafe()
  if (method1) return method1

  const method2 = await tryIOKit()
  if (method2) return method2

  return {
    level: 'unknown',
    isThrottling: false,
    cpuSpeedLimit: null,
    schedulerLimit: null,
    diskSpeedLimit: null,
    description: DESCRIPTIONS['unknown'],
    source: 'none',
    requiresSudo: true
  }
}, 3000)

async function runCommand(command: string, args: string[], timeout: number): Promise<string> {
  const { stdout } = await execFileAsync(command, args, {
    timeout,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024
  })
  return stdout
}

async function tryPowermetricsSafe(): Promise<ThermalMetrics | null> {
  try {
    const output = await runCommand(
      '/usr/bin/powermetrics',
      ['-n', '1', '-i', '50', '--samplers', 'smc'],
      2000
    )
    if (!output.trim()) return null

    const match = output.match(/thermal pressure[:\s]+(\w+)/i)
    if (!match) return null

    const raw = match[1].toLowerCase()
    const level =
      raw === 'nominal'
        ? 'nominal'
        : raw === 'moderate'
          ? 'moderate'
          : raw === 'heavy'
            ? 'heavy'
            : raw === 'trapping'
              ? 'trapping'
              : null
    if (!level) return null

    return {
      level,
      isThrottling: level !== 'nominal',
      cpuSpeedLimit: null,
      schedulerLimit: null,
      diskSpeedLimit: null,
      description: DESCRIPTIONS[level],
      source: 'powermetrics',
      requiresSudo: false
    }
  } catch {
    return null
  }
}

async function tryIOKit(): Promise<ThermalMetrics | null> {
  try {
    const output = await runCommand(
      '/usr/sbin/ioreg',
      ['-r', '-c', 'IOPlatformExpertDevice', '-d', '3'],
      2000
    )
    if (!output) return null

    const match = output.match(/"thermal-state"\s*=\s*(\d+)/)
    if (!match) return null

    const state = parseInt(match[1])
    const level: ThermalLevel =
      state === 0
        ? 'nominal'
        : state === 1
          ? 'moderate'
          : state === 2
            ? 'heavy'
            : state === 3
              ? 'trapping'
              : 'unknown'

    return {
      level,
      isThrottling: level !== 'nominal' && level !== 'unknown',
      cpuSpeedLimit: null,
      schedulerLimit: null,
      diskSpeedLimit: null,
      description: DESCRIPTIONS[level],
      source: 'ioreg',
      requiresSudo: false
    }
  } catch {
    return null
  }
}
