import { getDownsampled } from '../storage/queries'
import { handleTrustedIpc, isValidHistoryRange } from '../ipcSecurity'

export function registerHistoryIpc(): void {
  handleTrustedIpc('get-history-downsampled', async (_event, _role, minutes: unknown) => {
    if (!isValidHistoryRange(minutes)) throw new Error('Invalid history range')
    return getDownsampled(minutes)
  })
}
