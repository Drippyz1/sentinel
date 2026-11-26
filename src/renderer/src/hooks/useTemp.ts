import type { AppSettings } from '../../../shared/contracts'
import { normalizeTemperature } from '../../../shared/utils/temperature'
import { useUiSettingsStore } from '../store/uiSettingsStore'

function toF(c: number): number {
  return Math.round((c * 9) / 5 + 32)
}

function fmt(celsius: number | null, unit: AppSettings['tempUnit']): string {
  const temperature = normalizeTemperature(celsius)
  if (temperature === null) return 'Unavailable'
  if (unit === 'F') return `${toF(temperature)}°F`
  return `${temperature}°C`
}

export function useTemp() {
  const unit = useUiSettingsStore((state) => state.tempUnit)

  return {
    unit,
    formatTemp: (celsius: number | null) => fmt(celsius, unit)
  }
}
