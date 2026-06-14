import { useEffect, useState } from 'react'
import type { DashboardWidget, DashboardWidgetVisibility } from '../../../shared/contracts'
import { CpuWidget } from '../components/widgets/CpuWidget'
import { MemoryWidget } from '../components/widgets/MemoryWidget'
import { DiskWidget } from '../components/widgets/DiskWidget'
import { NetworkWidget } from '../components/widgets/NetworkWidget'
import { GpuWidget } from '../components/widgets/GpuWidget'
import { BatteryWidget } from '../components/widgets/BatteryWidget'
import { AnomalyPanel } from '../components/widgets/AnomalyPanel'
import { ControlGroup } from '../components/ui/ControlGroup'
import { ToggleSwitch } from '../components/ui/ToggleSwitch'
import { useMetricsStatus } from '../hooks/useMetrics'
import { DEFAULT_DASHBOARD_WIDGETS, useUiSettingsStore } from '../store/uiSettingsStore'
import { formatTime } from '../utils/format'

const DASHBOARD_WIDGET_OPTIONS: { key: DashboardWidget; label: string; description: string }[] = [
  { key: 'cpu', label: 'CPU', description: 'Processor usage and load' },
  { key: 'memory', label: 'Memory', description: 'Memory usage and pressure' },
  { key: 'gpu', label: 'GPU', description: 'Graphics utilization' },
  { key: 'disk', label: 'Disk', description: 'Storage activity and capacity' },
  { key: 'network', label: 'Network', description: 'Download and upload activity' },
  { key: 'battery', label: 'Battery', description: 'Charge and power status' },
  { key: 'anomalies', label: 'Anomalies', description: 'Unusual metric activity' }
]

