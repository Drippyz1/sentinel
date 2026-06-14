import { useEffect, useState } from 'react'
import type { ProcessDetails, ProcessInfo } from '../../../../shared/contracts'
import { formatBytes } from '../../utils/format'

function formatUptime(seconds: number | null): string {
  if (seconds === null) return 'Unavailable'
  const days = Math.floor(seconds / 86_400)
  const hours = Math.floor((seconds % 86_400) / 3_600)
  const minutes = Math.floor((seconds % 3_600) / 60)
  if (days > 0) return `${days}d ${hours}h ${minutes}m`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function DetailRow({
  label,
  value,
  monospace = false
}: {
  label: string
  value: string
  monospace?: boolean
}) {
  return (
    <div className="grid min-w-0 gap-1 py-2.5 sm:grid-cols-[120px_minmax(0,1fr)] sm:gap-3">
      <dt className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
        {label}
      </dt>
      <dd
        className={`min-w-0 break-words text-sm ${monospace ? 'font-mono text-xs' : ''}`}
        style={{ color: 'var(--text-primary)' }}
        title={value}
      >
        {value}
      </dd>
    </div>
  )
}

function CopyButton({ label, value }: { label: string; value: string | null }) {
  const [copied, setCopied] = useState(false)
  if (!value) return null
  const copyValue = value

  async function copy() {
    try {
      await navigator.clipboard.writeText(copyValue)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch (error) {
      console.error(`Failed to copy ${label}:`, error)
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="min-h-9 rounded-lg px-3 py-2 text-xs font-semibold"
      style={{
        color: copied ? 'var(--accent-green)' : 'var(--text-primary)',
        backgroundColor: 'var(--bg-base)',
        border: '1px solid var(--border)'
      }}
    >
      {copied ? 'Copied' : `Copy ${label}`}
    </button>
  )
}

interface ProcessDetailsDrawerProps {
  process: ProcessInfo
  details: ProcessDetails | null
  loading: boolean
  error: string | null
  onClose: () => void
  onKill: () => void
}

export function ProcessDetailsDrawer({
  process,
  details,
  loading,
  error,
  onClose,
  onKill
}: ProcessDetailsDrawerProps) {
  const [revealError, setRevealError] = useState(false)
  const isMac = navigator.platform.toUpperCase().includes('MAC')

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  async function revealProcess() {
    setRevealError(false)
    try {
      if (!(await window.electronAPI.revealProcess(process.pid))) setRevealError(true)
    } catch {
      setRevealError(true)
    }
  }

  const value = (candidate: string | number | null | undefined) =>
    candidate === null || candidate === undefined || candidate === ''
      ? 'Unavailable'
      : String(candidate)

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-black/60"
      role="presentation"
      onMouseDown={onClose}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="process-details-title"
        className="flex h-full w-full max-w-md flex-col overflow-hidden shadow-2xl"
        style={{ backgroundColor: 'var(--bg-card)', borderLeft: '1px solid var(--border)' }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header
          className="flex items-start justify-between gap-4 border-b px-5 py-4"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="min-w-0">
            <h2
              id="process-details-title"
              className="truncate text-base font-semibold"
              style={{ color: 'var(--text-primary)' }}
            >
              {process.name}
            </h2>
            <p className="mt-0.5 font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
              PID {process.pid}
            </p>
          </div>
          <button
            type="button"
            autoFocus
            onClick={onClose}
            aria-label="Close process details"
            className="min-h-9 shrink-0 rounded-lg px-3 text-xs font-semibold"
            style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
          >
            Close
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
              Loading process details...
            </p>
          ) : (
            <>
              {error && (
                <p
                  className="mb-3 rounded-lg px-3 py-3 text-sm"
                  style={{
                    color: 'var(--accent-amber)',
                    backgroundColor: 'rgba(245,158,11,0.1)'
                  }}
                >
                  {error}
                </p>
              )}
              <dl className="divide-y" style={{ borderColor: 'var(--border)' }}>
                <DetailRow label="Process name" value={process.name} />
                <DetailRow label="PID" value={String(process.pid)} monospace />
                <DetailRow label="Parent PID" value={value(details?.parentPid)} monospace />
                <DetailRow label="CPU usage" value={`${process.cpuPercent.toFixed(1)}%`} />
                <DetailRow
                  label="Memory usage"
                  value={`${formatBytes(process.memoryBytes)} (${process.memoryPercent.toFixed(1)}%)`}
                />
                <DetailRow label="Threads" value={value(details?.threads)} />
                <DetailRow label="User" value={value(details?.user)} />
                <DetailRow label="Path" value={value(details?.path)} monospace />
                <DetailRow label="Command line" value={value(details?.commandLine)} monospace />
                <DetailRow label="Start time" value={value(details?.started || process.started)} />
                <DetailRow label="Uptime" value={formatUptime(details?.uptimeSeconds ?? null)} />
                <DetailRow label="Architecture" value={value(details?.architecture)} monospace />
                <DetailRow label="Platform" value={value(details?.platform)} monospace />
              </dl>

              {revealError && (
                <p className="mt-3 text-xs" style={{ color: 'var(--accent-amber)' }}>
                  The process location is no longer available.
                </p>
              )}
            </>
          )}
        </div>

        <footer
          className="border-t px-5 py-4"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-base)' }}
        >
          <div className="flex flex-wrap gap-2">
            <CopyButton label="PID" value={String(process.pid)} />
            <CopyButton label="Name" value={process.name} />
            <CopyButton label="Path" value={details?.path ?? null} />
            <CopyButton label="Command" value={details?.commandLine ?? null} />
            {isMac && details?.path && (
              <button
                type="button"
                onClick={() => void revealProcess()}
                className="min-h-9 rounded-lg px-3 py-2 text-xs font-semibold"
                style={{ color: 'var(--accent-blue)', border: '1px solid var(--border)' }}
              >
                Reveal in Finder
              </button>
            )}
            <button
              type="button"
              onClick={onKill}
              className="min-h-9 rounded-lg px-3 py-2 text-xs font-semibold text-white"
              style={{
                backgroundColor: 'var(--accent-red)',
                border: '1px solid var(--accent-red)'
              }}
            >
              Kill Process
            </button>
          </div>
        </footer>
      </aside>
    </div>
  )
}
