import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useAlertHistoryStore } from '../../store/alertHistoryStore'
import { nextWorkspaceItem } from './workspaceMenuKeys'

type Item = { label: string; to: string; analyzerMode?: 'exact' | 'photos' }
const MONITOR: Item[] = [
  { label: 'Overview', to: '/' },
  { label: 'Processes', to: '/processes' },
  { label: 'History', to: '/history' },
  { label: 'Connections', to: '/network' },
  { label: 'System', to: '/system' },
  { label: 'Storage', to: '/storage' }
]
const ANALYZE: Item[] = [
  { label: 'Duplicate Files', to: '/duplicates', analyzerMode: 'exact' },
  { label: 'Similar Photos', to: '/duplicates', analyzerMode: 'photos' }
]

function WorkspaceMenu({
  label,
  items,
  active,
  className
}: {
  label: string
  items: Item[]
  active: boolean
  className: string
}) {
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const initial = useRef(0)
  const [open, setOpen] = useState(false)
  const focus = (index: number) =>
    root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]')[index]?.focus()
  useLayoutEffect(() => {
    if (open) focus(initial.current)
  }, [open])
  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])
  return (
    <div
      className={`workspace-menu ${className}`}
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
      }}
    >
      <button
        type="button"
        ref={trigger}
        className="workspace-tab"
        data-active={active}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          initial.current = 0
          setOpen(!open)
        }}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
          event.preventDefault()
          initial.current = event.key === 'ArrowDown' ? 0 : items.length - 1
          if (open) focus(initial.current)
          else setOpen(true)
        }}
      >
        {label}
        <span aria-hidden="true" className="workspace-chevron" />
      </button>
      {open && (
        <div
          className="workspace-popup"
          role="menu"
          aria-label={label}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              trigger.current?.focus()
              setOpen(false)
              return
            }
            const entries = [...event.currentTarget.querySelectorAll('[role="menuitem"]')]
            const index = nextWorkspaceItem(
              event.key,
              entries.indexOf(document.activeElement!),
              entries.length
            )
            if (index !== null) {
              event.preventDefault()
              focus(index)
            }
          }}
        >
          {items.map(({ label, to, analyzerMode }) => (
            <Link
              key={label}
              to={to}
              role="menuitem"
              tabIndex={-1}
              state={analyzerMode ? { analyzerMode } : undefined}
              onClick={() => {
                setOpen(false)
                document.getElementById('workspace-main')?.focus()
              }}
            >
              {label}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

export function WorkspaceTabs({ tools }: { tools: ReactNode }) {
  const { pathname } = useLocation()
  const initialize = useAlertHistoryStore((state) => state.initialize)
  const unread = useAlertHistoryStore(
    (state) => state.analytics?.unreadAlerts ?? state.alerts.filter((entry) => !entry.read).length
  )
  useEffect(() => {
    void initialize()
  }, [initialize])
  const end: Item[] = [
    { label: 'Alerts', to: '/alerts' },
    { label: 'Preferences', to: '/settings' }
  ]
  const link = ({ label, to }: Item) => (
    <NavLink
      className="workspace-tab rail-link"
      end={to === '/'}
      key={to}
      to={to}
      aria-label={to === '/alerts' && unread ? `Alerts, ${unread} unread` : undefined}
    >
      {label}
      {to === '/alerts' && unread > 0 && (
        <small aria-hidden="true">{unread > 99 ? '99+' : unread}</small>
      )}
    </NavLink>
  )
  return (
    <header className="workstation-bar">
      <div className="workstation-brand">
        <svg
          width="23"
          height="23"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M12 2.8 20 6v5.8c0 4.7-3.2 7.8-8 9.5-4.8-1.7-8-4.8-8-9.5V6l8-3.2Z" />
          <path d="M7 12h2.5l1.5-2.5 2.4 5 1.5-2.5H17" />
        </svg>
        <strong>Sentinel</strong>
      </div>
      <nav className="workstation-navigation" aria-label="Sentinel workspaces">
        {MONITOR.map(link)}
        <WorkspaceMenu
          label="Analyze"
          items={ANALYZE}
          active={ANALYZE.some(({ to }) => pathname === to)}
          className="analysis-menu"
        />
        {end.map(link)}
        <WorkspaceMenu
          label="Workspaces"
          items={[...MONITOR, ...ANALYZE, ...end]}
          active={false}
          className="compact-workspaces"
        />
      </nav>
      <div className="workstation-tools">{tools}</div>
    </header>
  )
}
