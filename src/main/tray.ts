import { Tray, BrowserWindow, nativeImage, ipcMain } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

let tray: Tray | null = null
let trayWindow: BrowserWindow | null = null

const TRAY_ICON_BASE64 = `iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAABSSURBVDiNY/z48eN/BgYGBgYkwMTAwMDAwIAqzoCmGZ8GJg4GBgYGRnQNjAwMDAwM6BoYcGlgwqWBCV0DI7oGRnQNjFgMYGJgYGBgwGYAABEnBhCIG9GaAAAAAElFTkSuQmCC`

function createTrayIcon(): Electron.NativeImage {
  try {
    const icon = nativeImage.createFromPath(join(__dirname, '../../resources/tray-icon.png'))
    icon.setTemplateImage(true) // macOS handles dark/light mode automatically
    return icon
  } catch {
    return nativeImage.createFromDataURL(`data:image/png;base64,${TRAY_ICON_BASE64}`)
  }
}

function createTrayWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 260,
    height: 220,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    transparent: true,
    vibrancy: 'under-window',
    visualEffectState: 'active',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'] + '#tray')
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'tray' })
  }

  win.on('blur', () => win.hide())

  return win
}

export function setupTray(mainWindow: BrowserWindow) {
  const icon = createTrayIcon()
  tray = new Tray(icon)
  tray.setToolTip('Sentinel')

  // Fix: mainWindow param was unused because createTrayWindow didn't
  // need it — removed the param to fix the TS6133 unused variable error
  trayWindow = createTrayWindow()

  tray.on('click', () => {
    if (!trayWindow) return

    if (trayWindow.isVisible()) {
      trayWindow.hide()
      return
    }

    const trayBounds = tray!.getBounds()
    const windowBounds = trayWindow.getBounds()
    const x = Math.round(trayBounds.x + trayBounds.width / 2 - windowBounds.width / 2)
    const y = Math.round(trayBounds.y + trayBounds.height + 4)

    trayWindow.setPosition(x, y)
    trayWindow.show()
    trayWindow.focus()
  })

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
