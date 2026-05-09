import { useState, useEffect } from 'react'
import { SystemInfo }     from '../../../main/collectors/systemInfo'
import { ThermalMetrics } from '../../../main/collectors/thermal'
import { StartupMetrics } from '../../../main/collectors/startup'
import { formatBytes }    from '../utils/format'
import { Card }           from '../components/ui/Card'
import { StatRow }        from '../components/ui/StatRow'

// Format seconds into days/hours/minutes
function formatUptime(seconds: number): string {
  const days  = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const mins  = Math.floor((seconds % 3600) / 60)
  if (days > 0)  return `${days}d ${hours}h ${mins}m`
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m`
}

// Color for thermal level badge
function thermalColor(level: string): string {
  switch (level) {
    case 'nominal':  return 'var(--accent-green)'
    case 'moderate': return 'var(--accent-amber)'
    case 'heavy':    return 'var(--accent-red)'
    case 'trapping': return 'var(--accent-red)'
    default:         return 'var(--text-muted)'
  }
}

export function SystemPage() {
  const [systemInfo, setSystemInfo]   = useState<SystemInfo | null>(null)
  const [thermal, setThermal]         = useState<ThermalMetrics | null>(null)
  const [startup, setStartup]         = useState<StartupMetrics | null>(null)
  const [loadingStartup, setLoadingStartup] = useState(false)

  useEffect(() => {
    // Load system info and thermal once
    window.electronAPI.getSystemInfo().then(setSystemInfo)
    window.electronAPI.getThermalMetrics().then(setThermal)

    // Refresh thermal every 10 seconds
    const thermalInterval = setInterval(() => {
      window.electronAPI.getThermalMetrics().then(setThermal)
    }, 10000)

    // Startup items are slow to load — fetch separately
    setLoadingStartup(true)
    window.electronAPI.getStartupMetrics()
      .then(setStartup)
      .finally(() => setLoadingStartup(false))

    return () => clearInterval(thermalInterval)
  }, [])

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4"
          style={{ color: 'var(--text-primary)' }}>
        System
      </h2>

      <div className="grid grid-cols-2 gap-4 mb-4">

        {/* Machine info */}
        {systemInfo && (
          <Card title="Machine">
            <StatRow label="Model"      value={systemInfo.model}        accent="blue" />
            <StatRow label="OS"         value={`${systemInfo.distro} ${systemInfo.release}`} accent="blue" />
            <StatRow label="Hostname"   value={systemInfo.hostname}     accent="blue" />
            <StatRow label="Arch"       value={systemInfo.arch}         accent="blue" />
            <StatRow label="Uptime"     value={formatUptime(systemInfo.uptimeSeconds)} accent="green" />
            <StatRow label="Serial"     value={systemInfo.serial}       accent="blue" />
          </Card>
        )}

        {/* CPU + memory summary */}
        {systemInfo && (
          <Card title="Hardware">
            <StatRow label="CPU"         value={systemInfo.cpuBrand}                    accent="blue"   />
            <StatRow label="Cores"       value={`${systemInfo.cpuCores} cores / ${systemInfo.cpuThreads} threads`} accent="blue" />
            <StatRow label="Base Speed"  value={`${systemInfo.cpuBaseSpeed} GHz`}       accent="blue"   />
            <StatRow label="Total RAM"   value={formatBytes(systemInfo.totalMemory)}    accent="purple" />
          </Card>
        )}

      </div>

      {/* Thermal pressure */}
      {thermal && (
        <Card title="Thermal Pressure" className="mb-4">
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: thermalColor(thermal.level) }}
            />
            <span className="text-sm font-medium capitalize"
                  style={{ color: thermalColor(thermal.level) }}>
              {thermal.level}
            </span>
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
              — {thermal.description}
            </span>
          </div>

          {thermal.isThrottling && (
            <div className="grid grid-cols-3 gap-4 mt-3 pt-3"
                 style={{ borderTop: '1px solid var(--border)' }}>
              {thermal.cpuSpeedLimit !== null && (
                <div>
                  <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                    CPU Speed Limit
                  </p>
                  <p className="text-lg font-bold font-mono"
                     style={{ color: 'var(--accent-amber)' }}>
                    {thermal.cpuSpeedLimit}%
                  </p>
                </div>
              )}
              {thermal.schedulerLimit !== null && (
                <div>
                  <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                    Scheduler Limit
                  </p>
                  <p className="text-lg font-bold font-mono"
                     style={{ color: 'var(--accent-amber)' }}>
                    {thermal.schedulerLimit}%
                  </p>
                </div>
              )}
              {thermal.diskSpeedLimit !== null && (
                <div>
                  <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                    Disk Speed Limit
                  </p>
                  <p className="text-lg font-bold font-mono"
                     style={{ color: 'var(--accent-amber)' }}>
                    {thermal.diskSpeedLimit}%
                  </p>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Startup items */}
      <Card
        title="Startup Items"
        subtitle={startup ? `${startup.enabledCount} enabled of ${startup.totalCount} total` : undefined}
      >
        {loadingStartup && (
          <p className="text-sm py-4 text-center" style={{ color: 'var(--text-muted)' }}>
            Scanning startup items...
          </p>
        )}

        {startup && startup.items.length === 0 && (
          <p className="text-sm py-4 text-center" style={{ color: 'var(--text-muted)' }}>
            No startup items found
          </p>
        )}

        {startup && startup.items.length > 0 && (
          <div className="overflow-y-auto" style={{ maxHeight: '320px' }}>
            {/* Header */}
            <div
              className="grid gap-4 px-2 pb-2 mb-1 text-xs font-semibold uppercase tracking-wider"
              style={{
                gridTemplateColumns: '1fr 110px 90px',
                borderBottom: '1px solid var(--border)',
                color: 'var(--text-muted)'
              }}
            >
              <span>Name</span>
              <span>Type</span>
              <span>Status</span>
            </div>

            {startup.items.map((item, i) => (
              <div
                key={i}
                className="grid gap-4 px-2 py-2 rounded-lg items-center"
                style={{ gridTemplateColumns: '1fr 110px 90px' }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLDivElement).style.backgroundColor = 'var(--bg-card-hover)'
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent'
                }}
              >
                <div>
                  <p className="text-sm font-medium truncate"
                     style={{ color: 'var(--text-primary)' }}
                     title={item.name}>
                    {item.name}
                  </p>
                  <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                    {item.description}
                  </p>
                </div>
                <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                  {item.type}
                </span>
                <span
                  className="text-xs font-medium"
                  style={{ color: item.enabled ? 'var(--accent-green)' : 'var(--text-muted)' }}
                >
                  {item.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}