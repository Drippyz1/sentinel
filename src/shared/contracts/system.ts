export interface SystemInfo {
  platform: string
  distro: string
  release: string
  arch: string
  hostname: string
  cpuBrand: string
  cpuCores: number
  cpuThreads: number
  cpuBaseSpeed: number
  totalMemory: number
  model: string
  manufacturer: string
  serial: string
  uptimeSeconds: number
}

export type ThermalLevel = 'nominal' | 'moderate' | 'heavy' | 'trapping' | 'unknown'

export interface ThermalMetrics {
  level: ThermalLevel
  isThrottling: boolean
  cpuSpeedLimit: number | null
  schedulerLimit: number | null
  diskSpeedLimit: number | null
  description: string
  source: string
  requiresSudo: boolean
}

export interface StartupItem {
  name: string
  type: 'LaunchAgent' | 'LaunchDaemon'
  configuration: 'disabled' | 'not-disabled' | 'unknown'
}

export interface StartupMetrics {
  limitation: string
  items: StartupItem[]
}
