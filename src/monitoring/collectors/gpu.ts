import si from 'systeminformation'
import type { GpuController, GpuMetrics, MetricCollectionResult } from '../../shared/contracts'
import { normalizeTemperature } from '../../shared/utils/temperature'
import { nonNegative, observed, percent, unavailable } from '../probe'

function toBytes(mib: number | null): number | null {
  return mib === null ? null : mib * 1024 * 1024
}

export async function getGpuMetrics(): Promise<MetricCollectionResult<GpuMetrics>> {
  const data = await si.graphics()
  const controllers: GpuController[] = data.controllers
    .filter((controller) => controller.model || controller.vendor)
    .map((controller) => {
      const unified =
        Boolean(controller.vramDynamic) ||
        (process.platform === 'darwin' &&
          process.arch === 'arm64' &&
          /^(apple|m[1-9])/i.test(controller.vendor || controller.model))
      const vram = unified ? null : nonNegative(controller.vram)
      const used = nonNegative(controller.memoryUsed)
      const free = nonNegative(controller.memoryFree)
      const validUsed = vram && used !== null && used <= vram ? used : null
      const validFree = vram && free !== null && free <= vram ? free : null
      return {
        name: controller.model || controller.vendor,
        vendor: controller.vendor || '',
        vramBytes: vram ? toBytes(vram) : null,
        vramUsedBytes: toBytes(validUsed),
        vramFreeBytes: toBytes(validFree),
        vramUsagePercent:
          vram && validUsed !== null ? percent(Math.round((validUsed / vram) * 100)) : null,
        utilizationPercent: percent(controller.utilizationGpu),
        temperatureCelsius: normalizeTemperature(controller.temperatureGpu),
        powerDrawWatts: nonNegative(controller.powerDraw),
        powerLimitWatts: nonNegative(controller.powerLimit)
      }
    })

  return controllers.length ? observed({ controllers, hasGpu: true }) : unavailable('not-detected')
}
