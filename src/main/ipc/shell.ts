import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { assertTrustedIpcSender, isSafeExternalUrl } from '../ipcSecurity'

interface ShellIpcOptions {
  showMainWindow: () => void
  setTrayCompact: (compact: boolean) => void
}

export function configureExternalLinkHandling(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler((details) => {
    if (isSafeExternalUrl(details.url)) {
      void shell.openExternal(details.url)
    }
    return { action: 'deny' }
  })
}

export function registerShellIpc({ showMainWindow, setTrayCompact }: ShellIpcOptions): void {
  ipcMain.handle('open-main-window', (event) => {
    assertTrustedIpcSender(event)
    showMainWindow()
  })

  ipcMain.handle('set-tray-compact', (event, compact: unknown) => {
    assertTrustedIpcSender(event)
    if (typeof compact === 'boolean') setTrayCompact(compact)
  })

  ipcMain.handle('hide-dock', (event) => {
    assertTrustedIpcSender(event)
    if (process.platform === 'darwin') app.dock?.hide()
  })
  ipcMain.handle('show-dock', (event) => {
    assertTrustedIpcSender(event)
    if (process.platform === 'darwin') app.dock?.show()
  })
}
