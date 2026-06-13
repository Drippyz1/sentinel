// Converts raw bytes to human-readable string
// e.g. 4294967296 → "4.0 GB"
export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(decimals)} GB`
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(decimals)} MB`
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(decimals)} KB`
  return `${bytes} B`
}

// Converts bytes-per-second to a readable speed string
// e.g. 1500000 → "1.5 MB/s"
export function formatSpeed(bytesPerSec: number): string {
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

// Formats a percentage with consistent decimal places
// e.g. 42.6666 → "42.7%"
export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`
}

// Formats a date as a readable time string
// e.g. Date object → "14:32:05"
export function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
