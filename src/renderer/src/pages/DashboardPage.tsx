import { useEffect, useState } from 'react'
import type { ComponentType } from 'react'
import type {
  DashboardDensity,
  DashboardWidget,
  DashboardWidgetVisibility
} from '../../../shared/contracts'
import { DASHBOARD_WIDGET_KEYS } from '../../../shared/contracts'
import { CpuWidget } from '../components/widgets/CpuWidget'
import { MemoryWidget } from '../components/widgets/MemoryWidget'
import { DiskWidget } from '../components/widgets/DiskWidget'
import { NetworkWidget } from '../components/widgets/NetworkWidget'
import { GpuWidget } from '../components/widgets/GpuWidget'
import { BatteryWidget } from '../components/widgets/BatteryWidget'
import { AnomalyPanel } from '../components/widgets/AnomalyPanel'
import { ControlGroup } from '../components/ui/ControlGroup'
import { SegmentedControl } from '../components/ui/SegmentedControl'
import { ToggleSwitch } from '../components/ui/ToggleSwitch'
import type { DashboardWidgetProps } from '../components/widgets/dashboardDensity'
import { useMetricsStatus } from '../hooks/useMetrics'
import {
  DEFAULT_DASHBOARD_WIDGET_ORDER,
  DEFAULT_DASHBOARD_WIDGETS,
  useUiSettingsStore
} from '../store/uiSettingsStore'
import { formatTime } from '../utils/format'

const DASHBOARD_WIDGET_METADATA: Record<DashboardWidget, { label: string; description: string }> = {
  cpu: { label: 'CPU', description: 'Processor usage and load' },
  memory: { label: 'Memory', description: 'Memory usage and pressure' },
  gpu: { label: 'GPU', description: 'Graphics utilization' },
  disk: { label: 'Disk', description: 'Storage activity and capacity' },
  network: { label: 'Network', description: 'Download and upload activity' },
  battery: { label: 'Battery', description: 'Charge and power status' },
  anomalies: { label: 'Anomalies', description: 'Unusual metric activity' }
}

const DASHBOARD_WIDGET_COMPONENTS: Record<DashboardWidget, ComponentType<DashboardWidgetProps>> = {
  cpu: CpuWidget,
  memory: MemoryWidget,
  gpu: GpuWidget,
  disk: DiskWidget,
  network: NetworkWidget,
  battery: BatteryWidget,
  anomalies: AnomalyPanel
}

const DASHBOARD_WIDGET_OPTIONS = DASHBOARD_WIDGET_KEYS.map((key) => ({
  key,
  ...DASHBOARD_WIDGET_METADATA[key]
}))

