import { app, BrowserWindow } from 'electron'

interface AppLifecycleOptions {
  createMainWindow: () => BrowserWindow
  getMainWindow: () => BrowserWindow | null
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
      const mainWindow = this.options.getMainWindow()
      if (!mainWindow || mainWindow.isDestroyed()) {
        this.options.createMainWindow()
        return
      }

      mainWindow.show()
      mainWindow.focus()
    })

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') app.quit()
    })

    app.on('before-quit', (event) => {
      this.quitting = true
      if (this.shutdownComplete) return

      event.preventDefault()
      if (this.shutdownStarted) return

      this.shutdownStarted = true
      void this.options
        .stopBackgroundTasks()
        .catch((error) => console.error('Failed to stop background tasks:', error))
        .finally(() => {
          this.options.closeResources()
          this.shutdownComplete = true
          app.quit()
        })
    })
  }
}
