import { ipcMain } from 'electron'
import { getDownsampled } from '../storage/queries'
import { assertTrustedIpcSender, isValidHistoryRange } from '../ipcSecurity'

export function registerHistoryIpc(): void {
  ipcMain.handle('get-history-downsampled', async (event, minutes: unknown) => {
    assertTrustedIpcSender(event, 'main')
    if (!isValidHistoryRange(minutes)) throw new Error('Invalid history range')
    return getDownsampled(minutes)
  })
}
