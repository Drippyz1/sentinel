import si from 'systeminformation'
import type { BatteryMetrics } from '../../shared/contracts'

export async function getBatteryMetrics(): Promise<BatteryMetrics> {
  try {
    const data = await si.battery()

    if (!data || !data.hasBattery) {
      return {
        hasBattery: false,
        chargePercent: 0,
        isCharging: false,
        isPluggedIn: false,
        timeRemainingMins: null,
        voltage: null,
        capacityWh: null,
        designCapacityWh: null,
        healthPercent: null,
        cycleCount: null,
        manufacturer: null,
        model: null
      }
    }

    const capacityWh = data.maxCapacity ? data.maxCapacity / 1000 : null
    // Fix: correct property name is designedCapacity, not designCapacity
    const designCapacity = data.designedCapacity ? data.designedCapacity / 1000 : null
    const healthPercent =
      capacityWh && designCapacity && designCapacity > 0
        ? Math.round((capacityWh / designCapacity) * 100)
        : null

    const timeRemainingMins =
      data.timeRemaining && data.timeRemaining > 0 ? data.timeRemaining : null

    return {
      hasBattery: true,
      chargePercent: Math.round(data.percent ?? 0),
      isCharging: data.isCharging ?? false,
      isPluggedIn: data.acConnected ?? false,
      timeRemainingMins,
      voltage: data.voltage ?? null,
      capacityWh,
      designCapacityWh: designCapacity,
      healthPercent,
      cycleCount: data.cycleCount ?? null,
      manufacturer: data.manufacturer ?? null,
      model: data.model ?? null
    }
  } catch (err) {
    console.error('getBatteryMetrics error:', err)
    return {
      hasBattery: false,
      chargePercent: 0,
      isCharging: false,
      isPluggedIn: false,
      timeRemainingMins: null,
      voltage: null,
      capacityWh: null,
      designCapacityWh: null,
      healthPercent: null,
      cycleCount: null,
      manufacturer: null,
      model: null
    }
  }
}
