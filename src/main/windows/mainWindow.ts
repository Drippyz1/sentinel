import { app, BrowserWindow, nativeImage, nativeTheme } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import icon from '../../../resources/icon.png?asset'
import { configureTrustedWindow, trustedWebPreferences } from '../ipcSecurity'
import { loadSettings } from '../storage/settings'

interface MainWindowOptions {
  isQuitting: () => boolean
  onClosed: (window: BrowserWindow) => void
}

export function createMainWindow({ isQuitting, onClosed }: MainWindowOptions): BrowserWindow {
  const appearance = loadSettings().ui.appearance
  const startup = appearance.startupPage === '/' ? '' : appearance.startupPage
  const theme =
    appearance.theme === 'system'
      ? nativeTheme.shouldUseDarkColors
        ? 'graphite'
        : 'glacier'
      : appearance.theme
  const window = new BrowserWindow({
    width: 900,
    height: 670,
    backgroundColor: {
      graphite: '#171a1c',
      glacier: '#f1f4f4',
      obsidian: '#0a0b0c',
      nordic: '#182025'
    }[theme],
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: trustedWebPreferences()
  })

  window.on('ready-to-show', () => {
    window.show()
    if (process.platform === 'darwin') {
      app.dock?.setIcon(nativeImage.createFromPath(join(__dirname, '../../resources/icon.png')))
    }
  })

  window.on('close', (event) => {
    if (process.platform === 'darwin' && !isQuitting()) {
      event.preventDefault()
      window.hide()
    }
  })

  window.on('closed', () => onClosed(window))
  configureTrustedWindow(window, 'main')

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void window
      .loadURL(process.env['ELECTRON_RENDERER_URL'] + (startup ? `#${startup}` : ''))
      .catch((error) => console.error('Failed to load renderer:', error))
  } else {
    void window
      .loadFile(join(__dirname, '../renderer/index.html'), { hash: startup })
      .catch((error) => console.error('Failed to load renderer:', error))
  }

  return window
}
