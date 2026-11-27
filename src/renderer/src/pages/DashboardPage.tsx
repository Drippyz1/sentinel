import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType
} from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { DEFAULT_UI_SETTINGS, type DashboardWidget } from '../../../shared/contracts'
import {
  PRESETS,
  WIDGET_HEIGHTS,
  WIDGET_STYLES,
  WIDGET_WIDTHS,
  type AppearanceProfile,
  type WidgetPresentation
} from '../../../shared/contracts/personalization'
import {
  dashboardPreset,
  moveWidget,
  sameDashboard,
  widgetPresentation
} from '../../../shared/utils/dashboardLayout'
import { CpuWidget } from '../components/widgets/CpuWidget'
import { MemoryWidget } from '../components/widgets/MemoryWidget'
import { DiskWidget } from '../components/widgets/DiskWidget'
import { NetworkWidget } from '../components/widgets/NetworkWidget'
import { GpuWidget } from '../components/widgets/GpuWidget'
import { BatteryWidget } from '../components/widgets/BatteryWidget'
import { AnomalyPanel } from '../components/widgets/AnomalyPanel'
import type { DashboardWidgetProps } from '../components/widgets/dashboardDensity'
import { showMiniMonitorWithFeedback, useUiSettingsStore } from '../store/uiSettingsStore'
import { TopProcessList } from '../components/widgets/TopProcessList'
import { LiveTraceWindow } from '../components/ui/liveTraceWindow'

type Dashboard = AppearanceProfile['dashboard']
const widgets: Record<
  DashboardWidget,
  { label: string; Component: ComponentType<DashboardWidgetProps> }
> = {
  cpu: { label: 'CPU', Component: memo(CpuWidget) },
  memory: { label: 'Memory', Component: memo(MemoryWidget) },
  gpu: { label: 'GPU', Component: memo(GpuWidget) },
  disk: { label: 'Storage', Component: memo(DiskWidget) },
  network: { label: 'Network', Component: memo(NetworkWidget) },
  battery: { label: 'Battery', Component: memo(BatteryWidget) },
  anomalies: { label: 'Anomalies', Component: memo(AnomalyPanel) }
}

function useDashboard(): Dashboard {
  const dashboardLayout = useUiSettingsStore((state) => state.dashboardLayout)
  const dashboardWidgets = useUiSettingsStore((state) => state.dashboardWidgets)
  const dashboardWidgetOrder = useUiSettingsStore((state) => state.dashboardWidgetOrder)
  const dashboardDensity = useUiSettingsStore((state) => state.dashboardDensity)
  return { dashboardLayout, dashboardWidgets, dashboardWidgetOrder, dashboardDensity }
}

function Widget({ id, dashboard }: { id: DashboardWidget; dashboard: Dashboard }) {
  const { Component } = widgets[id]
  const options = widgetPresentation(
    dashboard.dashboardLayout,
    id,
    dashboard.dashboardDensity === 'detailed'
  )
  return (
    <Component
      density={dashboard.dashboardDensity}
      expanded={options.height === 'expanded'}
      showChart={!dashboard.dashboardLayout.noChart.includes(id)}
      style={options.style}
    />
  )
}

function WidthControls({
  id,
  options,
  change
}: {
  id: DashboardWidget
  options: WidgetPresentation
  change: (next: WidgetPresentation) => void
}) {
  const label = widgets[id].label
  return (
    <div className="widget-editor-options">
      <label>
        Width{' '}
        <select
          className="control"
          aria-label={`${label} width`}
          value={options.width}
          onChange={(event) => {
            const width = WIDGET_WIDTHS.find((value) => value === event.currentTarget.value)
            if (width) change({ ...options, width })
          }}
        >
          {WIDGET_WIDTHS.map((width) => (
            <option key={width}>{width}</option>
          ))}
        </select>
      </label>
      <label>
        Height{' '}
        <select
          className="control"
          aria-label={`${label} height`}
          value={options.height}
          onChange={(event) => {
            const height = WIDGET_HEIGHTS.find((value) => value === event.currentTarget.value)
            if (height) change({ ...options, height })
          }}
        >
          {WIDGET_HEIGHTS.map((height) => (
            <option key={height}>{height}</option>
          ))}
        </select>
      </label>
      {id !== 'anomalies' && (
        <label>
          Style{' '}
          <select
            className="control"
            aria-label={`${label} visualization`}
            value={options.style}
            onChange={(event) => {
              const style = WIDGET_STYLES[id].find((value) => value === event.currentTarget.value)
              if (style) change({ ...options, style })
            }}
          >
            {WIDGET_STYLES[id].map((style) => (
              <option key={style}>{style}</option>
            ))}
          </select>
        </label>
      )}
    </div>
  )
}

