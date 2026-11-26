import type { MetricGroupValues } from '../../shared/contracts'
import type { MetricCollectors } from '../MetricPoller'
import { getBatteryMetrics } from './battery'
import { getCpuMetrics, getCpuTemperature } from './cpu'
import { getDiskCapacity, getDiskIo } from './disk'
import { getGpuMetrics } from './gpu'
import { getMemoryMetrics } from './memory'
import { getNetworkMetrics } from './network'
import { getProcessMetrics } from './processes'

export const localCollectors: MetricCollectors<MetricGroupValues> = {
  cpu: getCpuMetrics,
  cpuTemperature: getCpuTemperature,
  memory: getMemoryMetrics,
  diskCapacity: getDiskCapacity,
  diskIo: getDiskIo,
  network: getNetworkMetrics,
  gpu: getGpuMetrics,
  battery: getBatteryMetrics,
  processes: getProcessMetrics
}
