import { app, Tray, BrowserWindow, Menu, nativeImage, screen } from 'electron'
import { join } from 'path'
import { loadSettings } from './storage/settings'
import type { UiSettingsPatch } from '../shared/contracts'
import {
  createTrayWindow,
  TRAY_COMPACT_HEIGHT,
  TRAY_HEIGHT,
  TRAY_WIDTH
} from './windows/trayWindow'

let tray: Tray | null = null
let trayWindow: BrowserWindow | null = null
let getMainWindow: () => BrowserWindow | null = () => null

const TRAY_ICON_BASE64 = `iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAABSSURBVDiNY/z48eN/BgYGBgYkwMTAwMDAwIAqzoCmGZ8GJg4GBgYGRnQNjAwMDAwM6BoYcGlgwqWBCV0DI7oGRnQNjFgMYGJgYGBgwGYAABEnBhCIG9GaAAAAAElFTkSuQmCC`

function createTrayIcon(): Electron.NativeImage {
  const icon = nativeImage.createFromPath(join(__dirname, '../../resources/tray-icon.png'))
  if (!icon.isEmpty()) {
    icon.setTemplateImage(true) // macOS handles dark/light mode automatically
    return icon
  }

  return nativeImage.createFromDataURL(`data:image/png;base64,${TRAY_ICON_BASE64}`)
}

export function showMainWindow(): void {
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
  mainWindowProvider: () => BrowserWindow | null,
  saveUiSettings: (patch: UiSettingsPatch) => boolean
) {
  getMainWindow = mainWindowProvider
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
          click: showMainWindow
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
}

export function setTrayCompact(compact: boolean): void {
  if (!trayWindow || trayWindow.isDestroyed()) return
  trayWindow.setSize(TRAY_WIDTH, compact ? TRAY_COMPACT_HEIGHT : TRAY_HEIGHT, true)
  if (trayWindow.isVisible()) positionTrayWindow()
}

export function destroyTray() {
  tray?.destroy()
  tray = null
  if (trayWindow && !trayWindow.isDestroyed()) trayWindow.destroy()
  trayWindow = null
  getMainWindow = () => null
}
