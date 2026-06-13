import { app, Tray, BrowserWindow, Menu, nativeImage, ipcMain, screen } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { loadSettings, UiSettingsPatch } from './storage/settings'
import { assertTrustedIpcSender } from './ipcSecurity'

let tray: Tray | null = null
let trayWindow: BrowserWindow | null = null

const TRAY_WIDTH = 300
const TRAY_HEIGHT = 390
const TRAY_COMPACT_HEIGHT = 310

const TRAY_ICON_BASE64 = `iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAABSSURBVDiNY/z48eN/BgYGBgYkwMTAwMDAwIAqzoCmGZ8GJg4GBgYGRnQNjAwMDAwM6BoYcGlgwqWBCV0DI7oGRnQNjFgMYGJgYGBgwGYAABEnBhCIG9GaAAAAAElFTkSuQmCC`

function createTrayIcon(): Electron.NativeImage {
  const icon = nativeImage.createFromPath(join(__dirname, '../../resources/tray-icon.png'))
  if (!icon.isEmpty()) {
    icon.setTemplateImage(true) // macOS handles dark/light mode automatically
    return icon
  }

  return nativeImage.createFromDataURL(`data:image/png;base64,${TRAY_ICON_BASE64}`)
}

function createTrayWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: TRAY_WIDTH,
    height: TRAY_HEIGHT,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    transparent: false,
    vibrancy: 'under-window',
    visualEffectState: 'active',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void win
      .loadURL(process.env['ELECTRON_RENDERER_URL'] + '#tray')
      .catch((error) => console.error('Failed to load tray window:', error))
  } else {
    void win
      .loadFile(join(__dirname, '../renderer/index.html'), { hash: 'tray' })
      .catch((error) => console.error('Failed to load tray window:', error))
  }

  win.on('blur', () => win.hide())

  return win
}

function showMainWindow(getMainWindow: () => BrowserWindow | null): void {
  const mainWindow = getMainWindow()
  if (!mainWindow || mainWindow.isDestroyed()) return

  mainWindow.show()
  mainWindow.focus()
  trayWindow?.hide()
}

function positionTrayWindow(): void {
  if (!tray || !trayWindow) return

  const trayBounds = tray.getBounds()
  const windowBounds = trayWindow.getBounds()
  const display = screen.getDisplayNearestPoint({
    x: Math.round(trayBounds.x + trayBounds.width / 2),
    y: Math.round(trayBounds.y + trayBounds.height / 2)
  })
  const workArea = display.workArea
  const preferredX = Math.round(trayBounds.x + trayBounds.width / 2 - windowBounds.width / 2)
  const belowY = Math.round(trayBounds.y + trayBounds.height + 6)
  const aboveY = Math.round(trayBounds.y - windowBounds.height - 6)
  const x = Math.min(
    Math.max(preferredX, workArea.x + 8),
    workArea.x + workArea.width - windowBounds.width - 8
  )
  const y =
    belowY + windowBounds.height <= workArea.y + workArea.height
      ? belowY
      : Math.max(workArea.y + 8, aboveY)

  trayWindow.setPosition(x, y)
}

export function setupTray(
  getMainWindow: () => BrowserWindow | null,
  saveUiSettings: (patch: UiSettingsPatch) => boolean
) {
  const icon = createTrayIcon()
  tray = new Tray(icon)
  tray.setToolTip('Sentinel')

  trayWindow = createTrayWindow()

  tray.on('click', () => {
    if (!trayWindow) return

    if (trayWindow.isVisible()) {
      trayWindow.hide()
      return
    }

    positionTrayWindow()
    trayWindow.show()
    trayWindow.focus()
  })

  tray.on('right-click', () => {
    const paused = loadSettings().ui.dashboardPollingPaused
    tray?.popUpContextMenu(
      Menu.buildFromTemplate([
        {
          label: 'Open Sentinel',
          click: () => showMainWindow(getMainWindow)
        },
        {
          label: paused ? 'Resume Live Updates' : 'Pause Live Updates',
          click: () => saveUiSettings({ dashboardPollingPaused: !paused })
        },
        { type: 'separator' },
        {
          label: 'Quit Sentinel',
          click: () => app.quit()
        }
      ])
    )
  })

  ipcMain.handle('open-main-window', (event) => {
    assertTrustedIpcSender(event)
    showMainWindow(getMainWindow)
  })

  ipcMain.handle('set-tray-compact', (event, compact: unknown) => {
    assertTrustedIpcSender(event)
    if (typeof compact !== 'boolean') return
    if (!trayWindow || trayWindow.isDestroyed()) return
    trayWindow.setSize(TRAY_WIDTH, compact ? TRAY_COMPACT_HEIGHT : TRAY_HEIGHT, true)
    if (trayWindow.isVisible()) positionTrayWindow()
  })
}

export function destroyTray() {
  tray?.destroy()
  tray = null
  if (trayWindow && !trayWindow.isDestroyed()) trayWindow.destroy()
  trayWindow = null
}
