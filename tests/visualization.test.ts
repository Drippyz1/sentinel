import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  appendObservation,
  boundedPercent,
  capacityParts,
  observationRuns
} from '../src/shared/utils/visualization'
import {
  isDashboardLayout,
  isAppearanceProfile,
  DEFAULT_APPEARANCE
} from '../src/shared/contracts/personalization'
import {
  dashboardPreset,
  sameDashboard,
  widgetPresentation
} from '../src/shared/utils/dashboardLayout'

test('percentage instruments accept zero and full scale without clamping invalid measurements', () => {
  assert.equal(boundedPercent(0), 0)
  assert.equal(boundedPercent(100), 100)
  for (const value of [null, undefined, NaN, Infinity, -1, 100.1])
    assert.equal(boundedPercent(value), null)
})

test('disk composition uses disjoint lengths, includes reserved capacity, and never adds reclaimable twice', () => {
  const disk = {
    totalBytes: 100,
    usedBytes: 65,
    availableBytes: 30,
    freeBytes: 24,
    purgeableBytes: 6,
    availableIncludesPurgeable: true
  }
  assert.deepEqual(capacityParts(disk), [
    { kind: 'used', value: 65 },
    { kind: 'reserved', value: 5 },
    { kind: 'purgeable', value: 6 },
    { kind: 'free', value: 24 }
  ])
  assert.deepEqual(capacityParts({ ...disk, purgeableBytes: 4 })?.at(-1), {
    kind: 'available',
    value: 30
  })
  assert.equal(capacityParts({ ...disk, usedBytes: 80 }), null)
  assert.equal(capacityParts({ ...disk, totalBytes: 0 }), null)
  assert.equal(capacityParts({ ...disk, freeBytes: NaN }), null)
})

test('live projection skips unchanged samples and does not join separate observation runs', () => {
  const sample = (timestamp: number, value: number | null) => ({ timestamp, value })
  const points = [
    sample(1000, 0),
    sample(3000, 40),
    sample(5000, null),
    sample(9000, 25),
    { ...sample(11000, 40), breakBefore: true },
    sample(14000, NaN),
    sample(15500, 101),
    sample(18000, 100),
    sample(55000, 5)
  ]
  assert.deepEqual(
    observationRuns(points, 100).map((run) => run.map((p) => p.value)),
    [[0, 40], [25], [40], [100], [5]]
  )
  assert.equal(appendObservation(points, undefined, 55_000), points)
  assert.equal(appendObservation(points, sample(55_000, 2), 55_000), points)
  assert.equal(appendObservation(points, sample(56_000, Infinity), 56_000).at(-1)?.value, null)
  assert.ok(
    appendObservation(points, undefined, 136_000).every((point) => point.timestamp >= 16_000)
  )
})

test('legacy widths resolve without migration writes, and enhanced profiles validate compatible styles', () => {
  const layout = { preset: 'custom' as const, wide: ['memory' as const], noChart: ['cpu' as const] }
  assert.ok(isDashboardLayout(layout))
  assert.deepEqual(widgetPresentation(layout, 'memory'), {
    width: 'wide',
    height: 'summary',
    style: 'ring'
  })
  const newLayout = {
    ...layout,
    presentation: { memory: { width: 'full', height: 'expanded', style: 'timeline' } }
  }
  const profile = {
    version: 1,
    name: 'Work',
    appearance: DEFAULT_APPEARANCE,
    dashboard: { ...dashboardPreset('essential'), dashboardLayout: newLayout }
  }
  assert.ok(isAppearanceProfile(JSON.parse(JSON.stringify(profile))))
  assert.ok(
    !isDashboardLayout({
      ...layout,
      presentation: { disk: { width: 'wide', height: 'summary', style: 'gauge' } }
    })
  )
  assert.ok(
    !isDashboardLayout({
      ...layout,
      presentation: { cpu: { width: '100px', height: 'summary', style: 'gauge' } }
    })
  )
  assert.ok(
    !isDashboardLayout({
      ...layout,
      presentation: { sensors: { width: 'full', height: 'expanded', style: 'number' } }
    })
  )
})

test('preset compositions and draft comparisons maintain stable IDs and reject actual differences', () => {
  const essential = dashboardPreset('essential')
  const performance = dashboardPreset('performance')
  const diagnostics = dashboardPreset('diagnostics')
  assert.notDeepEqual(essential.dashboardWidgetOrder, performance.dashboardWidgetOrder)
  assert.equal(widgetPresentation(performance.dashboardLayout, 'cpu').height, 'expanded')
  assert.equal(widgetPresentation(diagnostics.dashboardLayout, 'anomalies').width, 'full')
  assert.ok(sameDashboard(essential, JSON.parse(JSON.stringify(essential))))
  assert.equal(
    sameDashboard(essential, {
      ...essential,
      dashboardWidgetOrder: [...essential.dashboardWidgetOrder].reverse()
    }),
    false
  )
  assert.equal(sameDashboard(essential, performance), false)
})
