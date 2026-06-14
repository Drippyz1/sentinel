import type { ReactNode } from 'react'

export function ControlGroup({
  label,
  children,
  className = ''
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      <p className="mb-1.5 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
        {label}
      </p>
      {children}
    </div>
  )
}