function DashboardCustomizationDialog({
  widgets,
  order,
  onVisibilityChange,
  onOrderChange,
  onResetEverything,
  onClose
}: {
  widgets: DashboardWidgetVisibility
  order: DashboardWidget[]
  onVisibilityChange: (widgets: DashboardWidgetVisibility) => void
  onOrderChange: (order: DashboardWidget[]) => void
  onResetEverything: () => void
  onClose: () => void
}) {
  const visibleCount = Object.values(widgets).filter(Boolean).length
  const allVisible = visibleCount === DASHBOARD_WIDGET_OPTIONS.length
  const optionsByKey = new Map(DASHBOARD_WIDGET_OPTIONS.map((widget) => [widget.key, widget]))

  function moveWidget(index: number, direction: -1 | 1) {
    const destination = index + direction
    if (destination < 0 || destination >= order.length) return
    const nextOrder = [...order]
    const movedWidget = nextOrder[index]
    nextOrder[index] = nextOrder[destination]
    nextOrder[destination] = movedWidget
    onOrderChange(nextOrder)
  }

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
              Choose which widgets appear and arrange their dashboard order. Changes are saved
              automatically.
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

        <div className="mt-5">
          <p
            className="mb-2 text-xs font-semibold uppercase tracking-wider"
            style={{ color: 'var(--text-muted)' }}
          >
            Widgets and order
          </p>
          <div className="space-y-1">
            {order.map((widgetKey, index) => {
              const widget = optionsByKey.get(widgetKey)
              if (!widget) return null

              return (
                <div
                  key={widget.key}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg px-3 py-2.5"
                  style={{ backgroundColor: 'var(--bg-base)' }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {widget.label}
                    </p>
                    <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                      {widget.description}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => moveWidget(index, -1)}
                      aria-label={`Move ${widget.label} widget up`}
                      className="min-h-8 rounded-lg px-2.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-30"
                      style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      disabled={index === order.length - 1}
                      onClick={() => moveWidget(index, 1)}
                      aria-label={`Move ${widget.label} widget down`}
                      className="min-h-8 rounded-lg px-2.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-30"
                      style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
                    >
                      Down
                    </button>
                    <ToggleSwitch
                      checked={widgets[widget.key]}
                      label={`Show ${widget.label} widget`}
                      onChange={(visible) =>
                        onVisibilityChange({ ...widgets, [widget.key]: visible })
                      }
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <p
              className="mb-2 text-xs font-semibold uppercase tracking-wider"
              style={{ color: 'var(--text-muted)' }}
            >
              Visibility
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={allVisible}
                onClick={() =>
                  onVisibilityChange(
                    Object.fromEntries(
                      DASHBOARD_WIDGET_OPTIONS.map((widget) => [widget.key, true])
                    ) as DashboardWidgetVisibility
                  )
                }
                className="min-h-9 rounded-lg px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40"
                style={{ color: 'var(--text-primary)', border: '1px solid var(--border)' }}
              >
                Enable All Widgets
              </button>
              <button
                type="button"
                disabled={visibleCount === 0}
                onClick={() =>
                  onVisibilityChange(
                    Object.fromEntries(
                      DASHBOARD_WIDGET_OPTIONS.map((widget) => [widget.key, false])
                    ) as DashboardWidgetVisibility
                  )
                }
                className="min-h-9 rounded-lg px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40"
                style={{ color: 'var(--text-primary)', border: '1px solid var(--border)' }}
              >
                Disable All Widgets
              </button>
              <button
                type="button"
                onClick={() => onVisibilityChange({ ...DEFAULT_DASHBOARD_WIDGETS })}
                className="min-h-9 rounded-lg px-3 py-2 text-xs font-semibold"
                style={{ color: 'var(--text-primary)', border: '1px solid var(--border)' }}
              >
                Reset Visibility
              </button>
            </div>
          </div>
          <div>
            <p
              className="mb-2 text-xs font-semibold uppercase tracking-wider"
              style={{ color: 'var(--text-muted)' }}
            >
              Reset
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onOrderChange([...DEFAULT_DASHBOARD_WIDGET_ORDER])}
                className="min-h-9 rounded-lg px-3 py-2 text-xs font-semibold"
                style={{ color: 'var(--text-primary)', border: '1px solid var(--border)' }}
              >
                Reset Order
              </button>
              <button
                type="button"
                onClick={onResetEverything}
                className="min-h-9 rounded-lg px-3 py-2 text-xs font-semibold text-white"
                style={{
                  backgroundColor: 'var(--accent-blue)',
                  border: '1px solid var(--accent-blue)'
                }}
              >
                Reset Everything
              </button>
            </div>
          </div>
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
  const dashboardDensity = useUiSettingsStore((state) => state.dashboardDensity)
  const setDashboardDensity = useUiSettingsStore((state) => state.setDashboardDensity)
  const widgets = useUiSettingsStore((state) => state.dashboardWidgets)
  const widgetOrder = useUiSettingsStore((state) => state.dashboardWidgetOrder)
  const setDashboardWidgets = useUiSettingsStore((state) => state.setDashboardWidgets)
  const setDashboardWidgetOrder = useUiSettingsStore((state) => state.setDashboardWidgetOrder)
  const setDashboardPreferences = useUiSettingsStore((state) => state.setDashboardPreferences)
  const hasVisibleWidgets = Object.values(widgets).some(Boolean)

  return (
    <div>
      {showCustomization && (
        <DashboardCustomizationDialog
          widgets={widgets}
          order={widgetOrder}
          onVisibilityChange={setDashboardWidgets}
          onOrderChange={setDashboardWidgetOrder}
          onResetEverything={() =>
            setDashboardPreferences({ ...DEFAULT_DASHBOARD_WIDGETS }, [
              ...DEFAULT_DASHBOARD_WIDGET_ORDER
            ])
          }
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
        <div className="flex w-full flex-wrap items-end gap-3 sm:w-auto sm:justify-end">
          <ControlGroup label="Density" className="max-w-full">
            <SegmentedControl<DashboardDensity>
              value={dashboardDensity}
              options={[
                { label: 'Compact', value: 'compact' },
                { label: 'Comfortable', value: 'comfortable' },
                { label: 'Detailed', value: 'detailed' }
              ]}
              onChange={setDashboardDensity}
              ariaLabel="Dashboard density"
            />
          </ControlGroup>
          <ControlGroup label="Dashboard actions">
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
      </div>

      {hasVisibleWidgets ? (
        <div
          className={`grid grid-cols-1 gap-4 mb-4 items-stretch ${
            dashboardDensity === 'compact'
              ? 'md:grid-cols-2 xl:grid-cols-3'
              : 'lg:grid-cols-2 2xl:grid-cols-3'
          }`}
        >
          {widgetOrder.map((widget) => {
            if (!widgets[widget]) return null
            const Widget = DASHBOARD_WIDGET_COMPONENTS[widget]

            return (
              <div
                key={widget}
                className={
                  widget === 'anomalies'
                    ? dashboardDensity === 'compact'
                      ? 'md:col-span-2 xl:col-span-3'
                      : 'lg:col-span-2 2xl:col-span-3'
                    : 'contents'
                }
              >
                <Widget density={dashboardDensity} />
              </div>
            )
          })}
        </div>
      ) : (
        <div
          className="flex min-h-64 items-center justify-center rounded-xl px-6 py-12 text-center"
          style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
        >
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              No dashboard widgets are currently visible.
            </p>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              Restore the default layout or enable every widget to rebuild your overview.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setDashboardPreferences({ ...DEFAULT_DASHBOARD_WIDGETS }, [
                    ...DEFAULT_DASHBOARD_WIDGET_ORDER
                  ])
                }
                className="min-h-10 rounded-lg px-4 py-2 text-xs font-semibold text-white"
                style={{
                  backgroundColor: 'var(--accent-blue)',
                  border: '1px solid var(--accent-blue)'
                }}
              >
                Restore Defaults
              </button>
              <button
                type="button"
                onClick={() => setDashboardWidgets({ ...DEFAULT_DASHBOARD_WIDGETS })}
                className="min-h-10 rounded-lg px-4 py-2 text-xs font-semibold"
                style={{ color: 'var(--text-primary)', border: '1px solid var(--border)' }}
              >
                Enable All Widgets
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
