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
import type { UiSettingsPatch } from '../../shared/contracts'

interface RegisterIpcOptions {
  metricsService: MetricsService
  saveUiSettingsPatch: (patch: UiSettingsPatch) => boolean
  showMainWindow: () => void
  setTrayCompact: (compact: boolean) => void
  showMiniMonitor: () => void
  hideMiniMonitor: () => void
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
  registerShellIpc(options)
}
