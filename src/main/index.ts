import { app, shell, BrowserWindow, ipcMain } from 'electron'
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
import { loadSettings, saveSettings, AppSettings, SENSITIVITY_THRESHOLD } from './settings'

// ─────────────────────────────────────────────
// createWindow now returns the BrowserWindow
// so we can pass it to setupTray below
// ─────────────────────────────────────────────
function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
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

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Return the window so the caller can use it
  return mainWindow
}

// ─────────────────────────────────────────────
// App ready — everything starts here
// ─────────────────────────────────────────────
app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // ── Settings ──────────────────────────────
  // Load persisted user preferences and apply
  // any immediate effects (dock visibility, etc.)
  const currentSettings = loadSettings()
  setThreshold(SENSITIVITY_THRESHOLD[currentSettings.anomalySensitivity])
  if (currentSettings.hideFromDock && process.platform === 'darwin') {
    app.dock?.hide()
  }

  // ── Database ──────────────────────────────
  // Initialize SQLite — creates the file if it
  // doesn't exist yet and runs schema migrations
  getDatabase()

  // ── Anomaly report storage ─────────────────
  // Stored at module level so the IPC handler
  // can always serve the latest report instantly
  // without having to re-run the detector
  let latestAnomalyReport: AnomalyReport | null = null

  // ── Main polling loop (every 2 seconds) ────
  // Fetches all hardware metrics, records them
  // to SQLite, and runs anomaly detection
  setInterval(async () => {
    try {
      const [cpu, memory, disk, network, gpu, battery] = await Promise.all([
        getCpuMetrics(),
        getMemoryMetrics(),
        getDiskMetrics(),
        getNetworkMetrics(),
        getGpuMetrics(),
        getBatteryMetrics(),
      ])

      // Write a row to the database
      recordSnapshot({ cpu, memory, disk, network, gpu, battery })

      // Feed current values into the anomaly detector
      // The detector maintains its own rolling window internally
      latestAnomalyReport = checkForAnomalies({
        cpu:       cpu.usagePercent,
        memory:    memory.usagePercent,
        diskRead:  disk.io.readBytesPerSec,
        diskWrite: disk.io.writeBytesPerSec,
        netDown:   network.totalDownloadBytesPerSec,
        netUp:     network.totalUploadBytesPerSec,
        gpu:       gpu?.controllers[0]?.utilizationPercent ?? null,
      })

    } catch (err) {
      console.error('Main polling loop error:', err)
    }
  }, 2000)

  // ── Housekeeping intervals ─────────────────
  // Delete database rows older than the configured retention period
  cleanOldSnapshots(currentSettings.dataRetentionDays)
  setInterval(() => {
    const s = loadSettings()
    cleanOldSnapshots(s.dataRetentionDays)
  }, 60 * 60 * 1000)

  // Invalidate the system info cache so uptime
  // stays accurate — the cache refills on next request
  setInterval(invalidateSystemInfoCache, 60000)

  // ── Windows ───────────────────────────────
  // createWindow() now returns the BrowserWindow
  // instance so we can hand it to setupTray
  const mainWindow = createWindow()

  // Set up the menubar tray icon and popover window
  // Must be called after createWindow() so we can
  // pass mainWindow in for the "Open →" button
  setupTray(mainWindow)

  // ── IPC handlers ──────────────────────────
  // These respond to requests from the renderer
  // (React UI) via window.electronAPI.*

  // Startup item management
  ipcMain.handle('toggle-startup-item',
  async (_event, itemPath: string, enable: boolean) => {
    if (enable) {
      return enableStartupItem(itemPath)
    } else {
      return disableStartupItem(itemPath)
    }
  }
)

  // Live hardware metrics
  ipcMain.handle('get-cpu-metrics',     async () => await getCpuMetrics())
  ipcMain.handle('get-memory-metrics',  async () => await getMemoryMetrics())
  ipcMain.handle('get-disk-metrics',    async () => await getDiskMetrics())
  ipcMain.handle('get-network-metrics', async () => await getNetworkMetrics())
  ipcMain.handle('get-gpu-metrics',     async () => await getGpuMetrics())
  ipcMain.handle('get-battery-metrics', async () => await getBatteryMetrics())
  ipcMain.handle('get-process-metrics', async () => await getProcessMetrics())

  // Advanced / slower collectors
  ipcMain.handle('get-system-info',     async () => await getSystemInfo())
  ipcMain.handle('get-thermal-metrics', async () => await getThermalMetrics())
  ipcMain.handle('get-startup-metrics', async () => await getStartupMetrics())

  // Anomaly detection — returns latest cached report instantly
  ipcMain.handle('get-anomaly-report', () => latestAnomalyReport)

  // Settings — read and persist user preferences
  ipcMain.handle('get-settings', () => loadSettings())
  ipcMain.handle('save-settings', (_event, newSettings: AppSettings) => {
    saveSettings(newSettings)
    setThreshold(SENSITIVITY_THRESHOLD[newSettings.anomalySensitivity])
    if (process.platform === 'darwin') {
      newSettings.hideFromDock ? app.dock?.hide() : app.dock?.show()
    }
  })

  // Dock visibility — called directly from the toggle for instant feedback
  ipcMain.handle('hide-dock', () => { if (process.platform === 'darwin') app.dock?.hide() })
  ipcMain.handle('show-dock', () => { if (process.platform === 'darwin') app.dock?.show() })

  // Historical database queries
  ipcMain.handle('get-history-snapshots',
    async (_event, minutes: number) => getSnapshots(minutes))
  ipcMain.handle('get-history-summary',
    async (_event, minutes: number) => getSummary(minutes))
  ipcMain.handle('get-history-downsampled',
    async (_event, minutes: number) => getDownsampled(minutes))

  // ── macOS dock behaviour ───────────────────
  // Re-create the main window if the user clicks
  // the dock icon after closing all windows
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// ─────────────────────────────────────────────
// On macOS we intentionally do NOT quit when all
// windows are closed — the app lives in the tray
// ─────────────────────────────────────────────
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// ─────────────────────────────────────────────
// Clean up before the process exits
// ─────────────────────────────────────────────
app.on('quit', () => {
  closeDatabase()
  destroyTray()
})

// Suppress the "write EIO" error that systeminformation throws
// when the app closes and its streams are already torn down.
// This is a known issue with the library during shutdown —
// it's harmless but shows an ugly dialog without this handler.
process.on('uncaughtException', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EIO' || err.message?.includes('write EIO')) {
    // Silently ignore — this is expected during shutdown
    return
  }
  // For any other uncaught exception, log it so we don't hide real bugs
  console.error('Uncaught exception:', err)
})