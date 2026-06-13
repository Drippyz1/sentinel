interface SegmentedControlProps<T extends string> {
  value: T
  options: { label: string; value: T }[]
  onChange: (value: T) => void
  ariaLabel: string
  className?: string
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className = ''
}: SegmentedControlProps<T>) {
  return (
    <div
      className={`inline-flex flex-wrap gap-1 rounded-xl p-1 ${className}`}
      style={{ backgroundColor: 'var(--bg-base)', border: '1px solid var(--border)' }}
      role="group"
      aria-label={ariaLabel}
    >
      {options.map((option) => {
        const isActive = option.value === value

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className="min-h-8 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap"
            style={{
              backgroundColor: isActive ? 'var(--accent-blue)' : 'transparent',
              color: isActive ? 'white' : 'var(--text-muted)',
              boxShadow: isActive ? '0 1px 6px rgba(59, 130, 246, 0.25)' : 'none'
            }}
            aria-pressed={isActive}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
