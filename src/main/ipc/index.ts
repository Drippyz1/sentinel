import { MetricsService } from '../services/MetricsService'
import { registerAlertIpc } from './alerts'
import { registerHistoryIpc } from './history'
import { registerMetricsIpc } from './metrics'
import { registerMiniMonitorIpc } from './miniMonitor'
import { registerNetworkConnectionsIpc } from './networkConnections'
import { registerProcessIpc } from './processes'
import { registerSettingsIpc } from './settings'
import { registerShellIpc } from './shell'
import { registerSystemIpc } from './system'
import { registerStorageIpc } from './storageExplorer'
import { registerDuplicateIpc } from './duplicates'
import type { DuplicateSessions } from '../duplicates/session'
import type { StorageSessions } from '../storageExplorer/session'
import type { UiSettingsPatch } from '../../shared/contracts'

interface RegisterIpcOptions {
  metricsService: MetricsService
  storageSessions: StorageSessions
  duplicateSessions: DuplicateSessions
  saveUiSettingsPatch: (patch: UiSettingsPatch) => boolean
  showMainWindow: () => void
  setTrayCompact: (compact: boolean) => boolean
  showMiniMonitor: () => boolean
  hideMiniMonitor: () => boolean
  setMiniMonitorAlwaysOnTop: (alwaysOnTop: boolean) => boolean
}

export function registerIpcHandlers(options: RegisterIpcOptions): void {
  registerAlertIpc()
  registerMetricsIpc(options.metricsService)
  registerMiniMonitorIpc(options)
  registerNetworkConnectionsIpc()
  registerHistoryIpc()
  registerSettingsIpc(options)
  registerProcessIpc(options.metricsService)
  registerSystemIpc(options.metricsService)
  registerStorageIpc(options.storageSessions, () => !options.duplicateSessions.active)
  registerDuplicateIpc(options.duplicateSessions, () => !options.storageSessions.active)
  registerShellIpc(options)
}
