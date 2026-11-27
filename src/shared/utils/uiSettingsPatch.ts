import type { UiSettings, UiSettingsPatch } from '../contracts/settings'

function merge<T extends UiSettingsPatch>(base: T, patch: UiSettingsPatch): T {
  return {
    ...base,
    ...patch,
    ...(patch.dashboardWidgets && {
      dashboardWidgets: { ...base.dashboardWidgets, ...patch.dashboardWidgets }
    }),
    ...(patch.historyMetrics && {
      historyMetrics: { ...base.historyMetrics, ...patch.historyMetrics }
    })
  }
}

export function applyUiSettingsPatch(settings: UiSettings, patch: UiSettingsPatch): UiSettings {
  return merge(settings, patch)
}

export function combineUiSettingsPatches(
  previous: UiSettingsPatch,
  next: UiSettingsPatch
): UiSettingsPatch {
  return merge(previous, next)
}
