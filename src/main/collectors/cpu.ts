import si from 'systeminformation'

// This describes the shape of data we'll return
// TypeScript uses these "interfaces" to know what fields an object has
export interface CpuMetrics {
  manufacturer: string // e.g. "Apple"
  brand: string // e.g. "Apple M3 Pro"
  speedGHz: number // current speed in GHz
  cores: number // total number of cores
  usagePercent: number // overall CPU usage 0-100
  perCoreUsage: number[] // usage for each individual core
  temperature: number | null // celsius, null if unavailable
}

// This is the function we'll call whenever we want fresh CPU data
export async function getCpuMetrics(): Promise<CpuMetrics> {
  // Ask systeminformation for several things at once
  // "await" means: wait for this to finish before moving on
  const [staticInfo, currentLoad, temp] = await Promise.all([
    si.cpu(), // manufacturer, brand, speed, core count
    si.currentLoad(), // real-time usage percentages
    si.cpuTemperature() // temperature sensors
  ])

  return {
    manufacturer: staticInfo.manufacturer,
    brand: staticInfo.brand,
    speedGHz: staticInfo.speed,
    cores: staticInfo.cores,
    usagePercent: Math.round(currentLoad.currentLoad),
    perCoreUsage: currentLoad.cpus.map((core) => Math.round(core.load)),
    temperature: temp.main ?? null
  }
}
