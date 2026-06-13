import { BrowserWindow } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

export const TRAY_WIDTH = 300
export const TRAY_HEIGHT = 390
export const TRAY_COMPACT_HEIGHT = 310

export function createTrayWindow(): BrowserWindow {
  const window = new BrowserWindow({
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
