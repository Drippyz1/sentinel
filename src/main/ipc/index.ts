import { MetricsService } from '../services/MetricsService'
import { registerAlertIpc } from './alerts'
import { registerHistoryIpc } from './history'
import { registerMetricsIpc } from './metrics'
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
}

export function registerIpcHandlers(options: RegisterIpcOptions): void {
  registerAlertIpc()
  registerMetricsIpc(options.metricsService)
  registerHistoryIpc()
  registerSettingsIpc(options)
  registerProcessIpc(options.metricsService)
  registerSystemIpc(options.metricsService)
  registerShellIpc(options)
}
