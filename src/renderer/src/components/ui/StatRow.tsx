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
    <div className="flex justify-between items-center py-1.5">
      <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
        {label}
      </span>
      <span className="text-sm font-mono font-medium" style={{ color: accentColors[accent] }}>
        {value}
      </span>
    </div>
  )
}
