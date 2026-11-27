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
      className={`inline-flex max-w-full flex-wrap gap-1 rounded-lg p-1 ${className}`}
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
            className="control segmented-item"
            aria-pressed={isActive}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
