import { app, clipboard, ipcMain } from 'electron'
import { assertTrustedIpcSender } from '../ipcSecurity'

interface ShellIpcOptions {
  showMainWindow: () => void
  setTrayCompact: (compact: boolean) => void
}

export function registerShellIpc({ showMainWindow, setTrayCompact }: ShellIpcOptions): void {
  ipcMain.handle('copy-text', (event, text: unknown) => {
    assertTrustedIpcSender(event, 'main')
    if (typeof text !== 'string' || text.length > 262_144 || text.includes('\0')) {
      throw new Error('Invalid clipboard text')
    }
    clipboard.writeText(text)
  })
  ipcMain.handle('open-main-window', (event) => {
    assertTrustedIpcSender(event)
    showMainWindow()
  })

  ipcMain.handle('quit-app', (event) => {
    assertTrustedIpcSender(event)
    app.quit()
  })

  ipcMain.handle('set-tray-compact', (event, compact: unknown) => {
    assertTrustedIpcSender(event, 'tray')
    if (typeof compact === 'boolean') setTrayCompact(compact)
  })
}
