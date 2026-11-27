import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import type { MiniMonitorPosition } from '../../shared/contracts'
import type { MiniPresentation } from '../../shared/contracts/personalization'
import { configureTrustedWindow, trustedWebPreferences } from '../ipcSecurity'

const sizes = {
  small: { width: 270, height: 258 },
  standard: { width: 310, height: 305 },
  large: { width: 366, height: 378 }
} as const

interface MiniMonitorWindowOptions {
  alwaysOnTop: boolean
  position: MiniMonitorPosition | null
  presentation: MiniPresentation
}

function getSafePosition(
  position: MiniMonitorPosition | null,
  size: { width: number; height: number }
): MiniMonitorPosition {
  const display = position ? screen.getDisplayNearestPoint(position) : screen.getPrimaryDisplay()
  const { workArea } = display
  const margin = 16
  const fallback = {
    x: workArea.x + workArea.width - size.width - margin,
    y: workArea.y + margin
  }
  const requested = position ?? fallback
  const maximumX = workArea.x + workArea.width - size.width
  const maximumY = workArea.y + workArea.height - size.height

  return {
    x: Math.round(Math.min(Math.max(requested.x, workArea.x), Math.max(workArea.x, maximumX))),
    y: Math.round(Math.min(Math.max(requested.y, workArea.y), Math.max(workArea.y, maximumY)))
  }
}

export function updateMiniPresentation(
  window: BrowserWindow,
  presentation: MiniPresentation
): void {
  const { width, height } = sizes[presentation.size]
  const { x, y, width: oldWidth, height: oldHeight } = window.getBounds()
  if (width !== oldWidth || height !== oldHeight) {
    window.setBounds({ ...getSafePosition({ x, y }, { width, height }), width, height })
  }
  if (process.platform === 'darwin' || process.platform === 'win32') {
    window.setOpacity(presentation.opacity / 100)
  }
}

export function createMiniMonitorWindow({
  alwaysOnTop,
  position,
  presentation
}: MiniMonitorWindowOptions): BrowserWindow {
  const size = sizes[presentation.size]
  const safePosition = getSafePosition(position, size)
  const window = new BrowserWindow({
    ...size,
    ...safePosition,
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
    webPreferences: trustedWebPreferences()
  })
  configureTrustedWindow(window, 'mini')
  updateMiniPresentation(window, presentation)

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
