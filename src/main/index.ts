import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { getCpuMetrics } from './collectors/cpu'
import { getMemoryMetrics } from './collectors/memory'
import { getDiskMetrics } from './collectors/disk'
import { getNetworkMetrics } from './collectors/network'
import { getGpuMetrics }     from './collectors/gpu'
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
import { getStartupMetrics } from './collectors/startup'
import { checkForAnomalies, AnomalyReport } from './analysis/anomalyDetector'

function createWindow(): void {
  // Create the browser window.
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

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Refresh system info (mainly for uptime) every 60 seconds
setInterval(invalidateSystemInfoCache, 60000)

  // Initialize database
getDatabase()

// Store latest anomaly report so IPC can serve it on demand
let latestAnomalyReport: AnomalyReport | null = null

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

    recordSnapshot({ cpu, memory, disk, network, gpu, battery })

    // Feed latest values into anomaly detector
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
    console.error('Snapshot recording failed:', err)
  }
}, 2000)

// Clean old data once per hour
cleanOldSnapshots()
setInterval(cleanOldSnapshots, 60 * 60 * 1000)

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  createWindow()

  // Listen for the renderer asking for system data
  // When it asks, we fetch the data and return it
  ipcMain.handle('get-cpu-metrics', async () => {
  return await getCpuMetrics()
})

ipcMain.handle('get-memory-metrics', async () => {
  return await getMemoryMetrics()
})

ipcMain.handle('get-disk-metrics', async () => {
  return await getDiskMetrics()
})

ipcMain.handle('get-network-metrics', async () => {
  return await getNetworkMetrics()
})

ipcMain.handle('get-gpu-metrics', async () => {
  return await getGpuMetrics()
})

ipcMain.handle('get-battery-metrics', async () => {
  return await getBatteryMetrics()
})

ipcMain.handle('get-process-metrics', async () => {
  return await getProcessMetrics()
})

ipcMain.handle('get-history-snapshots', async (_event, minutes: number) => {
  return getSnapshots(minutes)
})

ipcMain.handle('get-history-summary', async (_event, minutes: number) => {
  return getSummary(minutes)
})

ipcMain.handle('get-history-downsampled', async (_event, minutes: number) => {
  return getDownsampled(minutes)
})

ipcMain.handle('get-system-info', async () => {
  return await getSystemInfo()
})

ipcMain.handle('get-thermal-metrics', async () => {
  return await getThermalMetrics()
})

ipcMain.handle('get-startup-metrics', async () => {
  return await getStartupMetrics()
})

ipcMain.handle('get-anomaly-report', () => {
  return latestAnomalyReport
})

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('quit', () => {
  closeDatabase()
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
