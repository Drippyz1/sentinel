import { execSync } from 'child_process'

export type ThermalLevel = 'nominal' | 'moderate' | 'heavy' | 'trapping' | 'unknown'

export interface ThermalMetrics {
  level: ThermalLevel
  isThrottling: boolean
  cpuSpeedLimit: number | null
  schedulerLimit: number | null
  diskSpeedLimit: number | null
  description: string
  source: string
  requiresSudo: boolean // true if we couldn't get data due to permissions
}

const DESCRIPTIONS: Record<ThermalLevel, string> = {
  nominal: 'System is running normally',
  moderate: 'System is warm — minor throttling may occur',
  heavy: 'System is hot — performance is being reduced',
  trapping: 'System is critically hot — significant throttling active',
  unknown: 'Thermal data requires elevated permissions on this Mac'
}

export async function getThermalMetrics(): Promise<ThermalMetrics> {
  const method1 = tryPowermetricsSafe()
  if (method1) return method1

  const method2 = tryIOKit()
  if (method2) return method2

  const method3 = tryCpuFrequencyProxy()
  if (method3) return method3

  // Nothing worked — be honest about why
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

function tryPowermetricsSafe(): ThermalMetrics | null {
  try {
    const output = execSync('powermetrics -n 1 -i 50 --samplers smc 2>/dev/null', {
      timeout: 2000,
      encoding: 'utf8'
    })
    if (!output || output.trim().length === 0) return null

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

function tryIOKit(): ThermalMetrics | null {
  try {
    const output = execSync('ioreg -r -c IOPlatformExpertDevice -d 3 2>/dev/null', {
      timeout: 2000,
      encoding: 'utf8'
    })
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

function tryCpuFrequencyProxy(): ThermalMetrics | null {
  try {
    const output = execSync('sysctl -n hw.cpufrequency hw.cpufrequency_max 2>/dev/null', {
      timeout: 1000,
      encoding: 'utf8'
    }).trim()

    const lines = output.split('\n').map((l) => parseInt(l.trim()))
    if (lines.length < 2 || isNaN(lines[0]) || isNaN(lines[1])) return null

    const current = lines[0]
    const max = lines[1]
    const ratio = current / max

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
