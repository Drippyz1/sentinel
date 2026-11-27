import { DEFAULT_UI_SETTINGS, type DashboardWidget } from '../contracts/settings'
import {
  DASHBOARD_WIDGET_KEYS,
  WIDGET_STYLES,
  type AppearanceProfile,
  type DashboardLayout,
  type WidgetPresentation
} from '../contracts/personalization'

export function sameDashboard(
  first: AppearanceProfile['dashboard'],
  second: AppearanceProfile['dashboard']
): boolean {
  const a = first.dashboardLayout
  const b = second.dashboardLayout
  return (
    first.dashboardDensity === second.dashboardDensity &&
    a.preset === b.preset &&
    first.dashboardWidgetOrder.every((id, index) => second.dashboardWidgetOrder[index] === id) &&
    DASHBOARD_WIDGET_KEYS.every((id) => {
      return (
        first.dashboardWidgets[id] === second.dashboardWidgets[id] &&
        a.noChart.includes(id) === b.noChart.includes(id) &&
        a.wide.includes(id) === b.wide.includes(id) &&
        a.presentation?.[id]?.width === b.presentation?.[id]?.width &&
        a.presentation?.[id]?.height === b.presentation?.[id]?.height &&
        a.presentation?.[id]?.style === b.presentation?.[id]?.style
      )
    })
  )
}

export function widgetPresentation(
  layout: DashboardLayout,
  id: DashboardWidget,
  detailed = false
): WidgetPresentation {
  return (
    layout.presentation?.[id] ?? {
      width: layout.wide.includes(id) ? 'wide' : id === 'anomalies' ? 'full' : 'standard',
      height: detailed ? 'expanded' : 'summary',
      style: WIDGET_STYLES[id][0]
    }
  )
}

export function moveWidget(
  order: DashboardWidget[],
  id: DashboardWidget,
  to: number
): DashboardWidget[] {
  const from = order.indexOf(id)
  if (from < 0 || !Number.isInteger(to) || to < 0 || to >= order.length || to === from) return order
  const next = order.filter((widget) => widget !== id)
  next.splice(to, 0, id)
  return next
}

export function dashboardPreset(
  preset: Exclude<DashboardLayout['preset'], 'custom'>
): AppearanceProfile['dashboard'] {
  const { dashboardWidgets, dashboardDensity, dashboardLayout } = DEFAULT_UI_SETTINGS
  if (preset === 'essential')
    return {
      dashboardWidgets,
      dashboardWidgetOrder: ['cpu', 'memory', 'disk', 'gpu', 'network', 'battery', 'anomalies'],
      dashboardDensity,
      dashboardLayout
    }
  if (preset === 'performance')
    return {
      dashboardWidgets,
      dashboardWidgetOrder: ['cpu', 'gpu', 'network', 'memory', 'disk', 'battery', 'anomalies'],
      dashboardDensity: 'comfortable',
      dashboardLayout: {
        preset,
        wide: ['cpu', 'network'],
        noChart: [],
        presentation: {
          cpu: { width: 'wide', height: 'expanded', style: 'gauge' },
          gpu: { width: 'standard', height: 'expanded', style: 'gauge' },
          network: { width: 'wide', height: 'expanded', style: 'area' }
        }
      }
    }
  return {
    dashboardWidgets,
    dashboardWidgetOrder: ['anomalies', 'disk', 'memory', 'cpu', 'network', 'gpu', 'battery'],
    dashboardDensity: 'detailed',
    dashboardLayout: {
      preset,
      wide: ['anomalies', 'disk'],
      noChart: [],
      presentation: {
        anomalies: { width: 'full', height: 'expanded', style: 'list' },
        disk: { width: 'wide', height: 'expanded', style: 'segments' },
        network: { width: 'wide', height: 'expanded', style: 'activity' }
      }
    }
  }
}
