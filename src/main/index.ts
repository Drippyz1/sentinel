import { app, BrowserWindow, Notification } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { setThreshold } from './analysis/anomalyDetector'
import { invalidateSystemInfoCache } from './collectors/systemInfo'
import { registerIpcHandlers } from './ipc'
import { AppLifecycle } from './lifecycle/appLifecycle'
import { MetricsService } from './services/MetricsService'
import { closeDatabase, getDatabase } from './storage/database'
import { cleanOldSnapshots, recordSnapshot } from './storage/recorder'
import { loadSettings, SENSITIVITY_THRESHOLD, updateUiSettings } from './storage/settings'
import { destroyTray, setTrayCompact, setupTray, showMainWindow } from './tray'
import { createMainWindow } from './windows/mainWindow'
import type { UiSettingsPatch } from '../shared/contracts'

const APP_ID = 'io.github.drippyz1.sentinel'
let mainWindow: BrowserWindow | null = null
let stopBackgroundTasks: () => Promise<void> = async () => {}

function openMainWindow(): BrowserWindow {
  const window = createMainWindow({
    isQuitting: lifecycle.isQuitting,
    onClosed: (closedWindow) => {
      if (mainWindow === closedWindow) mainWindow = null
    }
  })
  mainWindow = window
  return window
}

const lifecycle = new AppLifecycle({
  createMainWindow: openMainWindow,
  getMainWindow: () => mainWindow,
  stopBackgroundTasks: () => stopBackgroundTasks(),
  closeResources: () => {
    closeDatabase()
    destroyTray()
  }
})
lifecycle.register()

app.whenReady().then(() => {
  electronApp.setAppUserModelId(APP_ID)

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const currentSettings = loadSettings()
  setThreshold(SENSITIVITY_THRESHOLD[currentSettings.anomalySensitivity])
  if (currentSettings.hideFromDock && process.platform === 'darwin') {
    app.dock?.hide()
  }

  getDatabase()

  let lastNotificationAt = 0
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

  cleanOldSnapshots(currentSettings.dataRetentionDays)
  const cleanupTimer = setInterval(
    () => {
      try {
        cleanOldSnapshots(loadSettings().dataRetentionDays)
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

  openMainWindow()
  setupTray(() => mainWindow, saveUiSettingsPatch)
  registerIpcHandlers({
    metricsService,
    saveUiSettingsPatch,
    showMainWindow,
    setTrayCompact
  })
})

process.on('uncaughtException', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EIO' || error.message?.includes('write EIO')) return
  console.error('Uncaught exception:', error)
})
