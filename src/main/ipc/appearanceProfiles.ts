import { BrowserWindow, dialog } from 'electron'
import { constants } from 'node:fs'
import { open } from 'node:fs/promises'
import { isAppearanceProfile, PROFILE_BYTES } from '../../shared/contracts/personalization'
import { assertTrustedIpcSender, handleTrustedIpc } from '../ipcSecurity'

const filters = [{ name: 'Sentinel appearance profile', extensions: ['json'] }]

export function registerAppearanceProfiles(): void {
  handleTrustedIpc('import-appearance-profile', async (event) => {
    const parent = BrowserWindow.fromWebContents(event.sender)
    if (!parent?.isVisible() || parent.isMinimized()) return { status: 'error' }
    try {
      const choice = await dialog.showOpenDialog(parent, { filters, properties: ['openFile'] })
      if (choice.canceled || !choice.filePaths[0]) return { status: 'cancelled' }
      assertTrustedIpcSender(event, 'import-appearance-profile')
      const file = await open(choice.filePaths[0], constants.O_RDONLY | constants.O_NONBLOCK)
      try {
        const stat = await file.stat()
        if (!stat.isFile() || stat.size > PROFILE_BYTES) return { status: 'invalid' }
        const data = Buffer.alloc(PROFILE_BYTES + 1)
        const { bytesRead } = await file.read(data, 0, data.length, 0)
        if (bytesRead > PROFILE_BYTES || bytesRead !== stat.size) return { status: 'invalid' }
        const profile: unknown = JSON.parse(data.toString('utf8', 0, bytesRead))
        return isAppearanceProfile(profile) ? { status: 'ready', profile } : { status: 'invalid' }
      } finally {
        await file.close()
      }
    } catch (error) {
      return { status: error instanceof SyntaxError ? 'invalid' : 'error' }
    }
  })

  handleTrustedIpc('export-appearance-profile', async (event, _role, profile) => {
    const parent = BrowserWindow.fromWebContents(event.sender)
    if (!parent?.isVisible() || parent.isMinimized() || !isAppearanceProfile(profile))
      return 'error'
    try {
      const choice = await dialog.showSaveDialog(parent, {
        filters,
        defaultPath: 'sentinel-appearance.json'
      })
      if (choice.canceled || !choice.filePath) return 'cancelled'
      assertTrustedIpcSender(event, 'export-appearance-profile')
      const data = JSON.stringify(profile, null, 2)
      if (Buffer.byteLength(data) > PROFILE_BYTES) return 'error'
      const file = await open(choice.filePath, 'wx', 0o600)
      try {
        await file.writeFile(data)
      } finally {
        await file.close()
      }
      return 'saved'
    } catch (error) {
      return error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST'
        ? 'exists'
        : 'error'
    }
  })
}
