export type WindowRole = 'main' | 'tray' | 'mini'

const all = ['main', 'tray', 'mini'] as const
const main = ['main'] as const
const tray = ['tray'] as const
const mini = ['mini'] as const
const auxiliary = ['tray', 'mini'] as const

// Each entry defines the allowed window roles and exact argument count.
export const INVOKE_POLICY = {
  'open-main-window': [auxiliary, 0],
  'quit-app': [tray, 0],
  'copy-text': [main, 1],
  'set-tray-compact': [tray, 1],
  'show-mini-monitor': [main, 0],
  'hide-mini-monitor': [mini, 0],
  'set-mini-monitor-always-on-top': [mini, 1],
  'get-latest-metrics': [all, 0],
  'get-network-connections': [main, 0],
  'storage-session': [main, 0],
  'storage-choose': [main, 0],
  'storage-start': [main, 1],
  'storage-cancel': [main, 1],
  'storage-drop': [main, 1],
  'storage-query': [main, 2],
  'duplicate-session': [main, 0],
  'duplicate-choose': [main, 1],
  'duplicate-start': [main, 1],
  'duplicate-cancel': [main, 1],
  'duplicate-drop': [main, 1],
  'duplicate-query': [main, 2],
  'duplicate-preview': [main, 3],
  'get-process-details': [main, 1],
  'get-process-page': [main, 1],
  'reveal-process': [main, 1],
  'kill-process': [main, 1],
  'get-system-info': [main, 0],
  'get-thermal-metrics': [main, 0],
  'get-startup-metrics': [main, 0],
  'export-system-report': [main, 1],
  'export-diagnostic-bundle': [main, 0],
  'get-alert-history': [main, 0],
  'get-alert-analytics': [main, 0],
  'get-tray-alert-summary': [tray, 0],
  'get-alert-markers': [main, 1],
  'mark-all-alerts-read': [main, 0],
  'clear-alert-history': [main, 0],
  'get-settings': [main, 0],
  'get-ui-settings': [all, 0],
  'save-settings': [main, 2],
  'save-ui-settings': [['main', 'tray'], 1],
  'import-appearance-profile': [main, 0],
  'export-appearance-profile': [main, 1],
  'get-history-downsampled': [main, 1]
} as const satisfies Record<string, readonly [readonly WindowRole[], number]>

export const EVENT_ROLES = {
  'metrics-updated': all,
  'alert-history-updated': main,
  'alert-analytics-updated': main,
  'tray-alert-summary-updated': tray,
  'ui-settings-changed': all
} as const satisfies Record<string, readonly WindowRole[]>

export type InvokeChannel = keyof typeof INVOKE_POLICY
export type EventChannel = keyof typeof EVENT_ROLES

export function allowsUiSettingsPatch(role: WindowRole, patch: object): boolean {
  const keys = Object.keys(patch)
  if (role === 'tray') return keys.length === 1 && keys[0] === 'dashboardPollingPaused'
  return role === 'main' && keys.every((key) => !key.startsWith('miniMonitor'))
}
