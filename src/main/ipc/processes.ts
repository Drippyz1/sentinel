import { existsSync } from 'fs'
import { ipcMain, shell } from 'electron'
import { assertTrustedIpcSender, isValidPid } from '../ipcSecurity'
import { MetricsService } from '../services/MetricsService'
import { getProcessDetails } from '../collectors/processes'

export function registerProcessIpc(metricsService: MetricsService): void {
  ipcMain.handle('get-process-metrics', async (event) => {
    assertTrustedIpcSender(event)
    return (await metricsService.getLatestSnapshot()).processes
  })

  ipcMain.handle('get-process-details', (event, pid: unknown) => {
    assertTrustedIpcSender(event)
    if (!isValidPid(pid)) return null
    return getProcessDetails(pid)
  })

  ipcMain.handle('reveal-process', (event, pid: unknown) => {
    assertTrustedIpcSender(event)
    if (!isValidPid(pid) || process.platform !== 'darwin') return false

    const details = getProcessDetails(pid)
    if (!details?.path || !existsSync(details.path)) return false
    shell.showItemInFolder(details.path)
    return true
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
