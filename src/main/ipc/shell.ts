import { app, clipboard } from 'electron'
import { handleTrustedIpc } from '../ipcSecurity'

interface ShellIpcOptions {
  showMainWindow: () => void
  setTrayCompact: (compact: boolean) => boolean
}

export function registerShellIpc({ showMainWindow, setTrayCompact }: ShellIpcOptions): void {
  handleTrustedIpc('copy-text', (_event, _role, text: unknown) => {
    if (typeof text !== 'string' || text.length > 262_144 || text.includes('\0')) {
      throw new Error('Invalid clipboard text')
    }
    clipboard.writeText(text)
  })
  handleTrustedIpc('open-main-window', () => {
    showMainWindow()
  })

  handleTrustedIpc('quit-app', () => {
    app.quit()
  })

  handleTrustedIpc('set-tray-compact', (_event, _role, compact: unknown) => {
    return typeof compact === 'boolean' && setTrayCompact(compact)
  })
}