function PresetChooser({
  active,
  onChoose
}: {
  active: Dashboard['dashboardLayout']['preset']
  onChoose: (preset: Dashboard['dashboardLayout']['preset']) => void
}) {
  return (
    <div className="layout-presets" role="group" aria-label="Dashboard preset">
      {PRESETS.map((preset) => (
        <button
          key={preset}
          className="control preset-choice"
          aria-pressed={active === preset}
          onClick={() => onChoose(preset)}
        >
          <span className="preset-preview" data-preset={preset} aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
          <span>{preset}</span>
        </button>
      ))}
    </div>
  )
}

function LayoutEditor({ committed, close }: { committed: Dashboard; close: () => void }) {
  const [draft, setDraft] = useState(committed)
  const [requested, setRequested] = useState(false)
  const [message, setMessage] = useState('')
  const [target, setTarget] = useState<DashboardWidget | null>(null)
  const drag = useRef<DashboardWidget | null>(null)
  const title = useRef<HTMLHeadingElement>(null)
  const moveButton = useRef<HTMLButtonElement | null>(null)
  const saveState = useUiSettingsStore((state) => state.saveState)
  const readOnly = useUiSettingsStore((state) =>
    Boolean(state.persistenceIssue || state.loadFailed)
  )
  const save = useUiSettingsStore((state) => state.savePreferences)
  const { dashboardLayout: layout, dashboardWidgetOrder: order, dashboardWidgets: visible } = draft
  const draftOrder = order.filter((id) => visible[id])
  const matches = sameDashboard(draft, committed)

  useEffect(() => {
    title.current?.focus()
  }, [])

  useLayoutEffect(() => {
    moveButton.current?.focus()
    moveButton.current = null
  }, [order])

  useEffect(() => {
    if (requested && !saveState.saving && matches) close()
  }, [close, matches, requested, saveState.saving])

  function edit(change: Partial<Dashboard>, patch: Partial<Dashboard['dashboardLayout']> = {}) {
    setDraft((previous) => ({
      ...previous,
      ...change,
      dashboardLayout: { ...previous.dashboardLayout, ...patch, preset: 'custom' }
    }))
  }

  function reorder(
    id: DashboardWidget,
    destination: DashboardWidget | undefined,
    trigger?: HTMLButtonElement
  ) {
    if (!destination) return
    const next = moveWidget(order, id, order.indexOf(destination))
    if (next === order) return
    if (trigger && document.activeElement === trigger) moveButton.current = trigger
    edit({ dashboardWidgetOrder: next })
    setMessage(
      `${widgets[id].label} moved to position ${next.filter((key) => visible[key]).indexOf(id) + 1}.`
    )
  }

  return (
    <section
      className="layout-editor"
      aria-labelledby="layout-editor-title"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !saveState.saving) {
          event.stopPropagation()
          close()
        }
      }}
    >
      <div className="layout-toolbar">
        <header className="workspace-header">
          <h3 id="layout-editor-title" tabIndex={-1} ref={title}>
            Edit layout
          </h3>
          <div className="workspace-actions">
            <button className="control" disabled={saveState.saving} onClick={close}>
              Cancel
            </button>
            <button
              className="control control--accent"
              disabled={readOnly || saveState.saving}
              onClick={() => {
                if (matches) {
                  close()
                  return
                }
                setRequested(true)
                save(draft, false)
              }}
            >
              {saveState.saving ? 'Saving layout…' : 'Save layout'}
            </button>
          </div>
        </header>
        {requested && saveState.failed && !saveState.saving && (
          <p role="alert" className="layout-error">
            Layout was not saved. Your draft is still open.
          </p>
        )}
        <p role="status" className="sr-only">
          {message}
        </p>
        <fieldset disabled={saveState.saving || readOnly}>
          <PresetChooser
            active={layout.preset}
            onChoose={(preset) => {
              if (preset === 'custom') {
                edit({})
                return
              }
              setDraft(dashboardPreset(preset))
              setMessage(`${preset} preset preview.`)
            }}
          />
          <div className="layout-options">
            <label>
              Density{' '}
              <select
                className="control"
                value={draft.dashboardDensity}
                onChange={(event) => {
                  const value = event.currentTarget.value
                  if (value === 'compact' || value === 'comfortable' || value === 'detailed')
                    edit({ dashboardDensity: value })
                }}
              >
                <option>compact</option>
                <option>comfortable</option>
                <option>detailed</option>
              </select>
            </label>
            <details className="widget-visibility">
              <summary className="control">
                Widgets · {draftOrder.length}/{order.length}
              </summary>
              <div className="widget-visibility-options">
                {order.map((id) => (
                  <label key={id}>
                    <input
                      type="checkbox"
                      checked={visible[id]}
                      onChange={(event) =>
                        edit({
                          dashboardWidgets: { ...visible, [id]: event.currentTarget.checked }
                        })
                      }
                    />
                    {widgets[id].label}
                  </label>
                ))}
              </div>
            </details>
            <button className="control" onClick={() => setDraft(dashboardPreset('essential'))}>
              Reset layout
            </button>
          </div>
        </fieldset>
      </div>
      <div className="instrument-grid" data-density={draft.dashboardDensity}>
        {draftOrder.map((id, index) => {
          const label = widgets[id].label
          const options = widgetPresentation(layout, id, draft.dashboardDensity === 'detailed')
          return (
            <div
              className="instrument-cell editing-cell"
              key={id}
              data-width={options.width}
              data-widget={id}
              data-drop-target={target === id}
              onDragOver={(event) => {
                if (!drag.current || drag.current === id || saveState.saving) return
                event.preventDefault()
                event.dataTransfer.dropEffect = 'move'
                if (target !== id) setTarget(id)
              }}
              onDrop={(event) => {
                if (!drag.current || saveState.saving) return
                event.preventDefault()
                reorder(drag.current, id)
                drag.current = null
                setTarget(null)
              }}
            >
              <fieldset className="widget-editor" disabled={saveState.saving || readOnly}>
                <div className="widget-editor-heading">
                  <span
                    className="drag-handle"
                    aria-hidden="true"
                    draggable={!saveState.saving && !readOnly}
                    title={`Drag ${label}`}
                    onDragStart={(event) => {
                      drag.current = id
                      event.dataTransfer.setData('text/plain', id)
                      event.dataTransfer.effectAllowed = 'move'
                    }}
                    onDragEnd={() => {
                      drag.current = null
                      setTarget(null)
                    }}
                  >
                    &#8942;&#8942;
                  </span>
                  <strong>{label}</strong>
                  <button
                    className="control editor-arrow"
                    type="button"
                    title="Move earlier"
                    aria-label={`Move ${label} widget up`}
                    aria-disabled={index === 0}
                    onClick={(event) => reorder(id, draftOrder[index - 1], event.currentTarget)}
                  >
                    &uarr;
                  </button>
                  <button
                    className="control editor-arrow"
                    type="button"
                    title="Move later"
                    aria-label={`Move ${label} widget down`}
                    aria-disabled={index >= draftOrder.length - 1}
                    onClick={(event) => reorder(id, draftOrder[index + 1], event.currentTarget)}
                  >
                    &darr;
                  </button>
                </div>
                <WidthControls
                  id={id}
                  options={options}
                  change={(next) =>
                    edit({}, { presentation: { ...layout.presentation, [id]: next } })
                  }
                />
                {id !== 'anomalies' && (
                  <label className="chart-choice">
                    <input
                      type="checkbox"
                      checked={!layout.noChart.includes(id)}
                      aria-label={`Show ${label} chart`}
                      onChange={(event) =>
                        edit(
                          {},
                          {
                            noChart: event.currentTarget.checked
                              ? layout.noChart.filter((value) => value !== id)
                              : [...layout.noChart, id]
                          }
                        )
                      }
                    />{' '}
                    Live chart
                  </label>
                )}
              </fieldset>
              <Widget id={id} dashboard={draft} />
            </div>
          )
        })}
        {draftOrder.length === 0 && <p className="workspace-meta">No widgets in this layout.</p>}
      </div>
    </section>
  )
}

