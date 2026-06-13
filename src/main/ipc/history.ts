import { ipcMain } from 'electron'
import { getDownsampled, getSnapshots, getSummary } from '../storage/queries'
import { assertTrustedIpcSender, isValidHistoryRange } from '../ipcSecurity'

export function registerHistoryIpc(): void {
  ipcMain.handle('get-history-snapshots', async (event, minutes: unknown) => {
    assertTrustedIpcSender(event)
    if (!isValidHistoryRange(minutes)) throw new Error('Invalid history range')
    return getSnapshots(minutes)
  })
  ipcMain.handle('get-history-summary', async (event, minutes: unknown) => {
    assertTrustedIpcSender(event)
    if (!isValidHistoryRange(minutes)) throw new Error('Invalid history range')
    return getSummary(minutes)
  })
  ipcMain.handle('get-history-downsampled', async (event, minutes: unknown) => {
    assertTrustedIpcSender(event)
    if (!isValidHistoryRange(minutes)) throw new Error('Invalid history range')
    return getDownsampled(minutes)
  })
}
