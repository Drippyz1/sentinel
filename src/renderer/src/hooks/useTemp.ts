import { useState, useEffect } from 'react'
import { AppSettings } from '../../../main/storage/settings'

// Converts Celsius to Fahrenheit
function toF(c: number): number {
  return Math.round((c * 9) / 5 + 32)
}

// Formats a nullable Celsius value using the user's preferred unit
function fmt(celsius: number | null, unit: AppSettings['tempUnit']): string {
  if (celsius === null) return 'N/A'
  if (unit === 'F') return `${toF(celsius)}°F`
  return `${celsius}°C`
}

// Hook — reads tempUnit from settings once on mount and whenever
// settings change. Returns a formatTemp function ready to use in JSX.
export function useTemp() {
  const [unit, setUnit] = useState<AppSettings['tempUnit']>('C')

  useEffect(() => {
    // Load initial value
    window.electronAPI.getSettings().then((s) => setUnit(s.tempUnit))

    // Re-read every 5 seconds so changing the setting in the
    // Settings page is reflected without a full page reload
    const interval = setInterval(() => {
      window.electronAPI.getSettings().then((s) => setUnit(s.tempUnit))
    }, 5000)

    return () => clearInterval(interval)
  }, [])

  return {
    unit,
    formatTemp: (celsius: number | null) => fmt(celsius, unit)
  }
}
