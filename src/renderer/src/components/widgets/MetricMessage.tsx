import type { MetricGroup } from '../../../../shared/contracts'
import { useMetricsStore } from '../../store/metricsStore'

export function MetricMessage({
  group,
  name,
  notDetected
}: {
  group: MetricGroup
  name: string
  notDetected?: string
}) {
  const status = useMetricsStore((state) => state.statuses?.[group])
  const error = useMetricsStore((state) => state.error)
  const message =
    error || status?.state === 'error'
      ? `Could not read ${name}.`
      : !status || status.state === 'pending' || status.reason === 'warming-up'
        ? `Reading ${name}...`
        : status.reason === 'not-detected' && notDetected
          ? notDetected
          : `${name.charAt(0).toUpperCase()}${name.slice(1)} unavailable.`

  return (
    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
      {message}
    </p>
  )
}
