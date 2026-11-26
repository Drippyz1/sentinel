import si from 'systeminformation'
import type { BatteryMetrics, MetricCollectionResult } from '../../shared/contracts'
import { nonNegative, observed, percent, unavailable } from '../probe'

function toWh(capacity: unknown, unit: string, voltage: number | null): number | null {
  const amount = nonNegative(capacity)
  if (!amount) return null
  if (unit === 'mWh') return amount / 1000
  if (unit === 'mAh' && voltage) return (amount * voltage) / 1000
  return null
}

export async function getBatteryMetrics(): Promise<MetricCollectionResult<BatteryMetrics>> {
  const data = await si.battery()
  if (!data.hasBattery) return unavailable('not-detected')
  const charge = percent(data.percent)
  if (charge === null) return unavailable('no-data')

  const voltage = nonNegative(data.voltage) || null
  const capacityWh = toWh(data.maxCapacity, data.capacityUnit, voltage)
  const designCapacityWh = toWh(data.designedCapacity, data.capacityUnit, voltage)
  // Battery health is a ratio even when the provider only reports charge in mAh.
  const maximum = nonNegative(data.maxCapacity)
  const design = nonNegative(data.designedCapacity)
  const healthPercent = maximum && design ? Math.round((maximum / design) * 100) : null
  const minutes = nonNegative(data.timeRemaining)

  return observed({
    hasBattery: true,
    chargePercent: Math.round(charge),
    isCharging: Boolean(data.isCharging),
    isPluggedIn: Boolean(data.acConnected),
    timeRemainingMins: minutes && minutes < 65535 ? minutes : null,
    voltage,
    capacityWh,
    designCapacityWh,
    healthPercent,
    cycleCount: nonNegative(data.cycleCount),
    manufacturer: data.manufacturer || null,
    model: data.model || null
  })
}
