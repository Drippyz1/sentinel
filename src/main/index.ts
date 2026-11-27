import { app, BrowserWindow, Notification, powerMonitor } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { setThreshold } from './analysis/anomalyDetector'
import { MetricPoller } from '../monitoring/MetricPoller'
import { localCollectors } from '../monitoring/collectors'
import { clearCpuBaselines } from '../monitoring/collectors/cpu'
import { clearDiskBaselines } from '../monitoring/collectors/disk'
import { clearNetworkBaselines } from '../monitoring/collectors/network'
import { clearProcessInventory } from '../monitoring/collectors/processes'
import { resolveCollectionIntervals } from '../shared/utils/collectionPolicy'
import { registerIpcHandlers } from './ipc'
import { broadcastAlertHistory } from './ipc/alerts'
import { broadcastLiveMetrics, sendLiveMetrics } from './ipc/metrics'
import { beginIpcShutdown, lockDownRendererPermissions } from './ipcSecurity'
import { publishUiSettings } from './ipc/settings'
import { AppLifecycle } from './lifecycle/appLifecycle'
import { MiniMonitorController } from './miniMonitor'
import { MetricsService } from './services/MetricsService'
import { MonitoringAlertService } from './services/MonitoringAlertService'
import { closeDatabase, getDatabase } from './storage/database'
import { cleanOldSnapshots, recordSnapshot } from './storage/recorder'
import { recordAlertHistory } from './storage/alertHistory'
import {
  getUiSettingsSnapshot,
  loadSettings,
  SENSITIVITY_THRESHOLD,
  updateUiSettings
} from './storage/settings'
import { destroyTray, hasTray, setTrayCompact, setupTray } from './tray'
import { createMainWindow } from './windows/mainWindow'
import { StorageSessions } from './storageExplorer/session'
import { DuplicateSessions } from './duplicates/session'
import type { UiSettingsPatch } from '../shared/contracts'

const APP_ID = 'io.github.drippyz1.sentinel'
let mainWindow: BrowserWindow | null = null
let miniMonitor: MiniMonitorController | null = null
let stopBackgroundTasks: () => Promise<void> = async () => {}
let latestMetrics: MetricsService | undefined
const storageSessions = new StorageSessions()
const duplicateSessions = new DuplicateSessions()

function openMainWindow(): BrowserWindow {
  const window = createMainWindow({
    isQuitting: lifecycle.isQuitting,
    onClosed: (closedWindow) => {
      if (mainWindow === closedWindow) mainWindow = null
    }
  })
  mainWindow = window
  return window
}

function showOrCreateMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    openMainWindow()
    return
  }

  mainWindow.show()
  mainWindow.focus()
}

const lifecycle = new AppLifecycle({
  createMainWindow: openMainWindow,
  getMainWindow: () => mainWindow,
  hasTray,
  stopBackgroundTasks: async () => {
    beginIpcShutdown()
    await Promise.all([
      stopBackgroundTasks(),
      storageSessions.shutdown(),
      duplicateSessions.shutdown()
    ])
  },
  closeResources: () => {
    closeDatabase()
    miniMonitor?.destroy()
    miniMonitor = null
    destroyTray()
  }
})

