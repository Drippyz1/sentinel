import assert from 'node:assert/strict'
import { test } from 'node:test'
import { observedSummary } from '../src/renderer/src/utils/historyInspection'

test('history inspection excludes gaps and invalid values but preserves measured zero', () => {
  assert.deepEqual(observedSummary([null, NaN, Infinity, 0, 25, 50]), {
    count: 3,
    min: 0,
    max: 50,
    average: 25
  })
  assert.deepEqual(observedSummary([null, NaN]), { count: 0, min: null, max: null, average: null })
  assert.deepEqual(observedSummary([-12, -6, -18]), { count: 3, min: -18, max: -6, average: -12 })
})
