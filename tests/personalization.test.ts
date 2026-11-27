import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  ACCENTS,
  DEFAULT_APPEARANCE,
  DEFAULT_MINI_PRESENTATION,
  DEFAULT_TRAY_PRESENTATION,
  MAX_PROFILES,
  isAppearance,
  isAppearanceProfile,
  isDashboardLayout,
  isMiniPresentation,
  isProfileList,
  isTrayPresentation,
  type AppearanceProfile
} from '../src/shared/contracts/personalization'
import { DASHBOARD_WIDGET_KEYS } from '../src/shared/contracts/settings'
import { allowsUiSettingsPatch, INVOKE_POLICY } from '../src/shared/contracts/ipcPolicy'
import { dashboardPreset, moveWidget } from '../src/shared/utils/dashboardLayout'
import { appearanceColors, contrast } from '../src/renderer/src/utils/appearance'

function profile(name = 'Desk'): AppearanceProfile {
  return {
    version: 1,
    name,
    appearance: DEFAULT_APPEARANCE,
    dashboard: dashboardPreset('performance')
  }
}

test('dashboard preserves stable IDs and order, including hidden widgets', () => {
  for (const preset of ['essential', 'performance', 'diagnostics'] as const) {
    const { dashboardWidgetOrder, dashboardLayout } = dashboardPreset(preset)
    assert.deepEqual([...dashboardWidgetOrder].sort(), [...DASHBOARD_WIDGET_KEYS].sort())
    assert.ok(isDashboardLayout(dashboardLayout))
    assert.equal(dashboardLayout.preset, preset)
    const moved = moveWidget(
      dashboardWidgetOrder,
      dashboardWidgetOrder[0],
      dashboardWidgetOrder.length - 1
    )
    assert.equal(moved.at(-1), dashboardWidgetOrder[0])
    assert.deepEqual(moved.slice(0, -1), dashboardWidgetOrder.slice(1))
    assert.equal(moveWidget(dashboardWidgetOrder, 'cpu', -1), dashboardWidgetOrder)
    assert.equal(moveWidget(dashboardWidgetOrder, 'cpu', 0.5), dashboardWidgetOrder)
  }
  assert.equal(
    isDashboardLayout({ ...profile().dashboard.dashboardLayout, wide: ['cpu', 'cpu'] }),
    false
  )
  assert.equal(isDashboardLayout({ ...profile().dashboard.dashboardLayout, width: 9999 }), false)
})

test('personalization files admit only bounded declarative presentation settings', () => {
  assert.ok(isAppearanceProfile(JSON.parse(JSON.stringify(profile()))))
  for (const malicious of [
    { ...profile(), version: 2 },
    { ...profile(), name: 'Line\nBreak' },
    { ...profile(), name: 'x'.repeat(49) },
    { ...profile(), monitoring: { pollIntervalMs: 1 } },
    { ...profile(), appearance: { ...DEFAULT_APPEARANCE, accent: 'url(https://example.test/)' } },
    { ...profile(), appearance: { ...DEFAULT_APPEARANCE, startupPage: 'file:///tmp/example' } },
    { ...profile(), dashboard: { ...profile().dashboard, dashboardWidgetOrder: ['disk'] } },
    {
      ...profile(),
      dashboard: {
        ...profile().dashboard,
        dashboardWidgets: { ...profile().dashboard.dashboardWidgets, url: 'https://example.test' }
      }
    },
    JSON.parse(
      JSON.stringify(profile()).replace('"name":', '"__proto__":{"notAllowed":true},"name":')
    )
  ])
    assert.equal(isAppearanceProfile(malicious), false)
  assert.equal(isProfileList([profile('Desk'), profile('desk')]), false)
  assert.equal(
    isProfileList(Array.from({ length: MAX_PROFILES + 1 }, (_, i) => profile(String(i)))),
    false
  )
  assert.equal(isProfileList(Array(1)), false)
  assert.equal(isDashboardLayout({ ...profile().dashboard.dashboardLayout, wide: Array(1) }), false)
  assert.equal(isAppearance({ ...DEFAULT_APPEARANCE, textSize: 100 }), false)
})

test('only supported presentation options and window capabilities are accepted', () => {
  assert.ok(isMiniPresentation(DEFAULT_MINI_PRESENTATION))
  assert.ok(isTrayPresentation(DEFAULT_TRAY_PRESENTATION))
  assert.equal(isMiniPresentation({ ...DEFAULT_MINI_PRESENTATION, metrics: ['disk'] }), false)
  assert.equal(isMiniPresentation({ ...DEFAULT_MINI_PRESENTATION, opacity: 5 }), false)
  assert.equal(isTrayPresentation({ ...DEFAULT_TRAY_PRESENTATION, metrics: [] }), false)
  assert.deepEqual(INVOKE_POLICY['import-appearance-profile'], [['main'], 0])
  assert.deepEqual(INVOKE_POLICY['export-appearance-profile'], [['main'], 1])
  assert.equal(allowsUiSettingsPatch('mini', { appearance: DEFAULT_APPEARANCE }), false)
  assert.equal(
    allowsUiSettingsPatch('tray', { trayPresentation: DEFAULT_TRAY_PRESENTATION }),
    false
  )
})

test('accent ink and button labels remain readable against each theme', () => {
  const bases = {
    graphite: '#2a3133',
    glacier: '#e8eeee',
    obsidian: '#23282b',
    nordic: '#2a3b43'
  } as const
  for (const theme of Object.keys(bases) as (keyof typeof bases)[]) {
    for (const accent of [...ACCENTS, '#000000', '#ffffff', '#0642ac', '#fded01', 'invalid']) {
      const { ink, fill, foreground } = appearanceColors(accent, theme)
      assert.ok(contrast(ink, bases[theme]) >= 4.5, `${accent} on ${theme}`)
      assert.ok(contrast(fill, foreground) >= 4.5, `label for ${accent} on ${theme}`)
    }
  }
})
