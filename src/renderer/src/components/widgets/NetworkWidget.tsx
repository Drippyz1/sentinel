import { useNetworkMetrics } from '../../hooks/useMetrics'
import { formatBytes, formatSpeed } from '../../utils/format'
import { StatRow } from '../ui/StatRow'
import { LiveThroughput } from '../ui/MiniChart'
import { MetricMessage } from './MetricMessage'
import { MetricDetails, MetricFacts, SpeedPair, WidgetFrame } from './MetricVisuals'
import type { DashboardWidgetProps } from './dashboardDensity'

export function NetworkWidget({
  expanded,
  showChart = true,
  style = 'activity'
}: DashboardWidgetProps) {
  const network = useNetworkMetrics()
  const interfaces = network?.interfaces ?? []
  return (
    <WidgetFrame
      id="network"
      title="Network"
      meta={
        network?.monitoredInterface ? `Default link · ${network.monitoredInterface}` : 'Throughput'
      }
    >
      {network ? (
        <>
          <SpeedPair
            items={[
              ['Download', formatSpeed(network.totalDownloadBytesPerSec), '\u2193'],
              ['Upload', formatSpeed(network.totalUploadBytesPerSec), '\u2191']
            ]}
          />
          {showChart && style !== 'number' && (
            <LiveThroughput
              down="networkDown"
              up="networkUp"
              formatValue={formatSpeed}
              mode={style === 'activity' ? 'bars' : style === 'area' ? 'area' : 'line'}
            />
          )}
          <MetricDetails expanded={expanded} label="Monitored interface">
            <p className="instrument-note">
              Observed traffic on the default interface, not internet capacity or a sum of all
              adapters.
            </p>
            {interfaces.length ? (
              interfaces.map((iface) => (
                <section key={iface.name} className="interface-detail">
                  <StatRow
                    label={iface.name}
                    value={iface.ipAddress || 'Unavailable'}
                    accent="blue"
                    copyable={Boolean(iface.ipAddress)}
                  />
                  <MetricFacts
                    values={[
                      ['Download', formatSpeed(iface.downloadBytesPerSec)],
                      ['Upload', formatSpeed(iface.uploadBytesPerSec)],
                      ['Received', formatBytes(iface.totalDownloaded)],
                      ['Sent', formatBytes(iface.totalUploaded)]
                    ]}
                  />
                </section>
              ))
            ) : (
              <p className="instrument-note">No monitored interface details available</p>
            )}
          </MetricDetails>
        </>
      ) : (
        <MetricMessage group="network" name="network readings" />
      )}
    </WidgetFrame>
  )
}
