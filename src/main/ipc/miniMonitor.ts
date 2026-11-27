import { handleTrustedIpc } from '../ipcSecurity'

interface MiniMonitorIpcOptions {
  showMiniMonitor: () => boolean
  hideMiniMonitor: () => boolean
  setMiniMonitorAlwaysOnTop: (alwaysOnTop: boolean) => boolean
}

export function registerMiniMonitorIpc({
  showMiniMonitor,
  hideMiniMonitor,
  setMiniMonitorAlwaysOnTop
}: MiniMonitorIpcOptions): void {
  handleTrustedIpc('show-mini-monitor', () => showMiniMonitor())

  handleTrustedIpc('hide-mini-monitor', () => hideMiniMonitor())

  handleTrustedIpc('set-mini-monitor-always-on-top', (_event, _role, alwaysOnTop: unknown) => {
    return typeof alwaysOnTop === 'boolean' ? setMiniMonitorAlwaysOnTop(alwaysOnTop) : false
  })
}
