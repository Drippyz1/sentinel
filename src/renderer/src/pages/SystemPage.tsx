import { Modal } from '../components/ui/Modal'
import { useState, useEffect, useCallback } from 'react'
import { scheduleVisibleRefresh } from '../utils/visibleRefresh'
import { useLocation, useNavigate } from 'react-router-dom'
import type {
  StartupMetrics,
  SystemInfo,
  SystemReportFormat,
  ThermalMetrics
} from '../../../shared/contracts'
import { formatBytes, formatTime } from '../utils/format'
import { Card } from '../components/ui/Card'
import { StatRow } from '../components/ui/StatRow'
import { SegmentedControl } from '../components/ui/SegmentedControl'
import { ControlGroup } from '../components/ui/ControlGroup'
import {
  useBatteryMetrics,
  useCpuTemperature,
  useDiskMetrics,
  useGpuMetrics,
  useNetworkMetrics
} from '../hooks/useMetrics'
import { useUiSettingsStore } from '../store/uiSettingsStore'
import { CapabilityPanel } from '../components/widgets/CapabilityPanel'

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

function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="diagnostic-heading">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        {description}
      </p>
    </div>
  )
}

function ResourceInventory() {
  const gpu = useGpuMetrics()
  const drive = useDiskMetrics()?.drives.find(({ isPrimary }) => isPrimary)
  const network = useNetworkMetrics()
  const battery = useBatteryMetrics()
  return (
    <section className="inventory-properties" aria-label="Device resources">
      <dl>
        <dt>Graphics adapters</dt>
        <dd>{gpu?.controllers.map(({ name }) => name).join(', ') || 'Unavailable'}</dd>
        <dt>Primary volume</dt>
        <dd>
          {drive ? `${drive.name} · ${formatBytes(drive.totalBytes)} capacity` : 'Unavailable'}
        </dd>
        <dt>Monitored interface</dt>
        <dd>{network?.monitoredInterface ?? 'Unavailable'}</dd>
        <dt>Battery</dt>
        <dd>
          {!battery
            ? 'Unavailable'
            : battery.hasBattery
              ? battery.isPluggedIn
                ? 'External power connected'
                : 'On battery'
              : 'Not detected'}
        </dd>
      </dl>
    </section>
  )
}

function ReportExportDialog({
  error,
  exportingFormat,
  onCancel,
  onExport
}: {
  error: string | null
  exportingFormat: SystemReportFormat | null
  onCancel: () => void
  onExport: (format: SystemReportFormat) => void
}) {
  const isExporting = exportingFormat !== null

  return (
    <Modal titleId="report-export-title" onClose={onCancel} locked={isExporting}>
      <h2
        id="report-export-title"
        className="text-base font-semibold"
        style={{ color: 'var(--text-primary)' }}
      >
        Export system report?
      </h2>
      <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
        The diagnostic report may include information that identifies your computer or local
        network:
      </p>

      <ul
        className="mt-4 space-y-2 rounded-lg px-4 py-3 text-sm list-disc list-inside"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          color: 'var(--text-primary)'
        }}
      >
        <li>Hostname</li>
        <li>Local IP addresses</li>
        <li>Volume labels</li>
        <li>Startup application names</li>
        <li>Hardware and OS details</li>
      </ul>

      <p className="mt-3 text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        Review the downloaded report before sharing it publicly.
      </p>

      {error && (
        <div
          className="mt-4 rounded-lg px-3 py-2 text-xs"
          style={{
            color: 'var(--accent-red)',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)'
          }}
        >
          {error}
        </div>
      )}

      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          data-initial-focus
          onClick={onCancel}
          disabled={isExporting}
          className="min-h-10 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            color: 'var(--text-secondary)',
            border: '1px solid var(--border)'
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onExport('txt')}
          disabled={isExporting}
          className="min-h-10 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            color: 'var(--text-primary)',
            border: '1px solid var(--border)'
          }}
        >
          {exportingFormat === 'txt' ? 'Exporting...' : 'Export TXT'}
        </button>
        <button
          type="button"
          onClick={() => onExport('json')}
          disabled={isExporting}
          className="min-h-10 rounded-lg px-3.5 py-2 text-xs font-semibold text-[var(--on-accent)] transition-all disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            backgroundColor: 'var(--accent-blue)',
            border: '1px solid var(--accent-blue)'
          }}
        >
          {exportingFormat === 'json' ? 'Exporting...' : 'Export JSON'}
        </button>
      </div>
    </Modal>
  )
}

