import { BrowserWindow } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

export const TRAY_EXPANDED_SIZE = {
  width: 360,
  height: 480
} as const

export const TRAY_COMPACT_SIZE = {
  width: 320,
  height: 280
} as const

export function setTrayWindowCompact(window: BrowserWindow, compact: boolean): void {
  const size = compact ? TRAY_COMPACT_SIZE : TRAY_EXPANDED_SIZE

  if (compact) {
    window.setMinimumSize(size.width, size.height)
    window.setSize(size.width, size.height, true)
    window.setMaximumSize(size.width, size.height)
  } else {
    window.setMaximumSize(size.width, size.height)
    window.setSize(size.width, size.height, true)
    window.setMinimumSize(size.width, size.height)
  }
}

export function createTrayWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: TRAY_EXPANDED_SIZE.width,
    height: TRAY_EXPANDED_SIZE.height,
    minWidth: TRAY_EXPANDED_SIZE.width,
    minHeight: TRAY_EXPANDED_SIZE.height,
    maxWidth: TRAY_EXPANDED_SIZE.width,
    maxHeight: TRAY_EXPANDED_SIZE.height,
    show: false,
    frame: false,
    fullscreen: false,
    fullscreenable: false,
    maximizable: false,
    minimizable: false,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hiddenInMissionControl: true,
    type: process.platform === 'darwin' ? 'panel' : undefined,
    transparent: false,
    vibrancy: 'under-window',
    visualEffectState: 'active',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  window.setFullScreenable(false)
  window.setMaximizable(false)
  if (process.platform === 'darwin') {
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false })
  }

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void window
      .loadURL(process.env['ELECTRON_RENDERER_URL'] + '#tray')
      .catch((error) => console.error('Failed to load tray window:', error))
  } else {
    void window
      .loadFile(join(__dirname, '../renderer/index.html'), { hash: 'tray' })
      .catch((error) => console.error('Failed to load tray window:', error))
  }

  window.on('blur', () => window.hide())
  return window
}
