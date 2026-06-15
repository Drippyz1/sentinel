import type { BrowserWindow } from 'electron'
import type { UiSettingsPatch } from '../shared/contracts'
import { loadSettings } from './storage/settings'
import { createMiniMonitorWindow } from './windows/miniMonitorWindow'

interface MiniMonitorControllerOptions {
  saveUiSettings: (patch: UiSettingsPatch) => boolean
}

export class MiniMonitorController {
  private window: BrowserWindow | null = null
  private positionSaveTimer: ReturnType<typeof setTimeout> | null = null

  constructor(private readonly options: MiniMonitorControllerOptions) {}

  restore(): void {
    if (loadSettings().ui.miniMonitorVisible) this.show()
  }

  show = (): void => {
    const window = this.getOrCreateWindow()
    if (!window.isVisible()) window.showInactive()
    this.options.saveUiSettings({ miniMonitorVisible: true })
  }

  hide = (): void => {
    if (this.window && !this.window.isDestroyed()) this.window.hide()
    this.options.saveUiSettings({ miniMonitorVisible: false })
  }

  setAlwaysOnTop = (alwaysOnTop: boolean): boolean => {
    const window = this.getOrCreateWindow()
    window.setAlwaysOnTop(alwaysOnTop, 'floating')
    if (process.platform === 'darwin') {
      window.setVisibleOnAllWorkspaces(alwaysOnTop, { visibleOnFullScreen: true })
    }
    return this.options.saveUiSettings({ miniMonitorAlwaysOnTop: alwaysOnTop })
  }

  destroy(): void {
    if (this.positionSaveTimer) clearTimeout(this.positionSaveTimer)
    this.positionSaveTimer = null
    if (this.window && !this.window.isDestroyed()) this.window.destroy()
    this.window = null
  }

  private getOrCreateWindow(): BrowserWindow {
    if (this.window && !this.window.isDestroyed()) return this.window

    const settings = loadSettings().ui
    const window = createMiniMonitorWindow({
      alwaysOnTop: settings.miniMonitorAlwaysOnTop,
      position: settings.miniMonitorPosition
    })
    this.window = window

    window.on('move', () => this.schedulePositionSave(window))
    window.on('close', (event) => {
      event.preventDefault()
      this.hide()
    })
    window.on('closed', () => {
      if (this.window === window) this.window = null
    })

    return window
  }

  private schedulePositionSave(window: BrowserWindow): void {
    if (this.positionSaveTimer) clearTimeout(this.positionSaveTimer)
    this.positionSaveTimer = setTimeout(() => {
      this.positionSaveTimer = null
      if (window.isDestroyed()) return
      const [x, y] = window.getPosition()
      this.options.saveUiSettings({ miniMonitorPosition: { x, y } })
    }, 250)
  }
}
