import { METRIC_GROUPS, type MetricGroup } from '../../../../shared/contracts'
import { useMetricsStore } from '../../store/metricsStore'
import { useUiSettingsStore } from '../../store/uiSettingsStore'
import { formatTime } from '../../utils/format'
import { Card } from '../ui/Card'

const names: Record<MetricGroup, string> = {
  cpu: 'Processor',
  cpuTemperature: 'CPU temperature',
  memory: 'Physical memory',
  diskCapacity: 'Volume capacity',
  diskIo: 'Disk activity',
  network: 'Default network link',
  gpu: 'Graphics inventory',
  battery: 'Battery',
  processes: 'Processes'
}

export function CapabilityPanel() {
  const statuses = useMetricsStore((state) => state.statuses)
  const capabilities = useMetricsStore((state) => state.capabilities)
  const paused = useUiSettingsStore((state) => state.dashboardPollingPaused)
  const now = useMetricsStore((state) => state.lastUpdated?.getTime() ?? null)
  return (
    <Card title="Monitoring capability">
      <p className="workspace-meta mb-2">
        {paused
          ? 'Live monitoring display is paused. Last displayed samples are listed.'
          : 'Readings depend on the OS, permissions and hardware. An available inventory does not guarantee access to every sensor.'}
      </p>
      <table className="workspace-table" style={{ minWidth: 0 }}>
        <caption className="sr-only">Collection status and last attempt by metric</caption>
        <thead>
          <tr>
            <th scope="col">Metric</th>
            <th scope="col">Status</th>
            <th scope="col">Last attempt</th>
          </tr>
        </thead>
        <tbody>
          {METRIC_GROUPS.map((group) => {
            const status = statuses?.[group]
            const capability = capabilities?.metrics[group]
            const at = status?.sampledAt ?? null
            const label =
              !status || status.state === 'pending' || status.reason === 'warming-up'
                ? 'Waiting for observation'
                : status.state === 'error'
                  ? status.reason === 'timed-out'
                    ? 'Timed out'
                    : 'Collection failed'
                  : capability === 'not-supported'
                    ? 'Not supported'
                    : capability === 'not-detected'
                      ? 'Not detected'
                      : status.state !== 'ok'
                        ? 'No reading'
                        : paused
                          ? 'Paused'
                          : at !== null && now !== null && Math.abs(now - at) > 45_000
                            ? 'Stale'
                            : 'Available'
            return (
              <tr key={group}>
                <th scope="row">{names[group]}</th>
                <td>{label}</td>
                <td>{at === null ? '—' : formatTime(new Date(at))}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </Card>
  )
}
