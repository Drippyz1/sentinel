import { ipcMain } from 'electron'
import { assertTrustedIpcSender } from '../ipcSecurity'

interface MiniMonitorIpcOptions {
  showMiniMonitor: () => void
  hideMiniMonitor: () => void
  setMiniMonitorAlwaysOnTop: (alwaysOnTop: boolean) => boolean
}

export function registerMiniMonitorIpc({
  showMiniMonitor,
  hideMiniMonitor,
  setMiniMonitorAlwaysOnTop
}: MiniMonitorIpcOptions): void {
  ipcMain.handle('show-mini-monitor', (event) => {
    assertTrustedIpcSender(event)
    showMiniMonitor()
  })

  ipcMain.handle('hide-mini-monitor', (event) => {
    assertTrustedIpcSender(event)
    hideMiniMonitor()
  })

  ipcMain.handle('set-mini-monitor-always-on-top', (event, alwaysOnTop: unknown) => {
    assertTrustedIpcSender(event)
    return typeof alwaysOnTop === 'boolean' ? setMiniMonitorAlwaysOnTop(alwaysOnTop) : false
  })
}
