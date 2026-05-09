import {
  Tray, BrowserWindow, nativeImage, app, ipcMain
} from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

let tray:       Tray          | null = null
let trayWindow: BrowserWindow | null = null

// Simple base64 16x16 black circle icon
// In a real release you'd use a proper .png in your resources folder
const TRAY_ICON_BASE64 = `iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAABSSURBVDiNY/z48eN/BgYGBgYkwMTAwMDAwIAqzoCmGZ8GJg4GBgYGRnQNjAwMDAwM6BoYcGlgwqWBCV0DI7oGRnQNjFgMYGJgYGBgwGYAABEnBhCIG9GaAAAAAElFTkSuQmCC`

function createTrayIcon(): Electron.NativeImage {
  // Try to use the app icon from resources
  try {
    return nativeImage.createFromPath(
      join(__dirname, '../../resources/icon.png')
    ).resize({ width: 16, height: 16 })
  } catch {
    return nativeImage.createFromBase64(TRAY_ICON_BASE64)
  }
}

function createTrayWindow(mainWindow: BrowserWindow): BrowserWindow {
  const win = new BrowserWindow({
    width:           260,
    height:          220,
    show:            false,
    frame:           false,         // no title bar
    resizable:       false,
    movable:         false,
    alwaysOnTop:     true,
    skipTaskbar:     true,          // don't show in dock/taskbar
    transparent:     true,
    vibrancy:        'under-window', // macOS blur effect
    visualEffectState: 'active',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    }
  })

  // Load the same renderer but with #tray hash
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'] + '#tray')
  } else {
    win.loadFile(
      join(__dirname, '../renderer/index.html'),
      { hash: 'tray' }
    )
  }

  // Hide when it loses focus
  win.on('blur', () => {
    win.hide()
  })

  return win
}

export function setupTray(mainWindow: BrowserWindow) {
  const icon = createTrayIcon()
  tray       = new Tray(icon)

  tray.setToolTip('Sentinel')

  trayWindow = createTrayWindow(mainWindow)

  // Toggle the tray window on icon click
  tray.on('click', () => {
    if (!trayWindow) return

    if (trayWindow.isVisible()) {
      trayWindow.hide()
      return
    }

    // Position the window below the tray icon
    const trayBounds   = tray!.getBounds()
    const windowBounds = trayWindow.getBounds()

    const x = Math.round(
      trayBounds.x + trayBounds.width / 2 - windowBounds.width / 2
    )
    const y = Math.round(trayBounds.y + trayBounds.height + 4)

    trayWindow.setPosition(x, y)
    trayWindow.show()
    trayWindow.focus()
  })

  // IPC: open the main window from the tray popover
  ipcMain.handle('open-main-window', () => {
    mainWindow.show()
    mainWindow.focus()
    trayWindow?.hide()
  })
}

export function destroyTray() {
  tray?.destroy()
  tray = null
}