import assert from 'node:assert/strict'
import { test } from 'node:test'
import { scheduleVisibleRefresh } from '../src/renderer/src/utils/visibleRefresh'

test('visible refresh does not poll hidden views, overlap an active request, or restart after cleanup', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const visibility = Object.assign(new EventTarget(), { hidden: true })
  const toggle = (hidden: boolean) => {
    visibility.hidden = hidden
    visibility.dispatchEvent(new Event('visibilitychange'))
  }
  let attempts = 0
  let complete: (() => void) | undefined
  const stop = scheduleVisibleRefresh(visibility, 100, () => {
    attempts++
    return new Promise<void>((resolve) => {
      complete = resolve
    })
  })
  t.mock.timers.tick(1000)
  assert.equal(attempts, 0)
  toggle(false)
  t.mock.timers.tick(1)
  assert.equal(attempts, 1)
  toggle(true)
  toggle(false)
  t.mock.timers.tick(1000)
  assert.equal(attempts, 1)
  complete?.()
  await Promise.resolve()
  t.mock.timers.tick(100)
  assert.equal(attempts, 2)
  stop()
  complete?.()
  await Promise.resolve()
  t.mock.timers.tick(1000)
  assert.equal(attempts, 2)
})
