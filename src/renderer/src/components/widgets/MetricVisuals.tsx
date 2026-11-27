import { useState, type CSSProperties, type ReactNode } from 'react'
import type { DashboardWidget } from '../../../../shared/contracts'
import { boundedPercent } from '../../../../shared/utils/visualization'
import { formatPercent } from '../../utils/format'

export function WidgetFrame({
  id,
  title,
  meta,
  children
}: {
  id: DashboardWidget
  title: string
  meta?: string
  children: ReactNode
}) {
  return (
    <article className="instrument" data-metric={id}>
      <header className="instrument-header">
        <h3>{title}</h3>
        {meta && <span>{meta}</span>}
      </header>
      {children}
    </article>
  )
}

export function Reading({ value, unit, note }: { value: string; unit?: string; note?: string }) {
  return (
    <div className="reading">
      <div className="reading-value" data-unavailable={value === 'Unavailable'}>
        {value}
        {unit && <span>{unit}</span>}
      </div>
      {note && <p>{note}</p>}
    </div>
  )
}

export function FractionMeter({ value }: { value: number }) {
  const fill = boundedPercent(value)
  if (fill === null) return null
  return (
    <div className="instrument-meter" aria-hidden="true">
      <span style={{ width: `${fill}%` }} />
    </div>
  )
}

export function PercentDisplay({
  value,
  style,
  note
}: {
  value: number | null
  style?: 'gauge' | 'ring' | 'bar' | 'number'
  note?: string
}) {
  const percent = boundedPercent(value)
  if (percent === null) {
    return (
      <Reading
        value="Unavailable"
        note={value == null ? note : 'Reading outside the 0–100% scale'}
      />
    )
  }
  const number = (
    <Reading value={percent.toFixed(0)} unit="%" note={style !== 'gauge' ? note : undefined} />
  )
  if (style === 'gauge') {
    return (
      <div className="dial-display">
        <div className="arc">
          <svg aria-hidden="true" viewBox="0 0 140 83">
            <path className="dial-track" d="M10 72a60 60 0 0 1 120 0" />
            <path
              className="dial-guide"
              d="M14 74a56 56 0 0 1 112 0"
              pathLength="12"
              strokeDasharray=".075 .925"
            />
            {percent > 0 && (
              <path
                className="dial-fill"
                d="M10 72a60 60 0 0 1 120 0"
                pathLength="100"
                strokeDasharray={`${percent} 100`}
              />
            )}
          </svg>
          {number}
          <div aria-hidden="true" className="dial-axis">
            <span>0</span>
            <span>100</span>
          </div>
        </div>
        {note && <span className="instrument-note">{note}</span>}
      </div>
    )
  }
  if (style === 'ring') {
    return (
      <div className="ring-display">
        <svg aria-hidden="true" viewBox="0 0 64 64">
          <circle className="dial-track" cx="32" cy="32" r="26" />
          {percent > 0 && (
            <circle
              className="dial-fill"
              cx="32"
              cy="32"
              r="26"
              pathLength="100"
              transform="rotate(-90 32 32)"
              strokeDasharray={`${percent} 100`}
            />
          )}
        </svg>
        {number}
      </div>
    )
  }
  return (
    <>
      {number}
      {style === 'bar' && <FractionMeter value={percent} />}
    </>
  )
}

export function MetricFacts({ values }: { values: [label: string, value: string][] }) {
  return (
    <dl className="instrument-facts">
      {values.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function MetricDetails({
  expanded,
  children,
  label = 'Details'
}: {
  expanded?: boolean
  children: ReactNode
  label?: string
}) {
  const [open, setOpen] = useState(false)
  return expanded ? (
    <div className="instrument-detail">{children}</div>
  ) : (
    <details className="instrument-detail" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>{label}</summary>
      {open && children}
    </details>
  )
}

export function CoreActivity({ cores }: { cores: (number | null)[] }) {
  const [requested, setPage] = useState(0)
  const pageSize = 16
  const pageCount = Math.ceil(cores.length / pageSize)
  const page = Math.max(0, Math.min(requested, pageCount - 1))
  if (!cores.some((core) => boundedPercent(core) !== null))
    return <p className="instrument-note">Per-core readings unavailable</p>
  const offset = page * pageSize
  return (
    <section className="core-section" aria-label="Per-core CPU utilization">
      <header>
        <strong>Per-core utilization</strong>
        {pageCount > 1 && (
          <span>
            {offset + 1}–{Math.min(offset + pageSize, cores.length)} of {cores.length}
          </span>
        )}
      </header>
      <ol className="core-activity">
        {cores.slice(offset, offset + pageSize).map((value, index) => {
          const pct = boundedPercent(value)
          const number = offset + index + 1
          return (
            <li
              key={number}
              title={`Core ${number}: ${formatPercent(pct, 0)}`}
              style={{ '--core-fill': `${pct ?? 0}%` } as CSSProperties}
            >
              <span aria-hidden="true">{number}</span>
              <span className="sr-only">Core {number}: </span>
              <span className="core-meter-column" aria-hidden="true">
                <i />
              </span>
              <strong>
                {pct === null ? (
                  <>
                    <span aria-hidden="true">—</span>
                    <span className="sr-only">Unavailable</span>
                  </>
                ) : (
                  formatPercent(pct, 0)
                )}
              </strong>
            </li>
          )
        })}
      </ol>
      {pageCount > 1 && (
        <div className="workspace-actions">
          <button
            type="button"
            className="control"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            Previous cores
          </button>
          <button
            type="button"
            className="control"
            disabled={page >= pageCount - 1}
            onClick={() => setPage(page + 1)}
          >
            Next cores
          </button>
        </div>
      )}
    </section>
  )
}

export function SpeedPair({ items }: { items: [label: string, value: string, arrow: string][] }) {
  return (
    <dl className="speed-pair">
      {items.map(([label, value, arrow]) => (
        <div key={label}>
          <dt>
            <span aria-hidden="true">{arrow}</span> {label}
          </dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}
