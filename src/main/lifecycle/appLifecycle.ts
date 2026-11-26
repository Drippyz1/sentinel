import { app, BrowserWindow } from 'electron'

interface AppLifecycleOptions {
  createMainWindow: () => BrowserWindow
  getMainWindow: () => BrowserWindow | null
  hasTray: () => boolean
  stopBackgroundTasks: () => Promise<void>
  closeResources: () => void
}

export class AppLifecycle {
  private quitting = false
  private shutdownStarted = false
  private shutdownComplete = false

  constructor(private readonly options: AppLifecycleOptions) {}

  isQuitting = (): boolean => this.quitting

  register(): void {
    app.on('activate', () => {
      if (this.quitting) return
      const mainWindow = this.options.getMainWindow()
      if (!mainWindow || mainWindow.isDestroyed()) {
        this.options.createMainWindow()
        return
      }

      mainWindow.show()
      mainWindow.focus()
    })

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin' && !this.options.hasTray()) app.quit()
    })

    app.on('before-quit', (event) => {
      this.quitting = true
      if (this.shutdownComplete) return

      event.preventDefault()
      if (this.shutdownStarted) return

      this.shutdownStarted = true
      void this.shutdown()
    })
  }

  private async shutdown(): Promise<void> {
    let deadline: ReturnType<typeof setTimeout> | undefined
    try {
      const timedOut = new Promise<boolean>((resolve) => {
        deadline = setTimeout(() => resolve(true), 3000)
      })
      if (await Promise.race([this.options.stopBackgroundTasks().then(() => false), timedOut])) {
        console.warn('Stopped waiting for unfinished monitoring probes during shutdown')
      }
    } catch (error) {
      console.error('Failed to stop background tasks:', error)
    } finally {
      clearTimeout(deadline)
      try {
        this.options.closeResources()
      } catch (error) {
        console.error('Failed to close desktop resources:', error)
      }
      this.shutdownComplete = true
      app.quit()
    }
  }
}
