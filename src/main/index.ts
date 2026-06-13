import { app, shell, BrowserWindow, ipcMain, nativeImage, Notification } from 'electron'
import { getCpuMetrics } from './collectors/cpu'
import { getMemoryMetrics } from './collectors/memory'
import { getDiskMetrics } from './collectors/disk'
import { getNetworkMetrics } from './collectors/network'
import { getGpuMetrics } from './collectors/gpu'
import { getBatteryMetrics } from './collectors/battery'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { getProcessMetrics } from './collectors/processes'
import { getDatabase, closeDatabase } from './storage/database'
import { recordSnapshot, cleanOldSnapshots } from './storage/recorder'
import { getSnapshots, getSummary, getDownsampled } from './storage/queries'
import { getSystemInfo, invalidateSystemInfoCache } from './collectors/systemInfo'
import { getThermalMetrics } from './collectors/thermal'
import {
  getStartupMetrics,
  enableStartupItem,
  disableStartupItem,
  isValidStartupPathInput
} from './collectors/startup'
import { checkForAnomalies, AnomalyReport, setThreshold } from './analysis/anomalyDetector'
import { setupTray, destroyTray } from './tray'
import {
  loadSettings,
  saveSettings,
  updateUiSettings,
  UiSettingsPatch,
  SENSITIVITY_THRESHOLD,
  isValidAppSettings,
  isValidUiSettingsPatch
} from './storage/settings'
import {
  assertTrustedIpcSender,
  isSafeExternalUrl,
  isValidHistoryRange,
  isValidPid
} from './ipcSecurity'

