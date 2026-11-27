import { Notification, type BrowserWindow } from 'electron'
import type { UiSettingsPatch } from '../shared/contracts'
import type { MiniPresentation } from '../shared/contracts/personalization'
import { loadSettings } from './storage/settings'
import { createMiniMonitorWindow, updateMiniPresentation } from './windows/miniMonitorWindow'

interface MiniMonitorControllerOptions {
  saveUiSettings: (patch: UiSettingsPatch) => boolean
}

export class MiniMonitorController {
  private window: BrowserWindow | null = null
  private positionSaveTimer: ReturnType<typeof setTimeout> | null = null
  private disposeTimer: ReturnType<typeof setTimeout> | undefined

  constructor(private readonly options: MiniMonitorControllerOptions) {}

  restore(): void {
    if (loadSettings().ui.miniMonitorVisible) this.show()
  }

  show = (): boolean => {
    if (!this.options.saveUiSettings({ miniMonitorVisible: true })) return false
    clearTimeout(this.disposeTimer)
    const window = this.getOrCreateWindow()
    if (!window.isVisible()) window.showInactive()
    return true
  }

  hide = (): boolean => {
    const window = this.window
    const wasVisible = window && !window.isDestroyed() && window.isVisible()
    if (wasVisible) {
      // Closing this session must never depend on a settings write.
      window.hide()
      clearTimeout(this.disposeTimer)
      this.disposeTimer = setTimeout(() => {
        if (!window.isDestroyed() && !window.isVisible()) window.destroy()
      }, 2000)
    }
    const saved = this.options.saveUiSettings({ miniMonitorVisible: false })
    if (wasVisible && !saved && Notification.isSupported()) {
      try {
        new Notification({
          title: 'Mini Monitor hidden for this session',
          body: 'The startup preference was not saved. After settings are writable, reopen and hide Mini Monitor again.'
        }).show()
      } catch (error) {
        console.error('Could not show Mini Monitor save warning:', error)
      }
    }
    return saved
  }

  setAlwaysOnTop = (alwaysOnTop: boolean): boolean => {
    const window = this.window
    if (!window || window.isDestroyed() || !window.isVisible()) return false
    if (!this.options.saveUiSettings({ miniMonitorAlwaysOnTop: alwaysOnTop })) return false
    window.setAlwaysOnTop(alwaysOnTop, 'floating')
    if (process.platform === 'darwin') {
      window.setVisibleOnAllWorkspaces(alwaysOnTop, { visibleOnFullScreen: true })
    }
    return true
  }

  applyPresentation(presentation: MiniPresentation): void {
    if (this.window && !this.window.isDestroyed()) updateMiniPresentation(this.window, presentation)
  }

  destroy(): void {
    clearTimeout(this.disposeTimer)
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
      position: settings.miniMonitorPosition,
      presentation: settings.miniPresentation
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
