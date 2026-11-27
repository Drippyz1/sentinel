import type { DashboardDensity } from '../../../../shared/contracts'
import type { WidgetStyle } from '../../../../shared/contracts/personalization'

export interface DashboardWidgetProps {
  density: DashboardDensity
  showChart?: boolean
  expanded?: boolean
  style?: WidgetStyle
}

export function isCompactDashboard(density: DashboardDensity): boolean {
  return density === 'compact'
}