const APP_ID = 'io.github.drippyz1.sentinel'
let mainWindow: BrowserWindow | null = null
let isQuitting = false
let shutdownStarted = false
let shutdownComplete = false
let stopBackgroundTasks: () => Promise<void> = async () => {}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow = window

  window.on('ready-to-show', () => {
    window.show()
    if (process.platform === 'darwin') {
      app.dock?.setIcon(nativeImage.createFromPath(join(__dirname, '../../resources/icon.png')))
    }
  })

  window.on('close', (event) => {
    if (process.platform === 'darwin' && !isQuitting) {
      event.preventDefault()
      window.hide()
    }
  })

  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null
  })

  window.webContents.setWindowOpenHandler((details) => {
    if (isSafeExternalUrl(details.url)) {
      void shell.openExternal(details.url)
    }
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void window
      .loadURL(process.env['ELECTRON_RENDERER_URL'])
      .catch((error) => console.error('Failed to load renderer:', error))
  } else {
    void window
      .loadFile(join(__dirname, '../renderer/index.html'))
      .catch((error) => console.error('Failed to load renderer:', error))
  }

  return window
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId(APP_ID)

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // ── Settings ──────────────────────────────
  const currentSettings = loadSettings()
  setThreshold(SENSITIVITY_THRESHOLD[currentSettings.anomalySensitivity])
  if (currentSettings.hideFromDock && process.platform === 'darwin') {
    app.dock?.hide()
  }

  // ── Database ──────────────────────────────
  getDatabase()

  // ── Anomaly report storage ─────────────────
  let latestAnomalyReport: AnomalyReport | null = null

  // Track last notification time so we don't spam —
  // at most one notification per minute per anomaly
  let lastNotificationAt = 0

  // ── Main polling loop ─────────────────────
  // Uses pollIntervalMs from settings, re-reads it
  // on each tick so changes take effect immediately
  let pollingTimer: ReturnType<typeof setTimeout> | null = null
  let activePoll: Promise<void> | null = null
  let pollingGeneration = 0

  async function pollMetrics(): Promise<void> {
    try {
      const [cpu, memory, disk, network, gpu, battery] = await Promise.all([
        getCpuMetrics(),
        getMemoryMetrics(),
        getDiskMetrics(),
        getNetworkMetrics(),
        getGpuMetrics(),
        getBatteryMetrics()
      ])

      recordSnapshot({ cpu, memory, disk, network, gpu, battery })

      latestAnomalyReport = checkForAnomalies({
        cpu: cpu.usagePercent,
        memory: memory.usagePercent,
        diskRead: disk.io.readBytesPerSec,
        diskWrite: disk.io.writeBytesPerSec,
        netDown: network.totalDownloadBytesPerSec,
        netUp: network.totalUploadBytesPerSec,
        gpu: gpu?.controllers[0]?.utilizationPercent ?? null
      })

      const settings = loadSettings()
      if (
        settings.anomalyNotifications &&
        latestAnomalyReport.hasAnomalies &&
        latestAnomalyReport.isWarmedUp &&
        Date.now() - lastNotificationAt > 60_000 &&
        Notification.isSupported()
      ) {
        const top = latestAnomalyReport.anomalies[0]
        new Notification({
          title: 'Sentinel — Anomaly Detected',
          body: top.message,
          silent: false
        }).show()
        lastNotificationAt = Date.now()
      }
    } catch (err) {
      console.error('Main polling loop error:', err)
    }
  }

  function scheduleNextPoll(generation: number): void {
    const delay = loadSettings().pollIntervalMs
    pollingTimer = setTimeout(() => {
      pollingTimer = null
      if (generation !== pollingGeneration || isQuitting) return

      activePoll = pollMetrics().finally(() => {
        activePoll = null
        if (generation === pollingGeneration && !isQuitting) {
          scheduleNextPoll(generation)
        }
      })
    }, delay)
  }

  async function restartPolling(): Promise<void> {
    const generation = ++pollingGeneration
    if (pollingTimer) {
      clearTimeout(pollingTimer)
      pollingTimer = null
    }
    if (activePoll) await activePoll
    if (generation === pollingGeneration && !isQuitting) scheduleNextPoll(generation)
  }

  async function stopPolling(): Promise<void> {
    pollingGeneration += 1
    if (pollingTimer) {
      clearTimeout(pollingTimer)
      pollingTimer = null
    }
    if (activePoll) await activePoll
  }

  void restartPolling()

  // ── Housekeeping intervals ─────────────────
  cleanOldSnapshots(currentSettings.dataRetentionDays)
  const cleanupTimer = setInterval(
    () => {
      try {
        const s = loadSettings()
        cleanOldSnapshots(s.dataRetentionDays)
      } catch (error) {
        console.error('Snapshot cleanup error:', error)
      }
    },
    60 * 60 * 1000
  )

  const systemInfoCacheTimer = setInterval(invalidateSystemInfoCache, 60000)

  stopBackgroundTasks = async () => {
    clearInterval(cleanupTimer)
    clearInterval(systemInfoCacheTimer)
    await stopPolling()
  }

  // ── Windows & tray ────────────────────────
  createWindow()

  function saveUiSettingsPatch(patch: UiSettingsPatch): boolean {
    const saved = updateUiSettings(patch)
    if (!saved) return false

    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send('ui-settings-changed', patch)
    }
    return true
  }

  setupTray(() => mainWindow, saveUiSettingsPatch)

  // ── IPC handlers ──────────────────────────

  ipcMain.handle('toggle-startup-item', async (event, itemPath: unknown, enable: unknown) => {
    assertTrustedIpcSender(event)
    if (!isValidStartupPathInput(itemPath) || typeof enable !== 'boolean') return false
    return enable ? enableStartupItem(itemPath) : disableStartupItem(itemPath)
  })

  ipcMain.handle('get-cpu-metrics', async (event) => {
    assertTrustedIpcSender(event)
    return getCpuMetrics()
  })
  ipcMain.handle('get-memory-metrics', async (event) => {
    assertTrustedIpcSender(event)
    return getMemoryMetrics()
  })
  ipcMain.handle('get-disk-metrics', async (event) => {
    assertTrustedIpcSender(event)
    return getDiskMetrics()
  })
  ipcMain.handle('get-network-metrics', async (event) => {
    assertTrustedIpcSender(event)
    return getNetworkMetrics()
  })
  ipcMain.handle('get-gpu-metrics', async (event) => {
    assertTrustedIpcSender(event)
    return getGpuMetrics()
  })
  ipcMain.handle('get-battery-metrics', async (event) => {
    assertTrustedIpcSender(event)
    return getBatteryMetrics()
  })
  ipcMain.handle('get-process-metrics', async (event) => {
    assertTrustedIpcSender(event)
    return getProcessMetrics()
  })

  ipcMain.handle('get-system-info', async (event) => {
    assertTrustedIpcSender(event)
    return getSystemInfo()
  })
  ipcMain.handle('get-thermal-metrics', async (event) => {
    assertTrustedIpcSender(event)
    return getThermalMetrics()
  })
  ipcMain.handle('get-startup-metrics', async (event) => {
    assertTrustedIpcSender(event)
    return getStartupMetrics()
  })

  ipcMain.handle('get-anomaly-report', (event) => {
    assertTrustedIpcSender(event)
    return latestAnomalyReport
  })

  ipcMain.handle('get-settings', (event) => {
    assertTrustedIpcSender(event)
    return loadSettings()
  })
  ipcMain.handle('save-settings', async (event, newSettings: unknown) => {
    assertTrustedIpcSender(event)
    if (!isValidAppSettings(newSettings)) return false

    const settings = {
      ...newSettings,
      ui: loadSettings().ui
    }
    const saved = saveSettings(settings)
    if (!saved) return false

    setThreshold(SENSITIVITY_THRESHOLD[settings.anomalySensitivity])

    if (process.platform === 'darwin') {
      settings.hideFromDock ? app.dock?.hide() : app.dock?.show()
    }

    // Restart the polling loop if the interval changed
    await restartPolling()
    return true
  })
  ipcMain.handle('save-ui-settings', (event, patch: unknown) => {
    assertTrustedIpcSender(event)
    return isValidUiSettingsPatch(patch) ? saveUiSettingsPatch(patch) : false
  })

  ipcMain.handle('kill-process', (event, pid: unknown) => {
    assertTrustedIpcSender(event)
    if (!isValidPid(pid)) return { success: false, error: 'Invalid process ID' }

    try {
      process.kill(pid, 'SIGKILL')
      return { success: true }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('hide-dock', (event) => {
    assertTrustedIpcSender(event)
    if (process.platform === 'darwin') app.dock?.hide()
  })
  ipcMain.handle('show-dock', (event) => {
    assertTrustedIpcSender(event)
    if (process.platform === 'darwin') app.dock?.show()
  })

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

  app.on('activate', () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      createWindow()
      return
    }

    mainWindow.show()
    mainWindow.focus()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', (event) => {
  isQuitting = true
  if (shutdownComplete) return

  event.preventDefault()
  if (shutdownStarted) return

  shutdownStarted = true
  void stopBackgroundTasks()
    .catch((error) => console.error('Failed to stop background tasks:', error))
    .finally(() => {
      closeDatabase()
      destroyTray()
      shutdownComplete = true
      app.quit()
    })
})

process.on('uncaughtException', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EIO' || err.message?.includes('write EIO')) {
    return
  }
  console.error('Uncaught exception:', err)
})