function DashboardCustomizationDialog({
  widgets,
  onChange,
  onClose
}: {
  widgets: DashboardWidgetVisibility
  onChange: (widgets: DashboardWidgetVisibility) => void
  onClose: () => void
}) {
  const visibleCount = Object.values(widgets).filter(Boolean).length
  const allVisible = visibleCount === DASHBOARD_WIDGET_OPTIONS.length

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.65)' }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="customize-dashboard-title"
        className="max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded-xl p-5 shadow-xl"
        style={{
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border)'
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id="customize-dashboard-title"
              className="text-base font-semibold"
              style={{ color: 'var(--text-primary)' }}
            >
              Customize Dashboard
            </h2>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              Choose which widgets appear in your overview. Changes are saved automatically.
            </p>
          </div>
          <button
            type="button"
            autoFocus
            aria-label="Close dashboard customization"
            onClick={onClose}
            className="min-h-8 rounded-lg px-2.5 text-sm transition-colors hover:bg-white/5"
            style={{ color: 'var(--text-muted)' }}
          >
            Close
          </button>
        </div>

        <div className="mt-5 space-y-1">
          {DASHBOARD_WIDGET_OPTIONS.map((widget) => (
            <div
              key={widget.key}
              className="flex items-center justify-between gap-4 rounded-lg px-3 py-2.5"
              style={{ backgroundColor: 'var(--bg-base)' }}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  {widget.label}
                </p>
                <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                  {widget.description}
                </p>
              </div>
              <ToggleSwitch
                checked={widgets[widget.key]}
                label={`Show ${widget.label} widget`}
                onChange={(visible) => onChange({ ...widgets, [widget.key]: visible })}
              />
            </div>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={allVisible}
            onClick={() =>
              onChange(
                Object.fromEntries(
                  DASHBOARD_WIDGET_OPTIONS.map((widget) => [widget.key, true])
                ) as DashboardWidgetVisibility
              )
            }
            className="min-h-9 rounded-lg px-3 py-2 text-xs font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-40"
            style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
          >
            Enable All
          </button>
          <button
            type="button"
            disabled={visibleCount === 0}
            onClick={() =>
              onChange(
                Object.fromEntries(
                  DASHBOARD_WIDGET_OPTIONS.map((widget) => [widget.key, false])
                ) as DashboardWidgetVisibility
              )
            }
            className="min-h-9 rounded-lg px-3 py-2 text-xs font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-40"
            style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
          >
            Disable All
          </button>
          <button
            type="button"
            onClick={() => onChange({ ...DEFAULT_DASHBOARD_WIDGETS })}
            className="min-h-9 rounded-lg px-3 py-2 text-xs font-semibold transition-all"
            style={{
              backgroundColor: 'var(--accent-blue)',
              color: 'white',
              border: '1px solid var(--accent-blue)'
            }}
          >
            Reset to Defaults
          </button>
        </div>
      </div>
    </div>
  )
}

export function DashboardPage() {
  const { lastUpdated } = useMetricsStatus()
  const [showCustomization, setShowCustomization] = useState(false)
  const isPollingPaused = useUiSettingsStore((state) => state.dashboardPollingPaused)
  const setPollingPaused = useUiSettingsStore((state) => state.setDashboardPollingPaused)
  const widgets = useUiSettingsStore((state) => state.dashboardWidgets)
  const setDashboardWidgets = useUiSettingsStore((state) => state.setDashboardWidgets)
  const hasVisibleWidgets = Object.values(widgets).some(Boolean)

  return (
    <div>
      {showCustomization && (
        <DashboardCustomizationDialog
          widgets={widgets}
          onChange={setDashboardWidgets}
          onClose={() => setShowCustomization(false)}
        />
      )}

      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            Overview
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {lastUpdated ? `Last updated ${formatTime(lastUpdated)}` : 'Waiting for metrics'}
            {isPollingPaused ? ' · Updates paused' : ''}
          </p>
        </div>
        <ControlGroup label="Dashboard actions" className="w-full sm:w-auto">
          <div className="flex flex-wrap gap-2 sm:justify-end">
            <button
              type="button"
              onClick={() => setPollingPaused(!isPollingPaused)}
              className="min-h-10 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all"
              style={{
                backgroundColor: isPollingPaused
                  ? 'var(--accent-green)'
                  : 'rgba(245, 158, 11, 0.12)',
                color: isPollingPaused ? 'white' : 'var(--accent-amber)',
                border: `1px solid ${
                  isPollingPaused ? 'var(--accent-green)' : 'rgba(245, 158, 11, 0.35)'
                }`
              }}
            >
              {isPollingPaused ? 'Resume live updates' : 'Pause live updates'}
            </button>
            <button
              type="button"
              onClick={() => setShowCustomization(true)}
              className="min-h-10 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all"
              style={{
                backgroundColor: 'var(--bg-card)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)'
              }}
            >
              Customize Dashboard
            </button>
          </div>
        </ControlGroup>
      </div>

      {hasVisibleWidgets ? (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4 mb-4 items-stretch">
            {widgets.cpu && <CpuWidget />}
            {widgets.memory && <MemoryWidget />}
            {widgets.disk && <DiskWidget />}
            {widgets.network && <NetworkWidget />}
            {widgets.gpu && <GpuWidget />}
            {widgets.battery && <BatteryWidget />}
          </div>

          {widgets.anomalies && <AnomalyPanel />}
        </>
      ) : (
        <div
          className="flex min-h-64 items-center justify-center rounded-xl px-6 py-12 text-center"
          style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
        >
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Your dashboard is empty
            </p>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              Restore the default widgets or customize the dashboard to choose what appears here.
            </p>
            <button
              type="button"
              onClick={() => setDashboardWidgets({ ...DEFAULT_DASHBOARD_WIDGETS })}
              className="mt-4 min-h-10 rounded-lg px-4 py-2 text-xs font-semibold text-white transition-all"
              style={{
                backgroundColor: 'var(--accent-blue)',
                border: '1px solid var(--accent-blue)'
              }}
            >
              Restore Defaults
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
