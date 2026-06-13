// A horizontal progress bar for showing usage percentages
interface UsageBarProps {
  percent: number // 0-100
  accent?: 'blue' | 'green' | 'amber' | 'red' | 'purple'
  height?: number // px
}

const accentColors = {
  blue: 'var(--accent-blue)',
  green: 'var(--accent-green)',
  amber: 'var(--accent-amber)',
  red: 'var(--accent-red)',
  purple: 'var(--accent-purple)'
}

// Automatically pick a color based on how high the usage is
function getAccentForUsage(percent: number): 'green' | 'amber' | 'red' {
  if (percent < 60) return 'green'
  if (percent < 85) return 'amber'
  return 'red'
}

export function UsageBar({ percent, accent, height = 4 }: UsageBarProps) {
  const resolvedAccent = accent ?? getAccentForUsage(percent)
  const clampedPercent = Math.min(100, Math.max(0, percent))

  return (
    <div
      className="w-full rounded-full overflow-hidden"
      style={{ height: `${height}px`, backgroundColor: 'var(--border)' }}
    >
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{
          width: `${clampedPercent}%`,
          backgroundColor: accentColors[resolvedAccent]
        }}
      />
    </div>
  )
}
