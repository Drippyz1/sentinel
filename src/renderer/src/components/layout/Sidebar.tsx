import { NavLink } from 'react-router-dom'

const NAV_ITEMS = [
  {
    path:  '/',
    label: 'Dashboard',
    icon:  (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
      </svg>
    )
  },
  {
    path:  '/processes',
    label: 'Processes',
    icon:  (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" strokeWidth="2" strokeLinecap="round">
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
    path:  '/system',
    label: 'System',
    icon:  (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  )
},
  {
    path:  '/history',
    label: 'History',
    icon:  (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    )
  },
  {
    path:  '/settings',
    label: 'Settings',
    icon:  (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
      </svg>
    )
  },
]

export function Sidebar() {
  return (
    <aside
      className="flex flex-col h-full w-52 shrink-0 py-4"
      style={{ borderRight: '1px solid var(--border)' }}
    >
      <div className="flex items-center gap-2.5 px-5 mb-8">
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--accent-green)' }} />
        <span className="text-base font-semibold tracking-wide">Sentinel</span>
      </div>

      <nav className="flex flex-col gap-1 px-3">
        {NAV_ITEMS.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}   // "end" means only match exactly "/" not "/anything"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm
                       font-medium transition-all"
            style={({ isActive }) => ({
              backgroundColor: isActive ? 'var(--bg-card)'  : 'transparent',
              color:           isActive ? 'var(--text-primary)' : 'var(--text-muted)',
            })}
          >
            {item.icon}
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}