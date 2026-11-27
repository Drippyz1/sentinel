import { useDiskMetrics } from '../../hooks/useMetrics'
import { selectPrimaryDrive } from '../../../../shared/utils/disk'
import { capacityParts } from '../../../../shared/utils/visualization'
import { formatBytes, formatPercent, formatSpeed } from '../../utils/format'
import { LiveThroughput } from '../ui/MiniChart'
import { MetricMessage } from './MetricMessage'
import {
  FractionMeter,
  MetricDetails,
  MetricFacts,
  Reading,
  SpeedPair,
  WidgetFrame
} from './MetricVisuals'
import type { DashboardWidgetProps } from './dashboardDensity'

const partLabels: Record<string, string> = {
  used: 'Used',
  reserved: 'Other capacity',
  purgeable: 'Reclaimable',
  free: 'Free now',
  available: 'Available'
}

export function DiskWidget({
  expanded,
  showChart = true,
  style = 'segments'
}: DashboardWidgetProps) {
  const disk = useDiskMetrics()
  const drive = selectPrimaryDrive(disk?.drives)
  const parts = drive ? capacityParts(drive) : null
  const io = disk?.io
  const haveRates = io?.readBytesPerSec != null || io?.writeBytesPerSec != null
  return (
    <WidgetFrame id="disk" title="Storage" meta={drive?.type ?? 'Disk'}>
      {drive ? (
        <>
          <Reading value={formatBytes(drive.availableBytes)} note="Available" />
          {style === 'segments' && parts && (
            <div
              className="capacity-meter"
              role="img"
              aria-label={parts
                .map((part) => `${partLabels[part.kind]}: ${formatBytes(part.value)}`)
                .join(', ')}
            >
              {parts.map((part) => (
                <i
                  key={part.kind}
                  data-part={part.kind}
                  style={{ flexGrow: part.value / drive.totalBytes }}
                  title={`${partLabels[part.kind]}: ${formatBytes(part.value)}`}
                />
              ))}
            </div>
          )}
          {style === 'bar' && <FractionMeter value={drive.usagePercent} />}
          <p className="instrument-note">
            {formatBytes(drive.usedBytes)} used / {formatBytes(drive.totalBytes)} total
          </p>
          <p className="instrument-note">
            {formatBytes(drive.freeBytes)} free now
            {drive.availableIncludesPurgeable && drive.purgeableBytes !== null
              ? ` · ${formatBytes(drive.purgeableBytes)} estimated reclaimable`
              : ''}
          </p>
        </>
      ) : (
        <MetricMessage group="diskCapacity" name="storage capacity" />
      )}
      {haveRates && (
        <SpeedPair
          items={[
            ['Read', formatSpeed(io?.readBytesPerSec ?? null), '\u2199'],
            ['Write', formatSpeed(io?.writeBytesPerSec ?? null), '\u2197']
          ]}
        />
      )}
      <MetricDetails expanded={expanded} label="Capacity and activity">
        <p className="instrument-note">
          Read and write rates cover monitored devices on this system, not this volume alone.
        </p>
        {drive && (
          <>
            <MetricFacts
              values={[
                ['Mount', drive.mount],
                ['Used', formatPercent(drive.usagePercent, 0)],
                ['Free now', formatBytes(drive.freeBytes)],
                ['Estimated reclaimable', formatBytes(drive.purgeableBytes)]
              ]}
            />
            {drive.availableIncludesPurgeable && (
              <p className="instrument-note">
                Available includes estimated reclaimable space. Free now is immediately free.
              </p>
            )}
            {!drive.availableIncludesPurgeable && drive.type.toLowerCase() === 'apfs' && (
              <p className="instrument-note">Available may exclude purgeable macOS storage.</p>
            )}
          </>
        )}
        {!haveRates && <MetricMessage group="diskIo" name="disk activity" />}
        {showChart && <LiveThroughput down="diskRead" up="diskWrite" formatValue={formatSpeed} />}
      </MetricDetails>
    </WidgetFrame>
  )
}
