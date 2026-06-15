import { useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { useAlertHistoryStore } from '../../store/alertHistoryStore'

const NAV_ITEMS = [
  {
    path: '/',
    label: 'Dashboard',
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
      </svg>
    )
  },
  {
    path: '/alerts',
    label: 'Alerts',
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M10 21h4" />
      </svg>
    )
  },
  {
    path: '/processes',
    label: 'Processes',
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <line x1="8" y1="6" x2="21" y2="6" />
        <line x1="8" y1="12" x2="21" y2="12" />
        <line x1="8" y1="18" x2="21" y2="18" />
        <line x1="3" y1="6" x2="3.01" y2="6" />
        <line x1="3" y1="12" x2="3.01" y2="12" />
        <line x1="3" y1="18" x2="3.01" y2="18" />
      </svg>
    )
  },
  {
    path: '/network',
    label: 'Network',
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="2" />
        <path d="M5.64 5.64a9 9 0 0 0 0 12.72M18.36 5.64a9 9 0 0 1 0 12.72" />
        <path d="M8.46 8.46a5 5 0 0 0 0 7.08M15.54 8.46a5 5 0 0 1 0 7.08" />
      </svg>
    )
  },
  {
    path: '/system',
    label: 'System',
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    )
  },
  {
    path: '/history',
    label: 'History',
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    )
  },
  {
    path: '/settings',
    label: 'Settings',
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <circle cx="12" cy="12" r="3" />
        <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
      </svg>
    )
  }
]

export function Sidebar() {
  const initializeAlerts = useAlertHistoryStore((state) => state.initialize)
  const alerts = useAlertHistoryStore((state) => state.alerts)
  const analytics = useAlertHistoryStore((state) => state.analytics)
  const unreadCount = analytics?.unreadAlerts ?? alerts.filter((alert) => !alert.read).length

  useEffect(() => {
    void initializeAlerts()
  }, [initializeAlerts])

  return (
    <aside
      className="flex h-full w-16 shrink-0 flex-col py-4 sm:w-52"
      style={{ borderRight: '1px solid var(--border)' }}
    >
      <div className="mb-8 flex items-center justify-center gap-2.5 px-3 sm:justify-start sm:px-5">
        <div
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: 'var(--accent-green)' }}
        />
        <span className="hidden text-base font-semibold tracking-wide sm:block">Sentinel</span>
      </div>

      <nav className="flex flex-col gap-1 px-3">
        {NAV_ITEMS.map((item) => {
          const itemUnreadCount = item.path === '/alerts' ? unreadCount : 0
          const label =
            itemUnreadCount > 0
              ? `${item.label}, ${itemUnreadCount} unread alert${itemUnreadCount === 1 ? '' : 's'}`
              : item.label

          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'} // "end" means only match exactly "/" not "/anything"
              className="relative flex items-center justify-center gap-3 px-3 py-2.5 rounded-lg text-sm
                         font-medium transition-all sm:justify-start"
              title={label}
              aria-label={label}
              style={({ isActive }) => ({
                backgroundColor: isActive ? 'var(--bg-card)' : 'transparent',
                color: isActive ? 'var(--text-primary)' : 'var(--text-muted)'
              })}
            >
              {item.icon}
              <span className="hidden sm:block">{item.label}</span>
              {itemUnreadCount > 0 && (
                <span
                  className="absolute right-1 top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold text-white sm:static sm:ml-auto sm:min-h-5 sm:min-w-5 sm:text-[10px]"
                  style={{ backgroundColor: 'var(--accent-red)' }}
                  aria-hidden="true"
                >
                  {itemUnreadCount > 99 ? '99+' : itemUnreadCount}
                </span>
              )}
            </NavLink>
          )
        })}
      </nav>
    </aside>
  )
}
