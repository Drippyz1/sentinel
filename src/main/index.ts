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
import { getStartupMetrics, enableStartupItem, disableStartupItem } from './collectors/startup'
import { checkForAnomalies, AnomalyReport, setThreshold } from './analysis/anomalyDetector'
import { setupTray, destroyTray } from './tray'
import {
  loadSettings,
  saveSettings,
  updateUiSettings,
  AppSettings,
  UiSettingsPatch,
  SENSITIVITY_THRESHOLD
} from './storage/settings'

const APP_ID = 'io.github.drippyz1.sentinel'
let mainWindow: BrowserWindow | null = null
let isQuitting = false

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
    shell.openExternal(details.url)
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
  let pollingTimer: ReturnType<typeof setInterval> | null = null

  function startPolling() {
    if (pollingTimer) clearInterval(pollingTimer)
    const settings = loadSettings()

    pollingTimer = setInterval(async () => {
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

        // Fire a system notification for anomalies if enabled
        // Throttled to once per minute to avoid spam
        const s = loadSettings()
        if (
          s.anomalyNotifications &&
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
    }, settings.pollIntervalMs)
  }

  startPolling()

  // ── Housekeeping intervals ─────────────────
  cleanOldSnapshots(currentSettings.dataRetentionDays)
  setInterval(
    () => {
      const s = loadSettings()
      cleanOldSnapshots(s.dataRetentionDays)
    },
    60 * 60 * 1000
  )

  setInterval(invalidateSystemInfoCache, 60000)

  // ── Windows & tray ────────────────────────
  createWindow()
  setupTray(() => mainWindow)

  // ── IPC handlers ──────────────────────────

  ipcMain.handle('toggle-startup-item', async (_event, itemPath: string, enable: boolean) => {
    return enable ? enableStartupItem(itemPath) : disableStartupItem(itemPath)
  })

  ipcMain.handle('get-cpu-metrics', async () => await getCpuMetrics())
  ipcMain.handle('get-memory-metrics', async () => await getMemoryMetrics())
  ipcMain.handle('get-disk-metrics', async () => await getDiskMetrics())
  ipcMain.handle('get-network-metrics', async () => await getNetworkMetrics())
  ipcMain.handle('get-gpu-metrics', async () => await getGpuMetrics())
  ipcMain.handle('get-battery-metrics', async () => await getBatteryMetrics())
  ipcMain.handle('get-process-metrics', async () => await getProcessMetrics())

  ipcMain.handle('get-system-info', async () => await getSystemInfo())
  ipcMain.handle('get-thermal-metrics', async () => await getThermalMetrics())
  ipcMain.handle('get-startup-metrics', async () => await getStartupMetrics())

  ipcMain.handle('get-anomaly-report', () => latestAnomalyReport)

  ipcMain.handle('get-settings', () => loadSettings())
  ipcMain.handle('save-settings', (_event, newSettings: AppSettings) => {
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
    startPolling()
    return true
  })
  ipcMain.handle('save-ui-settings', (_event, patch: UiSettingsPatch) => updateUiSettings(patch))

  ipcMain.handle('kill-process', (_event, pid: number) => {
    try {
      process.kill(pid, 'SIGKILL')
      return { success: true }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('hide-dock', () => {
    if (process.platform === 'darwin') app.dock?.hide()
  })
  ipcMain.handle('show-dock', () => {
    if (process.platform === 'darwin') app.dock?.show()
  })

  ipcMain.handle('get-history-snapshots', async (_event, minutes: number) => getSnapshots(minutes))
  ipcMain.handle('get-history-summary', async (_event, minutes: number) => getSummary(minutes))
  ipcMain.handle('get-history-downsampled', async (_event, minutes: number) =>
    getDownsampled(minutes)
  )

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

app.on('quit', () => {
  closeDatabase()
  destroyTray()
})

app.on('before-quit', () => {
  isQuitting = true
})

process.on('uncaughtException', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EIO' || err.message?.includes('write EIO')) {
    return
  }
  console.error('Uncaught exception:', err)
})
