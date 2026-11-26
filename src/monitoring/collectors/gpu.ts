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
      const vram = controller.vramDynamic ? null : nonNegative(controller.vram)
      const used = nonNegative(controller.memoryUsed)
      return {
        name: controller.model || controller.vendor,
        vendor: controller.vendor || '',
        vramBytes: vram ? toBytes(vram) : null,
        vramUsedBytes: toBytes(used),
        vramFreeBytes: toBytes(nonNegative(controller.memoryFree)),
        vramUsagePercent: vram && used !== null ? percent(Math.round((used / vram) * 100)) : null,
        utilizationPercent: percent(controller.utilizationGpu),
        temperatureCelsius: normalizeTemperature(controller.temperatureGpu),
        powerDrawWatts: nonNegative(controller.powerDraw),
        powerLimitWatts: nonNegative(controller.powerLimit)
      }
    })

  return controllers.length ? observed({ controllers, hasGpu: true }) : unavailable('not-detected')
}
