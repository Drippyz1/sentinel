import { useState } from 'react'

// A single labeled metric row — used inside cards
interface StatRowProps {
  label: string
  value: string
  accent?: 'blue' | 'green' | 'amber' | 'red' | 'purple'
  copyable?: boolean
}

const accentColors = {
  blue: 'var(--accent-blue)',
  green: 'var(--accent-green)',
  amber: 'var(--accent-amber)',
  red: 'var(--accent-red)',
  purple: 'var(--accent-purple)'
}

export function StatRow({ label, value, accent = 'blue', copyable = false }: StatRowProps) {
  const [copied, setCopied] = useState(false)

  async function copyValue() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch (error) {
      console.error('Failed to copy value:', error)
    }
  }

  return (
    <div className="flex justify-between items-center gap-3 min-w-0 py-1.5">
      <span className="text-sm shrink-0" style={{ color: 'var(--text-muted)' }}>
        {label}
      </span>
      <div className="flex min-w-0 items-center justify-end gap-1.5">
        <span
          className="min-w-0 truncate text-right text-sm font-mono font-medium"
          style={{ color: accentColors[accent] }}
          title={value}
        >
          {value}
        </span>
        {copyable && value !== 'N/A' && (
          <button
            type="button"
            onClick={copyValue}
            className="min-h-7 shrink-0 rounded-md px-2 text-[10px] font-semibold"
            style={{
              color: copied ? 'var(--accent-green)' : 'var(--text-muted)',
              backgroundColor: 'var(--bg-base)',
              border: '1px solid var(--border)'
            }}
            aria-label={`Copy ${label}`}
            title={`Copy ${label}`}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        )}
      </div>
    </div>
  )
}