function DiagnosticBundleDialog({
  error,
  isExporting,
  onCancel,
  onExport
}: {
  error: string | null
  isExporting: boolean
  onCancel: () => void
  onExport: () => void
}) {
  return (
    <Modal titleId="diagnostic-bundle-title" onClose={onCancel} locked={isExporting}>
      <h2
        id="diagnostic-bundle-title"
        className="text-base font-semibold"
        style={{ color: 'var(--text-primary)' }}
      >
        Export diagnostic bundle?
      </h2>
      <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
        This ZIP is designed for troubleshooting and may contain identifying device or network
        details.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div
          className="rounded-lg px-3 py-3 text-xs"
          style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
        >
          <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>
            Included
          </p>
          <ul className="mt-2 space-y-1 list-disc pl-4" style={{ color: 'var(--text-muted)' }}>
            <li>System information</li>
            <li>Alert history</li>
            <li>History metrics</li>
            <li>Settings</li>
          </ul>
        </div>
        <div
          className="rounded-lg px-3 py-3 text-xs"
          style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
        >
          <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>
            Excluded
          </p>
          <ul className="mt-2 space-y-1 list-disc pl-4" style={{ color: 'var(--text-muted)' }}>
            <li>Serial numbers</li>
            <li>Private paths</li>
            <li>Saved appearance profiles</li>
            <li>Credentials</li>
          </ul>
        </div>
      </div>

      <p className="mt-3 text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        Review the bundle contents before attaching it to a public issue.
      </p>

      {error && (
        <div
          className="mt-4 rounded-lg px-3 py-2 text-xs"
          style={{
            color: 'var(--accent-red)',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)'
          }}
        >
          {error}
        </div>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          data-initial-focus
          onClick={onCancel}
          disabled={isExporting}
          className="min-h-10 rounded-lg px-3.5 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onExport}
          disabled={isExporting}
          className="min-h-10 rounded-lg px-3.5 py-2 text-xs font-semibold text-[var(--on-accent)] disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            backgroundColor: 'var(--accent-blue)',
            border: '1px solid var(--accent-blue)'
          }}
        >
          {isExporting ? 'Exporting...' : 'Export Bundle'}
        </button>
      </div>
    </Modal>
  )
}

