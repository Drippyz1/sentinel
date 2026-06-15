export interface CommandContext {
  navigate: (path: string, options?: { state?: Record<string, unknown>; replace?: boolean }) => void
  dashboardPaused: boolean
  setDashboardPaused: (paused: boolean) => void
  unreadAlerts: number
  alertCount: number
  markAllAlertsRead: () => Promise<void>
  clearAlertHistory: () => Promise<void>
}

export interface CommandDefinition {
  id: string
  label: string
  keywords: string[]
  group: 'Navigation' | 'Actions'
  disabled?: boolean
  execute: () => void | Promise<void>
}

const NAVIGATION_COMMANDS = [
  { id: 'dashboard', label: 'Dashboard', path: '/', keywords: ['home', 'overview', 'metrics'] },
  { id: 'history', label: 'History', path: '/history', keywords: ['charts', 'table', 'metrics'] },
  {
    id: 'processes',
    label: 'Processes',
    path: '/processes',
    keywords: ['tasks', 'applications', 'cpu', 'memory']
  },
  { id: 'system', label: 'System', path: '/system', keywords: ['hardware', 'thermal', 'report'] },
  {
    id: 'network',
    label: 'Network',
    path: '/network',
    keywords: ['connections', 'tcp', 'udp', 'ports']
  },
  {
    id: 'alerts',
    label: 'Alerts',
    path: '/alerts',
    keywords: ['notifications', 'warnings', 'history']
  },
  {
    id: 'settings',
    label: 'Settings',
    path: '/settings',
    keywords: ['preferences', 'configuration', 'alerts']
  }
] as const

export function createCommandRegistry(context: CommandContext): CommandDefinition[] {
  const navigation = NAVIGATION_COMMANDS.map<CommandDefinition>((command) => ({
    id: `go-${command.id}`,
    label: `Go to ${command.label}`,
    keywords: ['go', 'navigate', 'open', ...command.keywords],
    group: 'Navigation',
    execute: () => context.navigate(command.path)
  }))

  return [
    ...navigation,
    {
      id: 'open-mini-monitor',
      label: 'Open Mini Monitor',
      keywords: ['floating', 'window', 'metrics', 'monitor'],
      group: 'Actions',
      execute: () => window.electronAPI.showMiniMonitor()
    },
    {
      id: 'pause-live-updates',
      label: 'Pause Live Updates',
      keywords: ['dashboard', 'monitoring', 'stop', 'metrics'],
      group: 'Actions',
      disabled: context.dashboardPaused,
      execute: () => context.setDashboardPaused(true)
    },
    {
      id: 'resume-live-updates',
      label: 'Resume Live Updates',
      keywords: ['dashboard', 'monitoring', 'start', 'metrics'],
      group: 'Actions',
      disabled: !context.dashboardPaused,
      execute: () => context.setDashboardPaused(false)
    },
    {
      id: 'export-diagnostic-bundle',
      label: 'Export Diagnostic Bundle',
      keywords: ['system', 'report', 'zip', 'support', 'troubleshooting'],
      group: 'Actions',
      execute: () =>
        context.navigate('/system', {
          state: { command: 'open-diagnostic-bundle' }
        })
    },
    {
      id: 'mark-all-alerts-read',
      label: 'Mark All Alerts Read',
      keywords: ['alerts', 'notifications', 'unread', 'acknowledge'],
      group: 'Actions',
      disabled: context.unreadAlerts === 0,
      execute: context.markAllAlertsRead
    },
    {
      id: 'clear-alert-history',
      label: 'Clear Alert History',
      keywords: ['alerts', 'delete', 'remove', 'reset'],
      group: 'Actions',
      disabled: context.alertCount === 0,
      execute: context.clearAlertHistory
    },
    {
      id: 'open-alert-history',
      label: 'Open Alert History',
      keywords: ['alerts', 'events', 'notifications', 'list'],
      group: 'Actions',
      execute: () =>
        context.navigate('/alerts', {
          state: { command: 'focus-alert-history' }
        })
    },
    {
      id: 'open-alert-analytics',
      label: 'Open Alert Analytics',
      keywords: ['alerts', 'summary', 'counts', 'statistics'],
      group: 'Actions',
      execute: () =>
        context.navigate('/alerts', {
          state: { command: 'focus-alert-analytics' }
        })
    }
  ]
}
