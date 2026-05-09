import { execSync } from 'child_process'

// Thermal pressure levels Apple uses internally
export type ThermalLevel = 'nominal' | 'moderate' | 'heavy' | 'trapping' | 'unknown'

export interface ThermalMetrics {
  level:           ThermalLevel
  isThrottling:    boolean     // true if anything above nominal
  cpuSpeedLimit:   number | null  // % of max speed allowed (100 = not limited)
  schedulerLimit:  number | null  // % of scheduler time available
  diskSpeedLimit:  number | null
  description:     string      // human readable explanation
}

// Maps Apple's thermal pressure values to our levels
const LEVEL_MAP: Record<string, ThermalLevel> = {
  'Nominal':  'nominal',
  'Moderate': 'moderate',
  'Heavy':    'heavy',
  'Trapping': 'trapping',
}

const DESCRIPTIONS: Record<ThermalLevel, string> = {
  nominal:  'System is running normally',
  moderate: 'System is warm — minor throttling may occur',
  heavy:    'System is hot — performance is being reduced',
  trapping: 'System is critically hot — significant throttling active',
  unknown:  'Thermal status unavailable',
}

export async function getThermalMetrics(): Promise<ThermalMetrics> {
  try {
    // powermetrics is a macOS-only tool that exposes thermal data
    // We run it once with a very short sample time to get a snapshot
    // -n 1 = one sample, -i 100 = 100ms interval, --samplers = only thermal data
    const output = execSync(
      'sudo powermetrics -n 1 -i 100 --samplers thermal 2>/dev/null',
      { timeout: 3000, encoding: 'utf8' }
    )

    return parsePowermetricsOutput(output)

  } catch {
    // powermetrics requires sudo — fall back to a simpler method
    return getThermalFallback()
  }
}

function parsePowermetricsOutput(output: string): ThermalMetrics {
  // Extract thermal pressure level
  const levelMatch = output.match(/thermal pressure:\s*(\w+)/i)
  const rawLevel   = levelMatch?.[1] ?? 'unknown'
  const level      = LEVEL_MAP[rawLevel] ?? 'unknown'

  // Extract CPU speed limit if present
  const cpuLimitMatch  = output.match(/CPU Speed Limit:\s*(\d+)/i)
  const cpuSpeedLimit  = cpuLimitMatch ? parseInt(cpuLimitMatch[1]) : null

  // Extract scheduler limit if present
  const schedMatch     = output.match(/Scheduler Limit:\s*(\d+)/i)
  const schedulerLimit = schedMatch ? parseInt(schedMatch[1]) : null

  const diskMatch      = output.match(/Disk Speed Limit:\s*(\d+)/i)
  const diskSpeedLimit = diskMatch ? parseInt(diskMatch[1]) : null

  return {
    level,
    isThrottling:  level !== 'nominal' && level !== 'unknown',
    cpuSpeedLimit,
    schedulerLimit,
    diskSpeedLimit,
    description:   DESCRIPTIONS[level],
  }
}

// Fallback when powermetrics isn't available
// Uses sysctl to get basic thermal info
function getThermalFallback(): ThermalMetrics {
  try {
    const output = execSync(
      'sysctl -n machdep.xcpm.cpu_thermal_level 2>/dev/null',
      { timeout: 1000, encoding: 'utf8' }
    ).trim()

    const level = parseInt(output)
    const thermalLevel: ThermalLevel =
      level === 0 ? 'nominal' :
      level <= 3  ? 'moderate' :
      level <= 6  ? 'heavy' : 'trapping'

    return {
      level:           thermalLevel,
      isThrottling:    thermalLevel !== 'nominal',
      cpuSpeedLimit:   null,
      schedulerLimit:  null,
      diskSpeedLimit:  null,
      description:     DESCRIPTIONS[thermalLevel],
    }
  } catch {
    return {
      level:           'unknown',
      isThrottling:    false,
      cpuSpeedLimit:   null,
      schedulerLimit:  null,
      diskSpeedLimit:  null,
      description:     DESCRIPTIONS['unknown'],
    }
  }
}