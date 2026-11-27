import { existsSync } from 'fs'
import { isAbsolute } from 'node:path'
import { app, BrowserWindow, dialog, shell, type WebContents } from 'electron'
import { assertTrustedIpcSender, handleTrustedIpc, isValidPid } from '../ipcSecurity'
import {
  getProcessDetails,
  getProcessPage,
  verifyProcessIdentity
} from '../../monitoring/collectors/processes'
import type { ProcessIdentity } from '../../shared/contracts'
import { metricsView } from '../../shared/utils/liveMetrics'
import { processBirth } from './processBirth'
import { isProcessPageRequest } from '../../shared/utils/processPage'
import type { MetricsService } from '../services/MetricsService'
import { loadSettings } from '../storage/settings'

const pendingTermination = new WeakSet<WebContents>()

function isValidIdentity(value: unknown): value is ProcessIdentity {
  if (!value || typeof value !== 'object') return false
  const identity = value as Partial<ProcessIdentity>
  return (
    Object.keys(value).every((key) => key === 'pid' || key === 'name' || key === 'started') &&
    isValidPid(identity.pid) &&
    typeof identity.name === 'string' &&
    identity.name.length > 0 &&
    identity.name.length <= 1024 &&
    typeof identity.started === 'string' &&
    identity.started.trim().length > 0 &&
    identity.started.length <= 128
  )
}

export function registerProcessIpc(metrics: MetricsService): void {
  handleTrustedIpc('get-process-page', (event, _role, request: unknown) => {
    const parent = BrowserWindow.fromWebContents(event.sender)
    if (
      !parent?.isVisible() ||
      parent.isMinimized() ||
      metricsView(new URL(event.sender.getURL()).hash, 'main') !== 'processes' ||
      !isProcessPageRequest(request)
    )
      throw new Error('Invalid process page request')
    if (loadSettings().ui.dashboardPollingPaused) return null
    const status = metrics.getLatestSnapshot().statuses.processes
    return status.state === 'ok' && status.sampledAt !== null
      ? getProcessPage(request, status.sampledAt)
      : null
  })
  handleTrustedIpc('get-process-details', (_event, _role, pid: unknown) => {
    if (!isValidPid(pid)) return null
    return getProcessDetails(pid)
  })

  handleTrustedIpc('reveal-process', (_event, _role, pid: unknown) => {
    if (!isValidPid(pid) || process.platform !== 'darwin') return false

    const details = getProcessDetails(pid)
    if (!details?.path || !isAbsolute(details.path) || !existsSync(details.path)) return false
    shell.showItemInFolder(details.path)
    return true
  })

  handleTrustedIpc('kill-process', async (event, _role, identity: unknown) => {
    const inProcesses = () =>
      metricsView(new URL(event.sender.getURL()).hash, 'main') === 'processes'
    if (!isValidIdentity(identity)) return { success: false, error: 'Invalid process identity' }
    const isSentinelProcess = () => app.getAppMetrics().some((entry) => entry.pid === identity.pid)
    if (isSentinelProcess()) {
      return { success: false, error: 'Sentinel processes cannot be terminated here' }
    }
    const parent = BrowserWindow.fromWebContents(event.sender)
    if (!parent?.isVisible() || !inProcesses() || pendingTermination.has(event.sender)) {
      return { success: false, error: 'Open the Processes view to terminate a process' }
    }

    pendingTermination.add(event.sender)
    try {
      const checkNativeBirth = process.platform === 'darwin' || process.platform === 'linux'
      const birth = checkNativeBirth ? await processBirth(identity.pid) : identity.started
      if (!birth || !(await verifyProcessIdentity(identity))) {
        return { success: false, error: 'The selected process has changed or is no longer running' }
      }
      assertTrustedIpcSender(event, 'kill-process')
      if (!parent.isVisible() || parent.isMinimized() || !inProcesses()) {
        return { success: false, error: 'Could not verify the selected process' }
      }
      const confirmation = await dialog.showMessageBox(parent, {
        type: 'warning',
        title: 'Terminate process',
        message: `Terminate ${identity.name} (PID ${identity.pid})?`,
        detail: 'Unsaved work in this process may be lost.',
        buttons: ['Cancel', 'Terminate'],
        cancelId: 0,
        defaultId: 0
      })
      if (confirmation.response === 0) return { success: false, cancelled: true }
      const unchanged = checkNativeBirth
        ? (await processBirth(identity.pid)) === birth
        : await verifyProcessIdentity(identity)
      assertTrustedIpcSender(event, 'kill-process')
      if (
        !unchanged ||
        !parent.isVisible() ||
        parent.isMinimized() ||
        !inProcesses() ||
        isSentinelProcess()
      ) {
        return { success: false, error: 'The selected process has changed or is no longer running' }
      }
      process.kill(identity.pid, 'SIGKILL')
      return { success: true }
    } catch {
      return {
        success: false,
        error: 'The selected process could not be terminated.'
      }
    } finally {
      pendingTermination.delete(event.sender)
    }
  })
}
