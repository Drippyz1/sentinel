import si from 'systeminformation'

export interface GpuController {
  name:            string
  vendor:          string
  vramBytes:       number        // total VRAM
  vramUsedBytes:   number        // VRAM in use
  vramFreeBytes:   number        // VRAM available
  vramUsagePercent: number
  utilizationPercent: number     // GPU core usage 0-100
  temperatureCelsius: number | null
  powerDrawWatts:  number | null  // current power draw
  powerLimitWatts: number | null  // max power limit
}

export interface GpuMetrics {
  controllers: GpuController[]
  hasGpu:      boolean
}

export async function getGpuMetrics(): Promise<GpuMetrics> {
  try {
    const data = await si.graphics()

    if (!data || !data.controllers || data.controllers.length === 0) {
      return { controllers: [], hasGpu: false }
    }

    const controllers: GpuController[] = data.controllers
      .filter(c => c.model || c.vendor)
      .map(c => {
        const vramBytes     = (c.vram ?? 0) * 1024 * 1024   // MB → bytes
        const vramUsedBytes = (c.memoryUsed ?? 0) * 1024 * 1024
        const vramFreeBytes = (c.memoryFree ?? 0) * 1024 * 1024

        const vramUsagePercent = vramBytes > 0
          ? Math.round((vramUsedBytes / vramBytes) * 100)
          : 0

        return {
          name:               c.model ?? c.vendor ?? 'Unknown GPU',
          vendor:             c.vendor ?? '',
          vramBytes,
          vramUsedBytes,
          vramFreeBytes,
          vramUsagePercent,
          utilizationPercent: c.utilizationGpu   ?? 0,
          temperatureCelsius: c.temperatureGpu   ?? null,
          powerDrawWatts:     c.powerDraw        ?? null,
          powerLimitWatts:    c.powerLimit       ?? null,
        }
      })

    return { controllers, hasGpu: controllers.length > 0 }

  } catch (err) {
    console.error('getGpuMetrics error:', err)
    return { controllers: [], hasGpu: false }
  }
}