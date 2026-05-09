// A reusable card container — every widget will use this
interface CardProps {
  children: React.ReactNode
  className?: string        // lets callers add extra classes
  title?: string
  subtitle?: string
}

export function Card({ children, className = '', title, subtitle }: CardProps) {
  return (
    <div
      className={`rounded-xl border p-4 ${className}`}
      style={{
        backgroundColor: 'var(--bg-card)',
        borderColor: 'var(--border)'
      }}
    >
      {title && (
        <div className="mb-3">
          <h3 className="text-sm font-semibold uppercase tracking-widest"
              style={{ color: 'var(--text-muted)' }}>
            {title}
          </h3>
          {subtitle && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {subtitle}
            </p>
          )}
        </div>
      )}
      {children}
    </div>
  )
}