import { ipcMain } from 'electron'
import { assertTrustedIpcSender, isValidPid } from '../ipcSecurity'
import { MetricsService } from '../services/MetricsService'

export function registerProcessIpc(metricsService: MetricsService): void {
  ipcMain.handle('get-process-metrics', async (event) => {
    assertTrustedIpcSender(event)
    return (await metricsService.getLatestSnapshot()).processes
  })

  ipcMain.handle('kill-process', (event, pid: unknown) => {
    assertTrustedIpcSender(event)
    if (!isValidPid(pid)) return { success: false, error: 'Invalid process ID' }

    try {
      process.kill(pid, 'SIGKILL')
      return { success: true }
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  })
}
