import { app, BrowserWindow, nativeImage } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import icon from '../../../resources/icon.png?asset'
import { configureExternalLinkHandling } from '../ipc/shell'

interface MainWindowOptions {
  isQuitting: () => boolean
  onClosed: (window: BrowserWindow) => void
}

export function createMainWindow({ isQuitting, onClosed }: MainWindowOptions): BrowserWindow {
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
  configureExternalLinkHandling(window)

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
