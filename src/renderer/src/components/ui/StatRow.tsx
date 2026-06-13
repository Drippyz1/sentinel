// A single labeled metric row — used inside cards
interface StatRowProps {
  label: string
  value: string
  accent?: 'blue' | 'green' | 'amber' | 'red' | 'purple'
}

const accentColors = {
  blue: 'var(--accent-blue)',
  green: 'var(--accent-green)',
  amber: 'var(--accent-amber)',
  red: 'var(--accent-red)',
  purple: 'var(--accent-purple)'
}

export function StatRow({ label, value, accent = 'blue' }: StatRowProps) {
  return (
    <div className="flex justify-between items-center gap-3 min-w-0 py-1.5">
      <span className="text-sm shrink-0" style={{ color: 'var(--text-muted)' }}>
        {label}
      </span>
      <span
        className="min-w-0 truncate text-right text-sm font-mono font-medium"
        style={{ color: accentColors[accent] }}
        title={value}
      >
        {value}
      </span>
    </div>
  )
}
