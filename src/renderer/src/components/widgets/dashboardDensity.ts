import type { DashboardDensity } from '../../../../shared/contracts'

export interface DashboardWidgetProps {
  density: DashboardDensity
}

export const DASHBOARD_CHART_HEIGHT: Record<DashboardDensity, number> = {
  compact: 48,
  comfortable: 74,
  detailed: 88
}

export function isCompactDashboard(density: DashboardDensity): boolean {
  return density === 'compact'
}