function downloadExport(content: BlobPart, mimeType: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

function TemperatureUnavailableNote() {
  return (
    <div
      className="mt-3 rounded-lg px-3 py-2.5 text-xs leading-relaxed"
      style={{
        color: 'var(--text-muted)',
        backgroundColor: 'var(--bg-base)',
        border: '1px solid var(--border)'
      }}
    >
      Temperature sensors are not available on this device without elevated permissions. Sentinel
      does not request elevated permissions for safety.
    </div>
  )
}

function ThermalCard({
  thermal,
  advanced,
  temperaturesUnavailable
}: {
  thermal: ThermalMetrics
  advanced: boolean
  temperaturesUnavailable: boolean
}) {
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
              Temperature sensors are not available on this device without elevated permissions.
              Sentinel does not request elevated permissions for safety.
            </p>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <Card title="Thermal Pressure" className="mb-4">
      <div className="flex flex-wrap items-center gap-3 mb-3">
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
        <span className="min-w-0 text-sm" style={{ color: 'var(--text-muted)' }}>
          — {thermal.description}
        </span>
        {advanced && (
          <span className="text-xs font-mono sm:ml-auto" style={{ color: 'var(--text-muted)' }}>
            via {thermal.source}
          </span>
        )}
      </div>

      {advanced && thermal.isThrottling && (
        <div
          className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-3 pt-3"
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

      {temperaturesUnavailable && <TemperatureUnavailableNote />}
    </Card>
  )
}

function StartupCard({
  startup,
  loadingStartup,
  startupError
}: {
  startup: StartupMetrics | null
  loadingStartup: boolean
  startupError: boolean
}) {
  return (
    <Card title="Startup Items" subtitle={startup ? `${startup.items.length} items` : undefined}>
      {loadingStartup && <p role="status">Scanning startup items...</p>}
      {!loadingStartup && startupError && <p role="alert">Startup items could not be read.</p>}
      {startup && (
        <p className="mb-3 text-xs" style={{ color: 'var(--text-muted)' }}>
          {startup.limitation}
        </p>
      )}
      {!loadingStartup && startup && startup.items.length === 0 && <p>No items found.</p>}
      {startup && startup.items.length > 0 && (
        <div className="max-h-[360px] overflow-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr style={{ color: 'var(--text-muted)' }}>
                <th className="px-2 pb-2">Name</th>
                <th className="px-2 pb-2">Type</th>
                <th className="px-2 pb-2">Plist configuration</th>
              </tr>
            </thead>
            <tbody>
              {startup.items.map((item, index) => (
                <tr
                  key={`${item.type}:${item.name}:${index}`}
                  className="hover:bg-[var(--bg-card-hover)]"
                >
                  <td className="break-all px-2 py-2">{item.name}</td>
                  <td className="px-2 py-2">{item.type}</td>
                  <td className="px-2 py-2">
                    {item.configuration === 'disabled'
                      ? 'Disabled'
                      : item.configuration === 'not-disabled'
                        ? 'Not disabled'
                        : 'Unknown'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

export function SystemPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const cpuTemperature = useCpuTemperature()
  const gpu = useGpuMetrics()
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null)
  const [thermal, setThermal] = useState<ThermalMetrics | null>(null)
  const [startup, setStartup] = useState<StartupMetrics | null>(null)
  const [loadingStartup, setLoadingStartup] = useState(false)
  const [startupError, setStartupError] = useState(false)
  const [systemInfoError, setSystemInfoError] = useState(false)
  const [thermalError, setThermalError] = useState(false)
  const view = useUiSettingsStore((state) => state.systemView)
  const setView = useUiSettingsStore((state) => state.setSystemView)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [exportingFormat, setExportingFormat] = useState<SystemReportFormat | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [showBundleDialog, setShowBundleDialog] = useState(false)
  const [isExportingBundle, setIsExportingBundle] = useState(false)
  const [bundleError, setBundleError] = useState<string | null>(null)
  const temperaturesUnavailable =
    cpuTemperature === null &&
    (gpu === null ||
      !gpu.hasGpu ||
      gpu.controllers.every((controller) => controller.temperatureCelsius === null))

  useEffect(() => {
    if (location.state?.command !== 'open-diagnostic-bundle') return
    const openDialog = setTimeout(() => {
      setBundleError(null)
      setShowBundleDialog(true)
      navigate(location.pathname, { replace: true, state: null })
    }, 0)
    return () => clearTimeout(openDialog)
  }, [location.pathname, location.state, navigate])

  const refreshStartup = useCallback(() => {
    setLoadingStartup(true)
    setStartupError(false)
    window.electronAPI
      .getStartupMetrics()
      .then(setStartup)
      .catch(() => setStartupError(true))
      .finally(() => setLoadingStartup(false))
  }, [])

  useEffect(() => {
    let cancelled = false
    const refreshThermal = async () => {
      try {
        const metrics = await window.electronAPI.getThermalMetrics()
        if (cancelled) return
        setThermal(metrics)
        setThermalError(false)
        setLastRefreshed(new Date())
      } catch {
        if (cancelled) return
        setThermal(null)
        setThermalError(true)
      }
    }

    void window.electronAPI
      .getSystemInfo()
      .then((info) => {
        if (!cancelled) setSystemInfo(info)
      })
      .catch(() => {
        if (!cancelled) setSystemInfoError(true)
      })
    const stopRefresh = scheduleVisibleRefresh(document, 10000, refreshThermal)

    return () => {
      cancelled = true
      stopRefresh()
    }
  }, [])

  useEffect(() => {
    if (view !== 'advanced') return
    const startupLoad = setTimeout(refreshStartup, 0)
    return () => clearTimeout(startupLoad)
  }, [view, refreshStartup])

  async function exportReport(format: SystemReportFormat) {
    setExportingFormat(format)
    setExportError(null)
    try {
      const report = await window.electronAPI.exportSystemReport(format)
      downloadExport(report.content, `${report.mimeType};charset=utf-8`, report.filename)
      setShowExportDialog(false)
    } catch (error) {
      console.error('Failed to export system report:', error)
      setExportError('The system report could not be generated. Please try again.')
    } finally {
      setExportingFormat(null)
    }
  }

  async function exportDiagnosticBundle() {
    setIsExportingBundle(true)
    setBundleError(null)
    try {
      const bundle = await window.electronAPI.exportDiagnosticBundle()
      downloadExport(bundle.content, bundle.mimeType, bundle.filename)
      setShowBundleDialog(false)
    } catch (error) {
      console.error('Failed to export diagnostic bundle:', error)
      setBundleError('The diagnostic bundle could not be generated. Please try again.')
    } finally {
      setIsExportingBundle(false)
    }
  }

  return (
    <div className="system-workspace">
      {showExportDialog && (
        <ReportExportDialog
          error={exportError}
          exportingFormat={exportingFormat}
          onCancel={() => {
            setShowExportDialog(false)
            setExportError(null)
          }}
          onExport={(format) => void exportReport(format)}
        />
      )}
      {showBundleDialog && (
        <DiagnosticBundleDialog
          error={bundleError}
          isExporting={isExportingBundle}
          onCancel={() => {
            setShowBundleDialog(false)
            setBundleError(null)
          }}
          onExport={() => void exportDiagnosticBundle()}
        />
      )}

      <div className="workbench-toolbar system-toolbar">
        <div>
          <h2 className="sr-only">System</h2>
          <p className="track-kicker">Device inventory</p>
          {lastRefreshed && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Refreshed {formatTime(lastRefreshed)}
            </p>
          )}
        </div>
        <div className="flex w-full flex-wrap items-start gap-4 sm:w-auto sm:justify-end">
          <ControlGroup label="Actions">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setExportError(null)
                  setShowExportDialog(true)
                }}
                disabled={exportingFormat !== null || isExportingBundle}
                className="control control--accent"
              >
                Export Report
              </button>
              <button
                type="button"
                onClick={() => {
                  setBundleError(null)
                  setShowBundleDialog(true)
                }}
                disabled={exportingFormat !== null || isExportingBundle}
                className="control"
              >
                Diagnostic Bundle
              </button>
            </div>
            <p
              className="mt-1 max-w-56 text-[10px] leading-relaxed"
              style={{ color: 'var(--text-muted)' }}
            >
              Reports may contain identifying system and network details. Review before sharing.
            </p>
          </ControlGroup>
          <ControlGroup label="View">
            <SegmentedControl
              value={view}
              onChange={setView}
              ariaLabel="System detail level"
              options={[
                { label: 'Simple', value: 'simple' },
                { label: 'Advanced', value: 'advanced' }
              ]}
            />
          </ControlGroup>
        </div>
      </div>

      <SectionHeading
        title="Overview"
        description="Core machine identity and current operating system details."
      />
      <div className="system-inventory-grid">
        {systemInfo ? (
          <Card title="Operating system">
            <StatRow label="Model" value={systemInfo.model} accent="blue" />
            <StatRow
              label="OS"
              value={`${systemInfo.distro} ${systemInfo.release}`}
              accent="blue"
            />
            <StatRow label="Uptime" value={formatUptime(systemInfo.uptimeSeconds)} accent="green" />
            {view === 'advanced' && (
              <>
                <StatRow label="Hostname" value={systemInfo.hostname} accent="blue" copyable />
                <StatRow label="Arch" value={systemInfo.arch} accent="blue" />
                <StatRow label="Serial" value={systemInfo.serial} accent="blue" copyable />
              </>
            )}
          </Card>
        ) : (
          <Card title="Operating system">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {systemInfoError ? 'Machine information unavailable.' : 'Loading...'}
            </p>
          </Card>
        )}

        {systemInfo ? (
          <Card title="Processor and physical memory">
            <StatRow label="Processor" value={systemInfo.cpuBrand} accent="blue" />
            <StatRow
              label="Physical memory"
              value={formatBytes(systemInfo.totalMemory)}
              accent="purple"
            />
            {view === 'advanced' && (
              <>
                <StatRow
                  label="Core topology"
                  value={`${systemInfo.cpuCores} physical / ${systemInfo.cpuThreads} logical`}
                  accent="blue"
                />
                <StatRow
                  label="Base Speed"
                  value={`${systemInfo.cpuBaseSpeed} GHz`}
                  accent="blue"
                />
              </>
            )}
          </Card>
        ) : (
          <Card title="Processor and physical memory">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {systemInfoError ? 'Hardware information unavailable.' : 'Loading...'}
            </p>
          </Card>
        )}
      </div>

      <ResourceInventory />
      <CapabilityPanel />

      <SectionHeading
        title="Thermal"
        description="Current thermal pressure and performance limits reported by the system."
      />
      {thermal ? (
        <ThermalCard
          thermal={thermal}
          advanced={view === 'advanced'}
          temperaturesUnavailable={temperaturesUnavailable}
        />
      ) : (
        <Card title="Thermal Pressure" className="mb-4">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {thermalError ? 'Thermal data could not be read.' : 'Loading thermal data...'}
          </p>
        </Card>
      )}

      {view === 'advanced' && (
        <>
          <SectionHeading
            title="Startup"
            description="Third-party launch configuration, not current execution state."
          />
          <StartupCard
            startup={startup}
            loadingStartup={loadingStartup}
            startupError={startupError}
          />
        </>
      )}
    </div>
  )
}
