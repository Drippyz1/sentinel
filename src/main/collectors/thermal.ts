import { execFile } from 'child_process'
import { promisify } from 'util'
import type { ThermalLevel, ThermalMetrics } from '../../shared/contracts'

const execFileAsync = promisify(execFile)

const DESCRIPTIONS: Record<ThermalLevel, string> = {
  nominal: 'System is running normally',
  moderate: 'System is warm — minor throttling may occur',
  heavy: 'System is hot — performance is being reduced',
  trapping: 'System is critically hot — significant throttling active',
  unknown: 'Thermal data requires elevated permissions on this Mac'
}

export async function getThermalMetrics(): Promise<ThermalMetrics> {
  const method1 = await tryPowermetricsSafe()
  if (method1) return method1

  const method2 = await tryIOKit()
  if (method2) return method2

  const method3 = await tryCpuFrequencyProxy()
  if (method3) return method3

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
}

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
      'powermetrics',
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
      'ioreg',
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

async function tryCpuFrequencyProxy(): Promise<ThermalMetrics | null> {
  try {
    const output = (
      await runCommand('sysctl', ['-n', 'hw.cpufrequency', 'hw.cpufrequency_max'], 1000)
    ).trim()
    const lines = output.split('\n').map((line) => parseInt(line.trim()))
    if (lines.length < 2 || isNaN(lines[0]) || isNaN(lines[1])) return null

    const ratio = lines[0] / lines[1]
    const level: ThermalLevel =
      ratio >= 0.95 ? 'nominal' : ratio >= 0.75 ? 'moderate' : ratio >= 0.5 ? 'heavy' : 'trapping'

    return {
      level,
      isThrottling: level !== 'nominal',
      cpuSpeedLimit: Math.round(ratio * 100),
      schedulerLimit: null,
      diskSpeedLimit: null,
      description: DESCRIPTIONS[level],
      source: 'cpu-frequency',
      requiresSudo: false
    }
  } catch {
    return null
  }
}
