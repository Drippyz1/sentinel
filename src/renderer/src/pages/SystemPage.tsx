import { useState, useEffect, useCallback } from 'react'
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
import { useCpuMetrics, useGpuMetrics } from '../hooks/useMetrics'
import { useUiSettingsStore } from '../store/uiSettingsStore'

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

function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-3 mt-6 first:mt-0">
      <h3
        className="text-xs font-semibold uppercase tracking-widest"
        style={{ color: 'var(--text-muted)' }}
      >
        {title}
      </h3>
      <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        {description}
      </p>
    </div>
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.65)' }}
      onClick={() => {
        if (!isExporting) onCancel()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-export-title"
        className="w-full max-w-md rounded-xl p-5 shadow-xl"
        style={{
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border)'
        }}
        onClick={(event) => event.stopPropagation()}
      >
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
            className="min-h-10 rounded-lg px-3.5 py-2 text-xs font-semibold text-white transition-all disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              backgroundColor: 'var(--accent-blue)',
              border: '1px solid var(--accent-blue)'
            }}
          >
            {exportingFormat === 'json' ? 'Exporting...' : 'Export JSON'}
          </button>
        </div>
      </div>
    </div>
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.65)' }}
      onClick={() => {
        if (!isExporting) onCancel()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="diagnostic-bundle-title"
        className="w-full max-w-md rounded-xl p-5 shadow-xl"
        style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
        onClick={(event) => event.stopPropagation()}
      >
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
            className="min-h-10 rounded-lg px-3.5 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              backgroundColor: 'var(--accent-blue)',
              border: '1px solid var(--accent-blue)'
            }}
          >
            {isExporting ? 'Exporting...' : 'Export Bundle'}
          </button>
        </div>
      </div>
    </div>
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

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────

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
        <div className="overflow-auto" style={{ maxHeight: '360px' }}>
          {/* Table header */}
          <div
            className="grid min-w-[560px] gap-4 px-2 pb-2 mb-1 text-xs font-semibold uppercase tracking-wider"
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
              className="grid min-w-[560px] gap-4 px-2 py-2 rounded-lg items-center transition-colors"
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
                  className="min-h-8 text-xs px-2.5 py-1.5 rounded-lg transition-all"
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
  const cpu = useCpuMetrics()
  const gpu = useGpuMetrics()
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null)
  const [thermal, setThermal] = useState<ThermalMetrics | null>(null)
  const [startup, setStartup] = useState<StartupMetrics | null>(null)
  const [loadingStartup, setLoadingStartup] = useState(false)
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
    cpu !== null &&
    cpu.temperature === null &&
    (gpu === null ||
      !gpu.hasGpu ||
      gpu.controllers.every((controller) => controller.temperatureCelsius === null))

  const refreshStartup = useCallback(() => {
    setLoadingStartup(true)
    window.electronAPI
      .getStartupMetrics()
      .then(setStartup)
      .catch((error) => console.error('Failed to load startup items:', error))
      .finally(() => setLoadingStartup(false))
  }, [])

  useEffect(() => {
    const refreshThermal = async () => {
      try {
        const metrics = await window.electronAPI.getThermalMetrics()
        setThermal(metrics)
        setLastRefreshed(new Date())
      } catch (error) {
        console.error('Failed to load thermal metrics:', error)
      }
    }

    // Static machine info — fetch once, it never changes during a session
    void window.electronAPI
      .getSystemInfo()
      .then(setSystemInfo)
      .catch((error) => console.error('Failed to load system information:', error))

    // Thermal — fetch now then poll every 10 seconds
    void refreshThermal()
    const thermalInterval = setInterval(() => void refreshThermal(), 10000)

    // Startup items — heavier scan, fetch separately
    const startupLoad = setTimeout(refreshStartup, 0)

    return () => {
      clearTimeout(startupLoad)
      clearInterval(thermalInterval)
    }
  }, [refreshStartup])

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
    <div>
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

      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            System
          </h2>
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
                className="min-h-10 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50"
                style={{
                  backgroundColor: 'var(--accent-blue)',
                  color: 'white',
                  border: '1px solid var(--accent-blue)'
                }}
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
                className="min-h-10 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50"
                style={{
                  backgroundColor: 'var(--bg-card)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border)'
                }}
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
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {systemInfo ? (
          <Card title="Machine">
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
              label="Total RAM"
              value={formatBytes(systemInfo.totalMemory)}
              accent="purple"
            />
            {view === 'advanced' && (
              <>
                <StatRow
                  label="Cores"
                  value={`${systemInfo.cpuCores} cores / ${systemInfo.cpuThreads} threads`}
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
          <Card title="Hardware">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Loading...
            </p>
          </Card>
        )}
      </div>

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
            Loading thermal data...
          </p>
        </Card>
      )}

      {view === 'advanced' && (
        <>
          <SectionHeading
            title="Startup"
            description="Items configured to launch automatically with your system or user session."
          />
          <StartupCard
            startup={startup}
            loadingStartup={loadingStartup}
            onRefresh={refreshStartup}
          />
        </>
      )}
    </div>
  )
}
