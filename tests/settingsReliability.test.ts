import assert from 'node:assert/strict'
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setImmediate as flush } from 'node:timers/promises'
import { test } from 'node:test'
import { readSettingsFile, replaceSettingsFile } from '../src/main/storage/settingsFile'
import { commitWithLoginPreference } from '../src/main/storage/loginPreference'
import {
  createUiSettingsTransactions,
  type UiSaveState
} from '../src/renderer/src/store/uiSettingsTransactions'
import { DEFAULT_UI_SETTINGS, type UiSettingsPatch } from '../src/shared/contracts/settings'
import { applyUiSettingsPatch } from '../src/shared/utils/uiSettingsPatch'
import { allowsUiSettingsPatch } from '../src/shared/contracts/ipcPolicy'

test('an exclusive temp collision is not removed or written through; retries keep the document private', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sentinel-settings-test-'))
  try {
    const path = join(dir, 'settings.json')
    const collision = `${path}.collision.tmp`
    replaceSettingsFile(path, { old: true })
    if (process.platform === 'win32') mkdirSync(collision)
    else symlinkSync(path, collision)
    assert.throws(() => replaceSettingsFile(path, { new: true }, 'collision'))
    assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), { old: true })
    assert.ok(readdirSync(dir).includes('settings.json.collision.tmp'))
    const directory = join(dir, 'cannot-replace')
    mkdirSync(directory)
    assert.throws(() => replaceSettingsFile(directory, { nope: true }, 'owned'))
    assert.ok(!readdirSync(dir).includes('cannot-replace.owned.tmp'))
    replaceSettingsFile(path, { new: true })
    assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), { new: true })
    if (process.platform !== 'win32') assert.equal(statSync(path).mode & 0o077, 0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('settings document distinguishes absent/legacy, malformed and incompatible data without rewriting', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sentinel-settings-test-'))
  try {
    const path = join(dir, 'settings.json')
    assert.deepEqual(readSettingsFile(path, 1), { value: {}, issue: null })
    writeFileSync(path, '{"pollIntervalMs":5000}')
    assert.deepEqual(readSettingsFile(path, 1), { value: { pollIntervalMs: 5000 }, issue: null })
    for (const [contents, issue] of [
      ['{', 'invalid'],
      ['[]', 'invalid'],
      ['{"settingsVersion":2}', 'incompatible']
    ]) {
      writeFileSync(path, contents)
      assert.equal(readSettingsFile(path, 1).issue, issue)
      assert.equal(readFileSync(path, 'utf8'), contents)
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a failed disk write cannot apply login preferences; OS failure retains committed desire for retry', () => {
  let actual: boolean | null = false
  let saved = false
  let deny = true
  let calls = 0
  const login = {
    read: () => actual,
    apply: (intent: boolean) => {
      calls++
      if (deny) throw Error('denied by fixture')
      actual = intent
    }
  }
  assert.deepEqual(
    commitWithLoginPreference(() => false, login, true),
    { success: false, launchAtLoginActual: false, launchAtLoginError: false }
  )
  assert.equal(calls, 0)
  const persist = () => (saved = true)
  assert.deepEqual(commitWithLoginPreference(persist, login, true), {
    success: true,
    launchAtLoginActual: false,
    launchAtLoginError: true
  })
  assert.equal(saved, true)
  assert.equal(calls, 1)
  assert.equal(commitWithLoginPreference(persist, login, undefined).launchAtLoginActual, false)
  assert.equal(calls, 1)
  deny = false
  assert.equal(commitWithLoginPreference(persist, login, true).launchAtLoginActual, true)
  actual = null
  assert.equal(commitWithLoginPreference(persist, login, undefined).launchAtLoginActual, null)
})

test('rapid UI updates keep a bounded pending patch and a stale failed response cannot be replayed', async () => {
  const entries: { patch: UiSettingsPatch; finish: (ok: boolean) => void }[] = []
  let revision = 4
  let status: UiSaveState | undefined
  const settings = createUiSettingsTransactions({
    save: (patch) => new Promise<boolean>((finish) => entries.push({ patch, finish })),
    revision: () => revision,
    onStatus: (current) => {
      status = current
    }
  })
  settings.submit({ dashboardPollingPaused: true })
  settings.submit({ historyMetrics: { cpu: false } })
  settings.submit({ historyMetrics: { gpu: false } })
  settings.submit({ historyRangeMinutes: 30 })
  assert.equal(entries.length, 1)
  revision++ // Another window committed while the first invoke was in flight.
  settings.onRevision()
  entries[0].finish(false)
  await flush()
  assert.equal(entries.length, 2)
  assert.deepEqual(entries[1].patch, {
    historyMetrics: { cpu: false, gpu: false },
    historyRangeMinutes: 30
  })
  entries[1].finish(true)
  await flush()
  assert.deepEqual(status, { saving: false, failed: true, canRetry: false })
  settings.retry()
  assert.equal(entries.length, 2)
})

test('failed pause and resume leave committed state alone and retry the same explicit intent', async () => {
  let fail = true
  let status: UiSaveState | undefined
  let state = DEFAULT_UI_SETTINGS
  let revision = 0
  const settings = createUiSettingsTransactions({
    save: async (patch) => {
      if (fail) return false
      state = applyUiSettingsPatch(state, patch)
      revision++
      return true
    },
    revision: () => revision,
    onStatus: (current) => {
      status = current
    }
  })
  for (const requested of [true, false]) {
    fail = true
    settings.submit({ dashboardPollingPaused: requested })
    await flush()
    assert.equal(state.dashboardPollingPaused, !requested)
    assert.equal(status?.canRetry, true)
    fail = false
    settings.retry()
    await flush()
    assert.equal(state.dashboardPollingPaused, requested)
    assert.equal(status?.failed, false)
  }
})

test('only intended settings keys are permitted for auxiliary roles', () => {
  assert.equal(allowsUiSettingsPatch('tray', { dashboardPollingPaused: true }), true)
  assert.equal(
    allowsUiSettingsPatch('tray', { dashboardPollingPaused: true, historyView: 'table' }),
    false
  )
  assert.equal(allowsUiSettingsPatch('mini', { dashboardPollingPaused: true }), false)
  assert.equal(allowsUiSettingsPatch('main', { miniMonitorVisible: true }), false)
  assert.equal(allowsUiSettingsPatch('main', { historyView: 'table' }), true)
})

test('continued write failures do not retry automatically or replay obsolete preferences after an unrelated commit', async () => {
  let revision = 10
  let status: UiSaveState | undefined
  const attempts: UiSettingsPatch[] = []
  const settings = createUiSettingsTransactions({
    save: async (patch) => {
      attempts.push(patch)
      throw new Error('Simulated unavailable settings')
    },
    revision: () => revision,
    onStatus: (current) => {
      status = current
    }
  })
  settings.submit({ dashboardDensity: 'compact' })
  await flush()
  assert.equal(attempts.length, 1)
  settings.retry()
  await flush()
  assert.equal(attempts.length, 2)
  assert.equal(status?.canRetry, true)
  revision++
  settings.onRevision()
  settings.retry()
  await flush()
  assert.equal(attempts.length, 2)
  assert.deepEqual(status, { saving: false, failed: true, canRetry: false })
})

test('a failed layout draft cannot be replayed through the global retry control', async () => {
  let status: UiSaveState | undefined
  let attempts = 0
  const settings = createUiSettingsTransactions({
    save: async () => {
      attempts++
      return false
    },
    revision: () => 0,
    onStatus: (value) => {
      status = value
    }
  })
  settings.submit({ dashboardDensity: 'detailed' }, false)
  await flush()
  assert.deepEqual(status, { saving: false, failed: true, canRetry: false })
  settings.retry()
  await flush()
  assert.equal(attempts, 1)
})
