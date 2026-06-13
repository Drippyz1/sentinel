import { useState, useEffect } from 'react'
import { SystemInfo } from '../../../main/collectors/systemInfo'
import { ThermalMetrics } from '../../../main/collectors/thermal'
import { StartupMetrics } from '../../../main/collectors/startup'
import { formatBytes } from '../utils/format'
import { Card } from '../components/ui/Card'
import { StatRow } from '../components/ui/StatRow'

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h ${mins}m`
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m`
}

function thermalColor(level: string): string {
  switch (level) {
    case 'nominal':
      return 'var(--accent-green)'
    case 'moderate':
      return 'var(--accent-amber)'
    case 'heavy':
      return 'var(--accent-red)'
    case 'trapping':
      return 'var(--accent-red)'
    default:
      return 'var(--text-muted)'
  }
}

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────

function ThermalCard({ thermal }: { thermal: ThermalMetrics }) {
  if (thermal.requiresSudo) {
    return (
      <Card title="Thermal Pressure" className="mb-4">
        <div className="flex items-start gap-3">
          <div
            className="w-3 h-3 rounded-full shrink-0 mt-1"
            style={{ backgroundColor: 'var(--text-muted)' }}
          />
          <div>
            <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
              Thermal data unavailable
            </p>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              Apple Silicon Macs restrict thermal sensor access on recent versions of macOS. This
              data is only available when running with elevated permissions, which Sentinel avoids
              for security. If your Mac is throttling, you&apos;ll typically notice it through
              reduced CPU performance and fan noise.
            </p>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <Card title="Thermal Pressure" className="mb-4">
      <div className="flex items-center gap-3 mb-3">
        <div
          className="w-3 h-3 rounded-full shrink-0"
          style={{ backgroundColor: thermalColor(thermal.level) }}
        />
        <span
          className="text-sm font-medium capitalize"
          style={{ color: thermalColor(thermal.level) }}
        >
          {thermal.level}
        </span>
        <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
          — {thermal.description}
        </span>
        <span className="text-xs font-mono ml-auto" style={{ color: 'var(--text-muted)' }}>
          via {thermal.source}
        </span>
      </div>

      {thermal.isThrottling && (
        <div
          className="grid grid-cols-3 gap-4 mt-3 pt-3"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          {thermal.cpuSpeedLimit !== null && (
            <div>
              <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                CPU Speed Limit
              </p>
              <p className="text-lg font-bold font-mono" style={{ color: 'var(--accent-amber)' }}>
                {thermal.cpuSpeedLimit}%
              </p>
            </div>
          )}
          {thermal.schedulerLimit !== null && (
            <div>
              <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                Scheduler Limit
              </p>
              <p className="text-lg font-bold font-mono" style={{ color: 'var(--accent-amber)' }}>
                {thermal.schedulerLimit}%
              </p>
            </div>
          )}
          {thermal.diskSpeedLimit !== null && (
            <div>
              <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                Disk Speed Limit
              </p>
              <p className="text-lg font-bold font-mono" style={{ color: 'var(--accent-amber)' }}>
                {thermal.diskSpeedLimit}%
              </p>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

function StartupCard({
  startup,
  loadingStartup,
  onRefresh
}: {
  startup: StartupMetrics | null
  loadingStartup: boolean
  onRefresh: () => void
}) {
  return (
    <Card
      title="Startup Items"
      subtitle={
        startup ? `${startup.enabledCount} enabled of ${startup.totalCount} total` : undefined
      }
    >
      {loadingStartup && (
        <p className="text-sm py-4 text-center" style={{ color: 'var(--text-muted)' }}>
          Scanning startup items...
        </p>
      )}

      {!loadingStartup && startup && startup.items.length === 0 && (
        <p className="text-sm py-4 text-center" style={{ color: 'var(--text-muted)' }}>
          No startup items found
        </p>
      )}

      {startup && startup.items.length > 0 && (
        <div className="overflow-y-auto" style={{ maxHeight: '360px' }}>
          {/* Table header */}
          <div
            className="grid gap-4 px-2 pb-2 mb-1 text-xs font-semibold uppercase tracking-wider"
            style={{
              gridTemplateColumns: '1fr 110px 80px 80px',
              borderBottom: '1px solid var(--border)',
              color: 'var(--text-muted)'
            }}
          >
            <span>Name</span>
            <span>Type</span>
            <span>Status</span>
            <span>Action</span>
          </div>

          {/* Table rows */}
          {startup.items.map((item, i) => (
            <div
              key={i}
              className="grid gap-4 px-2 py-2 rounded-lg items-center"
              style={{ gridTemplateColumns: '1fr 110px 80px 80px' }}
              onMouseEnter={(e) => {
                ;(e.currentTarget as HTMLDivElement).style.backgroundColor = 'var(--bg-card-hover)'
              }}
              onMouseLeave={(e) => {
                ;(e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent'
              }}
            >
              {/* Name + description */}
              <div className="min-w-0">
                <p
                  className="text-sm font-medium truncate"
                  style={{ color: 'var(--text-primary)' }}
                  title={item.name}
                >
                  {item.name}
                </p>
                <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                  {item.description}
                </p>
              </div>

              {/* Type */}
              <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                {item.type}
              </span>

              {/* Status */}
              <span
                className="text-xs font-medium"
                style={{
                  color: item.enabled ? 'var(--accent-green)' : 'var(--text-muted)'
                }}
              >
                {item.enabled ? 'Enabled' : 'Disabled'}
              </span>

              {/* Action button
                  Only shown when all three conditions are met:
                  1. It's a LaunchAgent (not a Daemon or LoginItem)
                  2. It's in the user's own folder (not system-level)
                  3. The plist file passed the editability check */}
              {item.type === 'LaunchAgent' && item.path.includes('/Users/') && item.editable ? (
                <button
                  onClick={async () => {
                    const success = await window.electronAPI.toggleStartupItem(
                      item.path,
                      !item.enabled
                    )
                    if (success) onRefresh()
                  }}
                  className="text-xs px-2 py-1 rounded transition-all"
                  style={{
                    backgroundColor: item.enabled
                      ? 'rgba(239, 68, 68, 0.1)'
                      : 'rgba(34, 197, 94, 0.1)',
                    color: item.enabled ? 'var(--accent-red)' : 'var(--accent-green)',
                    border: `1px solid ${
                      item.enabled ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)'
                    }`,
                    cursor: 'pointer'
                  }}
                >
                  {item.enabled ? 'Disable' : 'Enable'}
                </button>
              ) : (
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {item.type === 'LoginItem' ? 'Login item' : 'System'}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

// ─────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────

export function SystemPage() {
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null)
  const [thermal, setThermal] = useState<ThermalMetrics | null>(null)
  const [startup, setStartup] = useState<StartupMetrics | null>(null)
  const [loadingStartup, setLoadingStartup] = useState(false)

  useEffect(() => {
    // Static machine info — fetch once, it never changes during a session
    window.electronAPI.getSystemInfo().then(setSystemInfo)

    // Thermal — fetch now then poll every 10 seconds
    window.electronAPI.getThermalMetrics().then(setThermal)
    const thermalInterval = setInterval(() => {
      window.electronAPI.getThermalMetrics().then(setThermal)
    }, 10000)

    // Startup items — heavier scan, fetch separately
    refreshStartup()

    return () => clearInterval(thermalInterval)
  }, [])

  function refreshStartup() {
    setLoadingStartup(true)
    window.electronAPI
      .getStartupMetrics()
      .then(setStartup)
      .finally(() => setLoadingStartup(false))
  }

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
        System
      </h2>

      {/* Machine + Hardware side by side */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        {systemInfo ? (
          <Card title="Machine">
            <StatRow label="Model" value={systemInfo.model} accent="blue" />
            <StatRow
              label="OS"
              value={`${systemInfo.distro} ${systemInfo.release}`}
              accent="blue"
            />
            <StatRow label="Hostname" value={systemInfo.hostname} accent="blue" />
            <StatRow label="Arch" value={systemInfo.arch} accent="blue" />
            <StatRow label="Uptime" value={formatUptime(systemInfo.uptimeSeconds)} accent="green" />
            <StatRow label="Serial" value={systemInfo.serial} accent="blue" />
          </Card>
        ) : (
          <Card title="Machine">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Loading...
            </p>
          </Card>
        )}

        {systemInfo ? (
          <Card title="Hardware">
            <StatRow label="CPU" value={systemInfo.cpuBrand} accent="blue" />
            <StatRow
              label="Cores"
              value={`${systemInfo.cpuCores} cores / ${systemInfo.cpuThreads} threads`}
              accent="blue"
            />
            <StatRow label="Base Speed" value={`${systemInfo.cpuBaseSpeed} GHz`} accent="blue" />
            <StatRow
              label="Total RAM"
              value={formatBytes(systemInfo.totalMemory)}
              accent="purple"
            />
          </Card>
        ) : (
          <Card title="Hardware">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Loading...
            </p>
          </Card>
        )}
      </div>

      {/* Thermal pressure — full width */}
      {thermal ? (
        <ThermalCard thermal={thermal} />
      ) : (
        <Card title="Thermal Pressure" className="mb-4">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Loading thermal data...
          </p>
        </Card>
      )}

      {/* Startup items — full width */}
      <StartupCard startup={startup} loadingStartup={loadingStartup} onRefresh={refreshStartup} />
    </div>
  )
}
