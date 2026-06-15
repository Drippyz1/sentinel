import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import type { MiniMonitorPosition } from '../../shared/contracts'

export const MINI_MONITOR_SIZE = {
  width: 300,
  height: 278
} as const

interface MiniMonitorWindowOptions {
  alwaysOnTop: boolean
  position: MiniMonitorPosition | null
}

function getSafePosition(position: MiniMonitorPosition | null): MiniMonitorPosition {
  const display = position ? screen.getDisplayNearestPoint(position) : screen.getPrimaryDisplay()
  const { workArea } = display
  const margin = 16
  const fallback = {
    x: workArea.x + workArea.width - MINI_MONITOR_SIZE.width - margin,
    y: workArea.y + margin
  }
  const requested = position ?? fallback
  const maximumX = workArea.x + workArea.width - MINI_MONITOR_SIZE.width
  const maximumY = workArea.y + workArea.height - MINI_MONITOR_SIZE.height

  return {
    x: Math.round(Math.min(Math.max(requested.x, workArea.x), Math.max(workArea.x, maximumX))),
    y: Math.round(Math.min(Math.max(requested.y, workArea.y), Math.max(workArea.y, maximumY)))
  }
}

export function createMiniMonitorWindow({
  alwaysOnTop,
  position
}: MiniMonitorWindowOptions): BrowserWindow {
  const safePosition = getSafePosition(position)
  const window = new BrowserWindow({
    ...MINI_MONITOR_SIZE,
    ...safePosition,
    minWidth: MINI_MONITOR_SIZE.width,
    minHeight: MINI_MONITOR_SIZE.height,
    maxWidth: MINI_MONITOR_SIZE.width,
    maxHeight: MINI_MONITOR_SIZE.height,
    show: false,
    frame: false,
    transparent: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    movable: true,
    alwaysOnTop,
    skipTaskbar: true,
    hiddenInMissionControl: true,
    type: process.platform === 'darwin' ? 'panel' : undefined,
    vibrancy: 'under-window',
    visualEffectState: 'active',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  window.setAlwaysOnTop(alwaysOnTop, 'floating')
  window.setFullScreenable(false)
  window.setMaximizable(false)
  if (process.platform === 'darwin') {
    window.setVisibleOnAllWorkspaces(alwaysOnTop, { visibleOnFullScreen: true })
  }

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void window
      .loadURL(process.env['ELECTRON_RENDERER_URL'] + '#mini-monitor')
      .catch((error) => console.error('Failed to load mini monitor:', error))
  } else {
    void window
      .loadFile(join(__dirname, '../renderer/index.html'), { hash: 'mini-monitor' })
      .catch((error) => console.error('Failed to load mini monitor:', error))
  }

  return window
}