export function DashboardPage() {
  const [params, setParams] = useSearchParams()
  const [traceWindow, setTraceWindow] = useState(60_000)
  const [showProcesses, setShowProcesses] = useState(true)
  const editButton = useRef<HTMLButtonElement>(null)
  const restoreFocus = useRef(false)
  const editing = params.get('edit') === 'layout'
  const paused = useUiSettingsStore((state) => state.dashboardPollingPaused)
  const setPaused = useUiSettingsStore((state) => state.setDashboardPollingPaused)
  const saving = useUiSettingsStore((state) => state.saveState.saving)
  const committed = useDashboard()
  const save = useUiSettingsStore((state) => state.savePreferences)
  const visible = committed.dashboardWidgetOrder.filter((id) => committed.dashboardWidgets[id])
  const standard =
    committed.dashboardLayout.preset === 'essential' &&
    committed.dashboardWidgetOrder[0] === 'cpu' &&
    committed.dashboardWidgetOrder[1] === 'memory' &&
    visible.every(
      (id) =>
        id === 'anomalies' || widgetPresentation(committed.dashboardLayout, id).width === 'standard'
    )
  const close = useCallback(() => {
    restoreFocus.current = true
    setParams({}, { replace: true })
  }, [setParams])

  useLayoutEffect(() => {
    if (!editing && restoreFocus.current) {
      editButton.current?.focus()
      restoreFocus.current = false
    }
  }, [editing])

  return (
    <section
      className="overview-workspace telemetry-workspace"
      data-editing={editing}
      aria-labelledby="overview-title"
    >
      {!editing && (
        <aside className="overview-context" aria-label="Overview controls">
          <h3>Overview controls</h3>
          <div className="overview-mode">
            <span className="device-dot" data-paused={paused} aria-hidden="true" />
            <span>{paused ? 'Display paused' : 'Monitoring'}</span>
          </div>
          <button className="control" onClick={() => setPaused(!paused)} disabled={saving}>
            {paused ? 'Resume live updates' : 'Pause live updates'}
          </button>
          <Link to="/settings?section=monitoring">Collection settings</Link>
          <section>
            <h3>Quick views</h3>
            {visible
              .filter((id) => id !== 'anomalies')
              .map((id) => (
                <button
                  type="button"
                  className="overview-jump"
                  key={id}
                  onClick={() => {
                    const instrument = document.getElementById(`overview-${id}`)
                    instrument?.scrollIntoView({ block: 'nearest' })
                    instrument?.focus({ preventScroll: true })
                  }}
                >
                  <i data-metric={id} aria-hidden="true" />
                  {widgets[id].label}
                </button>
              ))}
          </section>
          <section>
            <h3>Display</h3>
            <label>
              <input
                type="checkbox"
                checked={showProcesses}
                onChange={(event) => setShowProcesses(event.currentTarget.checked)}
              />{' '}
              Top processes
            </label>
          </section>
          <button className="control" onClick={() => void showMiniMonitorWithFeedback()}>
            Mini Monitor
          </button>
        </aside>
      )}
      <div className="overview-deck">
        <header className="workspace-header overview-header">
          <div>
            <h2 className="sr-only" id="overview-title">
              Overview
            </h2>
            <h1 className="overview-heading" aria-hidden="true">
              {editing ? 'Edit Overview' : 'System Overview'}
            </h1>
            <span className="overview-layout-label">
              {editing ? 'Dashboard layout' : `${committed.dashboardLayout.preset} layout`}
            </span>
          </div>
          {!editing && (
            <div className="workspace-actions">
              <div className="trace-switch" role="group" aria-label="Live chart range">
                {[
                  [30_000, '30 s'],
                  [60_000, '1 min'],
                  [120_000, '2 min']
                ].map(([time, label]) => (
                  <button
                    type="button"
                    key={time}
                    aria-pressed={traceWindow === time}
                    onClick={() => setTraceWindow(Number(time))}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                ref={editButton}
                className="control control--accent"
                onClick={() => setParams({ edit: 'layout' }, { replace: true })}
              >
                Customize Dashboard
              </button>
            </div>
          )}
        </header>
        {editing ? (
          <LayoutEditor committed={committed} close={close} />
        ) : visible.length ? (
          <LiveTraceWindow.Provider value={traceWindow}>
            <div
              className="instrument-grid instrument-board telemetry-grid"
              data-standard={standard}
              data-density={committed.dashboardDensity}
            >
              {visible
                .filter((id) => !standard || id !== 'anomalies')
                .map((id) => (
                  <div
                    key={id}
                    id={`overview-${id}`}
                    tabIndex={-1}
                    className="instrument-cell"
                    data-widget={id}
                    data-width={widgetPresentation(committed.dashboardLayout, id).width}
                  >
                    <Widget id={id} dashboard={committed} />
                  </div>
                ))}
            </div>
            {showProcesses && <TopProcessList />}
            {standard && visible.includes('anomalies') && (
              <div className="overview-anomalies">
                <Widget id="anomalies" dashboard={committed} />
              </div>
            )}
          </LiveTraceWindow.Provider>
        ) : (
          <div className="surface empty-overview">
            <p>No dashboard widgets are visible.</p>
            <button
              className="control"
              disabled={saving}
              onClick={() =>
                save({
                  ...dashboardPreset('essential'),
                  dashboardWidgets: DEFAULT_UI_SETTINGS.dashboardWidgets
                })
              }
            >
              Restore defaults
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