async function startDesktop(): Promise<void> {
  electronApp.setAppUserModelId(APP_ID)
  lockDownRendererPermissions()

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
    const refresh = () => {
      if (!loadSettings().ui.dashboardPollingPaused && latestMetrics) {
        sendLiveMetrics(window, latestMetrics.getLatestSnapshot())
      }
    }
    window.on('show', refresh)
    window.on('restore', refresh)
  })

  const currentSettings = loadSettings()
  setThreshold(SENSITIVITY_THRESHOLD[currentSettings.anomalySensitivity])
  if (currentSettings.hideFromDock && process.platform === 'darwin') {
    app.dock?.hide()
  }

  try {
    getDatabase()
  } catch (error) {
    console.error('Local history unavailable:', error)
  }

  let lastNotificationAt = 0
  const monitoringAlertService = new MonitoringAlertService({
    onTriggered: (alerts) => {
      try {
        broadcastAlertHistory(recordAlertHistory(alerts))
      } catch (error) {
        console.error('Failed to store monitoring alerts:', error)
      }
      if (Notification.isSupported()) {
        new Notification({
          title:
            alerts.length === 1 ? `Sentinel: ${alerts[0].title}` : 'Sentinel: Monitoring Alerts',
          body: alerts.map((alert) => alert.message).join('\n'),
          silent: false
        }).show()
      }
    }
  })
  const poller = new MetricPoller(
    localCollectors,
    resolveCollectionIntervals(
      currentSettings.pollIntervalMs,
      currentSettings.collectionIntervalsMs
    ),
    { onError: (group, error) => console.error(`${group} collection failed:`, error) }
  )
  const metricsService = new MetricsService(poller, {
    intervalMs: Math.min(
      currentSettings.pollIntervalMs,
      ...Object.values(currentSettings.collectionIntervalsMs)
    ),
    shouldBroadcast: () => !loadSettings().ui.dashboardPollingPaused,
    onBroadcast: broadcastLiveMetrics,
    onCollected: (snapshot) => {
      recordSnapshot(snapshot)
      const settings = loadSettings()
      monitoringAlertService.processSnapshot(snapshot, settings.monitoringAlerts)
      if (
        settings.anomalyNotifications &&
        snapshot.anomalyReport.hasAnomalies &&
        snapshot.anomalyReport.isWarmedUp &&
        Date.now() - lastNotificationAt > 60_000 &&
        Notification.isSupported()
      ) {
        const top = snapshot.anomalyReport.anomalies[0]
        new Notification({
          title: 'Sentinel — Anomaly Detected',
          body: top.message,
          silent: false
        }).show()
        lastNotificationAt = Date.now()
      }
    }
  })
  latestMetrics = metricsService
  const onResume = () => {
    clearCpuBaselines()
    clearDiskBaselines()
    clearNetworkBaselines()
    clearProcessInventory()
    poller.invalidate()
  }
  powerMonitor.on('resume', onResume)

  cleanOldSnapshots(currentSettings.dataRetentionDays)
  const cleanupTimer = setInterval(
    () => {
      try {
        cleanOldSnapshots(loadSettings().dataRetentionDays)
      } catch (error) {
        console.error('Snapshot cleanup error:', error)
      }
    },
    60 * 60 * 1000
  )
  stopBackgroundTasks = async () => {
    powerMonitor.removeListener('resume', onResume)
    clearInterval(cleanupTimer)
    await metricsService.stop()
  }

  function saveUiSettingsPatch(patch: UiSettingsPatch): boolean {
    const previous = getUiSettingsSnapshot()
    const saved = updateUiSettings(patch)
    if (!saved) return false

    const current = getUiSettingsSnapshot()
    if (current.revision === previous.revision) return true
    publishUiSettings(current)
    if (patch.miniPresentation) miniMonitor?.applyPresentation(current.ui.miniPresentation)
    if (previous.ui.trayPresentation.compact !== current.ui.trayPresentation.compact) {
      setTrayCompact(current.ui.trayPresentation.compact)
    }
    if (previous.ui.dashboardPollingPaused && !current.ui.dashboardPollingPaused) {
      metricsService.broadcastLatest()
    }
    return true
  }

  miniMonitor = new MiniMonitorController({
    saveUiSettings: saveUiSettingsPatch
  })

  registerIpcHandlers({
    metricsService,
    storageSessions,
    duplicateSessions,
    saveUiSettingsPatch,
    showMainWindow: showOrCreateMainWindow,
    setTrayCompact: (compact) =>
      saveUiSettingsPatch({
        trayPresentation: { ...getUiSettingsSnapshot().ui.trayPresentation, compact }
      }),
    showMiniMonitor: miniMonitor.show,
    hideMiniMonitor: miniMonitor.hide,
    setMiniMonitorAlwaysOnTop: miniMonitor.setAlwaysOnTop
  })
  metricsService.start()
  openMainWindow()
  setupTray(showOrCreateMainWindow, saveUiSettingsPatch, miniMonitor.show)
  miniMonitor.restore()
}

if (app.requestSingleInstanceLock()) {
  lifecycle.register()
  app.on('second-instance', () => {
    if (app.isReady() && !lifecycle.isQuitting()) showOrCreateMainWindow()
  })
  void app
    .whenReady()
    .then(startDesktop)
    .catch((error) => {
      console.error('Sentinel could not start:', error)
      app.quit()
    })
} else {
  app.quit()
}
