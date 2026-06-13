import { CpuWidget } from '../components/widgets/CpuWidget'
import { MemoryWidget } from '../components/widgets/MemoryWidget'
import { DiskWidget } from '../components/widgets/DiskWidget'
import { NetworkWidget } from '../components/widgets/NetworkWidget'
import { GpuWidget } from '../components/widgets/GpuWidget'
import { BatteryWidget } from '../components/widgets/BatteryWidget'
import { AnomalyPanel } from '../components/widgets/AnomalyPanel'

export function DashboardPage() {
  return (
    <div>
      <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
        Overview
      </h2>

      <div className="grid grid-cols-2 xl:grid-cols-3 gap-4 mb-4">
        <CpuWidget />
        <MemoryWidget />
        <DiskWidget />
        <NetworkWidget />
        <GpuWidget />
        <BatteryWidget />
      </div>

      <AnomalyPanel />
    </div>
  )
}
