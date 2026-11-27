import type { ElectronApi } from '../../../shared/contracts/electronApi'

declare global {
  interface Window {
    electronAPI: ElectronApi
  }
}
