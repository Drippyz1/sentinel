import si from 'systeminformation'
import type { CpuMetrics } from '../../shared/contracts'

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
