export function formatBytes(bytes: number | null, decimals = 1): string {
  if (bytes === null || !Number.isFinite(bytes)) return 'Unavailable'
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(decimals)} GB`
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(decimals)} MB`
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(decimals)} KB`
  return `${bytes} B`
}

export function formatSpeed(bytesPerSec: number | null): string {
  if (bytesPerSec === null || !Number.isFinite(bytesPerSec)) return 'Unavailable'
  const value = Math.max(0, bytesPerSec)
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s']
  let unitIndex = 0
  let scaled = value

  while (scaled >= 1000 && unitIndex < units.length - 1) {
    scaled /= 1000
    unitIndex += 1
  }

  const decimals = unitIndex === 0 || scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2
  return `${Number(scaled.toFixed(decimals))} ${units[unitIndex]}`
}

export function formatPercent(value: number | null, decimals = 1): string {
  if (value === null || !Number.isFinite(value)) return 'Unavailable'
  return `${value.toFixed(decimals)}%`
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
