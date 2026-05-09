import si from 'systeminformation'

export interface BatteryMetrics {
  hasBattery:        boolean
  chargePercent:     number        // 0-100
  isCharging:        boolean
  isPluggedIn:       boolean
  timeRemainingMins: number | null // minutes until empty or full
  voltage:           number | null // volts
  capacityWh:        number | null // current max capacity in Wh
  designCapacityWh:  number | null // original design capacity in Wh
  healthPercent:     number | null // capacityWh / designCapacityWh * 100
  cycleCount:        number | null // number of charge cycles
  manufacturer:      string | null
  model:             string | null
}

export async function getBatteryMetrics(): Promise<BatteryMetrics> {
  try {
    const data = await si.battery()

    if (!data || !data.hasBattery) {
      return {
        hasBattery:        false,
        chargePercent:     0,
        isCharging:        false,
        isPluggedIn:       false,
        timeRemainingMins: null,
        voltage:           null,
        capacityWh:        null,
        designCapacityWh:  null,
        healthPercent:     null,
        cycleCount:        null,
        manufacturer:      null,
        model:             null,
      }
    }

    // Calculate battery health — how much capacity remains vs original
    // e.g. 85% health means the battery holds 85% of its original charge
    const capacityWh     = data.maxCapacity   ? data.maxCapacity / 1000   : null
    const designCapacity = data.designCapacity ? data.designCapacity / 1000 : null
    const healthPercent  = capacityWh && designCapacity && designCapacity > 0
      ? Math.round((capacityWh / designCapacity) * 100)
      : null

    // timeRemaining comes back in minutes from systeminformation
    const timeRemainingMins = data.timeRemaining && data.timeRemaining > 0
      ? data.timeRemaining
      : null

    return {
      hasBattery:        true,
      chargePercent:     Math.round(data.percent ?? 0),
      isCharging:        data.isCharging  ?? false,
      isPluggedIn:       data.acConnected ?? false,
      timeRemainingMins,
      voltage:           data.voltage     ?? null,
      capacityWh,
      designCapacityWh:  designCapacity,
      healthPercent,
      cycleCount:        data.cycleCount  ?? null,
      manufacturer:      data.manufacturer ?? null,
      model:             data.model        ?? null,
    }

  } catch (err) {
    console.error('getBatteryMetrics error:', err)
    return {
      hasBattery:        false,
      chargePercent:     0,
      isCharging:        false,
      isPluggedIn:       false,
      timeRemainingMins: null,
      voltage:           null,
      capacityWh:        null,
      designCapacityWh:  null,
      healthPercent:     null,
      cycleCount:        null,
      manufacturer:      null,
      model:             null,
    }
  }
}