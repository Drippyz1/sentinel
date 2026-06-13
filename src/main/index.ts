import { app, shell, BrowserWindow, ipcMain, nativeImage, Notification } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
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
import { setThreshold } from './analysis/anomalyDetector'
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
import { MetricsService } from './services/MetricsService'

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

  // Track last notification time so we don't spam —
  // at most one notification per minute per anomaly
  let lastNotificationAt = 0

  // ── Centralized metrics collection ─────────
  const metricsService = new MetricsService({
    getIntervalMs: () => loadSettings().pollIntervalMs,
    shouldBroadcast: () => !loadSettings().ui.dashboardPollingPaused,
    onCollected: (snapshot) => {
      recordSnapshot(snapshot)
      const settings = loadSettings()
      if (
        settings.anomalyNotifications &&
        snapshot.anomalyReport.hasAnomalies &&
        snapshot.anomalyReport.isWarmedUp &&
        Date.now() - lastNotificationAt > 60_000 &&
        Notification.isSupported()
      ) {
        const top = snapshot.anomalyReport.anomalies[0]
        new Notification({
          title: 'Sentinel — Anomaly Detected',
          body: top.message,
          silent: false
        }).show()
        lastNotificationAt = Date.now()
      }
    }
  })
  metricsService.start()

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
    await metricsService.stop()
  }

  // ── Windows & tray ────────────────────────
  createWindow()

  function saveUiSettingsPatch(patch: UiSettingsPatch): boolean {
    const saved = updateUiSettings(patch)
    if (!saved) return false

    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send('ui-settings-changed', patch)
    }
    if (patch.dashboardPollingPaused === false) {
      metricsService.broadcastLatest(true)
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

  ipcMain.handle('get-latest-metrics', async (event) => {
    assertTrustedIpcSender(event)
    return metricsService.getLatestSnapshot()
  })
  ipcMain.handle('get-cpu-metrics', async (event) => {
    assertTrustedIpcSender(event)
    return (await metricsService.getLatestSnapshot()).cpu
  })
  ipcMain.handle('get-memory-metrics', async (event) => {
    assertTrustedIpcSender(event)
    return (await metricsService.getLatestSnapshot()).memory
  })
  ipcMain.handle('get-disk-metrics', async (event) => {
    assertTrustedIpcSender(event)
    return (await metricsService.getLatestSnapshot()).disk
  })
  ipcMain.handle('get-network-metrics', async (event) => {
    assertTrustedIpcSender(event)
    return (await metricsService.getLatestSnapshot()).network
  })
  ipcMain.handle('get-gpu-metrics', async (event) => {
    assertTrustedIpcSender(event)
    return (await metricsService.getLatestSnapshot()).gpu
  })
  ipcMain.handle('get-battery-metrics', async (event) => {
    assertTrustedIpcSender(event)
    return (await metricsService.getLatestSnapshot()).battery
  })
  ipcMain.handle('get-process-metrics', async (event) => {
    assertTrustedIpcSender(event)
    return (await metricsService.getLatestSnapshot()).processes
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
    return metricsService.getLatestSnapshot().then((snapshot) => snapshot.anomalyReport)
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
    await metricsService.restart()
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
