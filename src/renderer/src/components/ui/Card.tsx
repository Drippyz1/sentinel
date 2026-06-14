import type { DashboardDensity } from '../../../../shared/contracts'

// A reusable card container — every widget will use this
interface CardProps {
  children: React.ReactNode
  className?: string // lets callers add extra classes
  title?: string
  subtitle?: string
  density?: DashboardDensity
}

export function Card({
  children,
  className = '',
  title,
  subtitle,
  density = 'comfortable'
}: CardProps) {
  const padding = density === 'compact' ? 'p-3' : density === 'detailed' ? 'p-5' : 'p-4'
  const titleSpacing = density === 'compact' ? 'mb-2' : 'mb-3'

  return (
    <div
      className={`min-w-0 rounded-xl border ${padding} ${className}`}
      style={{
        backgroundColor: 'var(--bg-card)',
        borderColor: 'var(--border)'
      }}
    >
      {title && (
        <div className={`min-w-0 ${titleSpacing}`}>
          <h3
            className="text-sm font-semibold uppercase tracking-widest truncate"
            style={{ color: 'var(--text-muted)' }}
          >
            {title}
          </h3>
          {subtitle && density !== 'compact' && (
            <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
              {subtitle}
            </p>
          )}
        </div>
      )}
      {children}
    </div>
  )
}
