/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statfsSync, writeFileSync } = fs
const { tmpdir, totalmem, uptime } = require('node:os')
const { join } = require('node:path')
const { pathToFileURL } = require('node:url')
const { setTimeout: wait } = require('node:timers/promises')
const { app, BrowserWindow, ipcMain, Notification, Tray } = require('electron')
const si = require('systeminformation')

const profile = mkdtempSync(join(tmpdir(), 'sentinel-smoke-'))
app.setPath('userData', profile)
app.setPath('sessionData', profile)
delete process.env.ELECTRON_RENDERER_URL
const legacyTimestamp = Date.now() - 90_000
const currentMinute = Math.floor(Date.now() / 60_000) * 60_000
const expiredTimestamp = Date.now() - 2 * 86_400_000
const startPaused = process.env.SENTINEL_SMOKE_START_PAUSED === '1'
writeFileSync(
  join(profile, 'settings.json'),
  JSON.stringify({
    settingsVersion: 1,
    pollIntervalMs: 2000,
    dataRetentionDays: 1,
    ui: { historyView: 'table', dashboardPollingPaused: startPaused }
  })
)
const Database = require('better-sqlite3')
const legacy = new Database(join(profile, 'sentinel.db'))
legacy.exec(`
  CREATE TABLE metric_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp INTEGER NOT NULL,
    cpu_usage REAL NOT NULL, memory_usage REAL NOT NULL, memory_used INTEGER NOT NULL,
    disk_usage REAL NOT NULL, disk_read REAL, disk_write REAL, disk_free INTEGER
  );
`)
legacy
  .prepare('INSERT INTO metric_snapshots VALUES (12, ?, 30, 40, 300, 50, 7, 9, 800)')
  .run(legacyTimestamp)
legacy
  .prepare('INSERT INTO metric_snapshots VALUES (13, ?, 10, 30, 200, 40, NULL, NULL, NULL)')
  .run(expiredTimestamp)
const seedMinute = legacy.prepare(
  'INSERT INTO metric_snapshots VALUES (NULL, ?, ?, 40, 300, 50, NULL, NULL, 800)'
)
for (let age = 120; age >= 2; age--) {
  if (age >= 40 && age < 100) continue
  seedMinute.run(currentMinute - age * 60_000, 10 + (age % 41))
}
legacy.close()

const calls = {}
for (const key of [
  'cpu',
  'currentLoad',
  'cpuTemperature',
  'mem',
  'fsSize',
  'disksIO',
  'fsStats',
  'networkStats',
  'networkInterfaces',
  'graphics',
  'battery',
  'processes'
]) {
  const original = si[key]
  si[key] = (...args) => {
    calls[key] = (calls[key] ?? 0) + 1
    return original(...args)
  }
}

const rendererErrors = []
let openTray
const addTrayListener = Tray.prototype.on
Tray.prototype.on = function (event, listener) {
  if (event === 'click') {
    openTray = () => this.emit('click')
    Tray.prototype.on = addTrayListener
  }
  return addTrayListener.call(this, event, listener)
}
app.on('browser-window-created', (_event, window) => {
  window.webContents.on('console-message', (event) => {
    if (event.level === 'error') rendererErrors.push(event.message)
  })
  window.webContents.on('render-process-gone', (_event, details) => {
    if (details.reason !== 'clean-exit') rendererErrors.push(details.reason)
  })
})
app.on('quit', () => {
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
  } catch (error) {
    console.warn('Temporary smoke profile cleanup did not finish:', error.message)
  }
})

const registeredIpc = new Set()
const handlers = new Map()
const originalHandle = ipcMain.handle.bind(ipcMain)
ipcMain.handle = (channel, listener) => {
  registeredIpc.add(channel)
  handlers.set(channel, listener)
  return originalHandle(channel, listener)
}
const settingsPath = join(profile, 'settings.json')
const originalRename = fs.renameSync
let failSettingsReplace = false
const miniDismissWarnings = []
const originalShowNotification = Notification.prototype.show
Notification.prototype.show = function () {
  if (this.title === 'Mini Monitor hidden for this session') {
    miniDismissWarnings.push(this.body)
    return
  }
  return originalShowNotification.call(this)
}
fs.renameSync = function (source, destination) {
  if (failSettingsReplace && destination === settingsPath) {
    throw Object.assign(new Error('Isolated settings replacement failure'), { code: 'EIO' })
  }
  return originalRename(source, destination)
}
const originalSetLogin = app.setLoginItemSettings
let loginWrites = 0
app.setLoginItemSettings = () => {
  loginWrites++
}
app.once('quit', () => {
  app.setLoginItemSettings = originalSetLogin
})
require('../out/main/index.js')

async function until(check, label, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs
  do {
    const result = await check()
    if (result) return result
    await wait(100)
  } while (Date.now() < deadline)
  throw new Error(`Timed out waiting for ${label}`)
}

function view(hash) {
  return BrowserWindow.getAllWindows().find((window) => {
    const url = window.webContents.getURL()
    return url.startsWith('file:') && new URL(url).hash === hash
  })
}

function heading(window, text) {
  return until(
    () =>
      window.webContents.executeJavaScript(
        `Array.from(document.querySelectorAll('h1,h2')).some(el => el.textContent.trim() === ${JSON.stringify(text)})`
      ),
    text
  )
}

async function collectBenchmark(main, durationMs) {
  await main.webContents.executeJavaScript(`
    window.smokeTimestamps = [];
    window.electronAPI.onMetricsUpdated(snapshot => window.smokeTimestamps.push(snapshot.timestamp));
    true;
  `)
  const startCalls = { ...calls }
  const start = Date.now()
  const samples = []
  while (Date.now() - start < durationMs) {
    await wait(2_000)
    const processes = app.getAppMetrics()
    samples.push({
      cpu: processes.reduce((sum, entry) => sum + entry.cpu.percentCPUUsage, 0),
      rss: processes.reduce((sum, entry) => sum + (entry.memory?.workingSetSize ?? 0), 0) / 1024
    })
  }
  const timestamps = await main.webContents.executeJavaScript('window.smokeTimestamps')
  const mean = (key) =>
    Math.round((10 * samples.reduce((sum, sample) => sum + sample[key], 0)) / samples.length) / 10
  console.log(
    JSON.stringify({
      elapsedMs: Date.now() - start,
      deliveries: timestamps.length,
      meanDeliveryMs:
        timestamps.length > 1
          ? Math.round((timestamps.at(-1) - timestamps[0]) / (timestamps.length - 1))
          : null,
      meanElectronCpuPercent: mean('cpu'),
      meanSummedWorkingSetMiB: mean('rss'),
      collectorCalls: Object.fromEntries(
        Object.entries(calls).map(([key, count]) => [key, count - (startCalls[key] ?? 0)])
      )
    })
  )
}

async function verifyAuthorization(main, tray, mini) {
  const byRole = { main, tray, mini }
  const scoped = {
    'open-main-window': ['tray', 'mini'],
    'quit-app': ['tray'],
    'set-tray-compact': ['tray'],
    'show-mini-monitor': ['main'],
    'hide-mini-monitor': ['mini'],
    'set-mini-monitor-always-on-top': ['mini'],
    'get-tray-alert-summary': ['tray'],
    'get-latest-metrics': ['main', 'tray', 'mini'],
    'get-ui-settings': ['main', 'tray', 'mini'],
    'save-ui-settings': ['main', 'tray']
  }
  let checked = 0
  for (const [channel, handle] of handlers) {
    for (const [role, window] of Object.entries(byRole)) {
      if ((scoped[channel] ?? ['main']).includes(role)) continue
      const sender = window.webContents
      await assert.rejects(
        async () => handle({ sender, senderFrame: sender.mainFrame }),
        /untrusted sender/
      )
      checked++
    }
  }
  const contents = main.webContents
  const fakeSubframe = { sender: contents, senderFrame: { url: contents.getURL() } }
  await assert.rejects(
    async () => handlers.get('get-ui-settings')(fakeSubframe),
    /untrusted sender/
  )
  const real = { sender: contents, senderFrame: contents.mainFrame }
  await assert.rejects(
    async () => handlers.get('get-ui-settings')(real, 'extra'),
    /Unexpected IPC arguments/
  )
  const untrusted = join(profile, 'untrusted-fixture.html')
  writeFileSync(untrusted, '<!doctype html><title>Isolated navigation fixture</title>')
  const beforeNavigation = main.webContents.getURL()
  await main.webContents.executeJavaScript(
    `location.href = ${JSON.stringify(pathToFileURL(untrusted).href)}; true`
  )
  await wait(150)
  assert.equal(main.webContents.getURL(), beforeNavigation)
  const runTray = (source) => tray.webContents.executeJavaScript(source)
  const runMini = (source) => mini.webContents.executeJavaScript(source)
  for (const run of [runTray, runMini]) {
    await assert.rejects(run('window.electronAPI.getNetworkConnections()'), /untrusted sender/)
    await assert.rejects(run('window.electronAPI.getSystemInfo()'), /untrusted sender/)
    assert.ok(await run('window.electronAPI.getLatestMetrics().then(s => s.statuses.cpu)'))
  }
  const read = () => main.webContents.executeJavaScript('window.electronAPI.getUiSettings()')
  const before = await read()
  assert.equal(
    await runTray(`window.electronAPI.saveUiSettings({
    dashboardPollingPaused: true,
    historyView: 'chart'
  })`),
    false
  )
  assert.deepEqual(await read(), before)
  assert.equal(
    await runTray(`window.electronAPI.saveUiSettings({ dashboardPollingPaused: 'true' })`),
    false
  )
  assert.equal(await runMini('window.electronAPI.setMiniMonitorAlwaysOnTop(false)'), true)
  assert.equal(
    await runMini('window.electronAPI.getUiSettings().then(s => s.ui.miniMonitorAlwaysOnTop)'),
    false
  )
  assert.equal(await runMini('window.electronAPI.setMiniMonitorAlwaysOnTop(true)'), true)
  assert.deepEqual(Object.keys(await runTray('window.electronAPI.getTrayAlertSummary()')).sort(), [
    'latestTitle',
    'unreadCount'
  ])
  for (const window of [main, tray, mini]) {
    await window.webContents.executeJavaScript(`
      window.alertDeliveries = { full: 0, summary: 0 };
      window.electronAPI.onAlertHistoryUpdated(() => window.alertDeliveries.full++);
      window.electronAPI.onTrayAlertSummaryUpdated(() => window.alertDeliveries.summary++);
      true
    `)
  }
  await main.webContents.executeJavaScript('window.electronAPI.markAllAlertsRead()')
  await until(() => runTray('window.alertDeliveries.summary > 0'), 'scoped tray summary event')
  assert.deepEqual(await main.webContents.executeJavaScript('window.alertDeliveries'), {
    full: 1,
    summary: 0
  })
  assert.deepEqual(await runTray('window.alertDeliveries'), { full: 0, summary: 1 })
  assert.deepEqual(await runMini('window.alertDeliveries'), { full: 0, summary: 0 })
  console.log(
    JSON.stringify({
      ipcRejectedRolePairs: checked,
      unexpectedFrame: 'rejected',
      untrustedNavigation: 'blocked',
      mixedPatch: 'no effect',
      alertEvents: 'scoped',
      miniPin: 'verified'
    })
  )
}

function control(window, label) {
  return window.webContents.executeJavaScript(`
    (() => {
      const button = [...document.querySelectorAll('button')].find(el => el.textContent.trim() === ${JSON.stringify(label)})
      if (!button || button.disabled) return false
      button.click()
      return true
    })()
  `)
}

async function hasText(window, selector, text) {
  return window.webContents
    .executeJavaScript(`[...document.querySelectorAll(${JSON.stringify(selector)})]
    .some(el => el.textContent.trim() === ${JSON.stringify(text)})`)
}

async function capture(window, name) {
  const dir = process.env.SENTINEL_SMOKE_CAPTURE_DIR
  if (!dir) return
  window.setSize(1200, 800)
  await wait(250)
  writeFileSync(join(dir, name + '.png'), (await window.capturePage()).toPNG())
}

async function verifySettingsRecovery(main, tray) {
  const mainRun = (source) => main.webContents.executeJavaScript(source)
  const trayRun = (source) => tray.webContents.executeJavaScript(source)
  const pauseState = 'window.electronAPI.getUiSettings().then(s => s.ui.dashboardPollingPaused)'
  await mainRun('location.hash = "#/"; true')
  await heading(main, 'Overview')
  await mainRun('window.electronAPI.saveUiSettings({ dashboardWidgets: { network: false } })')
  const legacyCollision = settingsPath + '.tmp'
  mkdirSync(legacyCollision)
  try {
    for (const pause of [true, false]) {
      const button = pause ? 'Pause live updates' : 'Resume live updates'
      const trayButton = pause ? 'Pause' : 'Resume'
      const saved = readFileSync(settingsPath, 'utf8')
      failSettingsReplace = true
      assert.equal(await control(main, button), true)
      await until(
        () => hasText(main, '[role=alert]', 'Could not save settings.'),
        'actionable settings error'
      )
      assert.equal(await mainRun(pauseState), !pause)
      assert.equal(await hasText(main, 'button', button), true)
      assert.equal(await hasText(tray, 'button', trayButton), true)
      assert.equal(readFileSync(settingsPath, 'utf8'), saved)
      if (pause) await capture(main, 'candidate-settings-failure')
      failSettingsReplace = false
      assert.equal(await control(main, 'Retry'), true)
      await until(async () => (await mainRun(pauseState)) === pause, 'retry commit')
      await until(() => hasText(tray, 'button', pause ? 'Resume' : 'Pause'), 'tray commit')
      assert.equal(JSON.parse(readFileSync(settingsPath, 'utf8')).ui.dashboardPollingPaused, pause)
    }
    assert.equal(
      await trayRun('window.electronAPI.saveUiSettings({ dashboardPollingPaused: true })'),
      true
    )
    await until(() => hasText(main, 'button', 'Resume live updates'), 'tray-to-main pause')
    const contenders = await Promise.all([
      mainRun(
        'window.electronAPI.saveUiSettings({ dashboardPollingPaused: false, historyAlertMarkers: false })'
      ),
      trayRun('window.electronAPI.saveUiSettings({ dashboardPollingPaused: true })')
    ])
    assert.deepEqual(contenders, [true, true])
    assert.equal(await mainRun(pauseState), await trayRun(pauseState))
    const durable = JSON.parse(readFileSync(settingsPath, 'utf8')).ui
    assert.equal(durable.dashboardWidgets.network, false)
    assert.equal(durable.historyAlertMarkers, false)
    assert.equal(durable.dashboardPollingPaused, await mainRun(pauseState))
    await mainRun('window.electronAPI.saveUiSettings({ dashboardPollingPaused: false })')
    assert.ok(existsSync(legacyCollision))
  } finally {
    failSettingsReplace = false
    fs.rmdirSync(legacyCollision)
  }
  console.log(
    'Settings: collision untouched, injected pause and resume failures show committed state; retries and multi-window commits verified'
  )
}

async function verifyHistoryGap(main) {
  const run = (source) => main.webContents.executeJavaScript(source)
  await run('window.electronAPI.saveUiSettings({ historyView: "chart", historyRangeMinutes: 180 })')
  await run('location.hash = "#/history"; true')
  await heading(main, 'History')
  const result = await until(
    () =>
      run(`
    (() => {
      const cpu = document.querySelector('.recharts-area-curve')
      const segments = cpu?.getAttribute('d')?.match(/M/g)?.length ?? 0
      return segments >= 2 && segments
    })()
  `),
    'disjoint CPU chart paths'
  )
  const rows = await run('window.electronAPI.getHistoryDownsampled(180)')
  assert.ok(!rows.some((row) => row.timestamp === currentMinute - 75 * 60_000))
  assert.ok(rows.some((row) => row.timestamp < currentMinute - 75 * 60_000))
  assert.ok(rows.some((row) => row.timestamp > currentMinute - 75 * 60_000))
  await capture(main, 'candidate-history-gap')
  console.log(
    JSON.stringify({ historyGapMinutes: 60, svgCpuSegments: result, fabricatedApiRows: 0 })
  )
}

async function verifyMiniDismissal(main) {
  const open = async () => {
    assert.equal(
      await main.webContents.executeJavaScript('window.electronAPI.showMiniMonitor()'),
      true
    )
    const mini = await until(() => view('#mini-monitor'), 'mini monitor')
    await heading(mini, 'Sentinel Mini Monitor')
    assert.equal(mini.isVisible(), true)
    return mini
  }
  const saved = () => JSON.parse(readFileSync(settingsPath, 'utf8')).ui.miniMonitorVisible
  const outcomes = []
  const firstWarning = miniDismissWarnings.length
  for (const method of ['button', 'native-close']) {
    const mini = await open()
    assert.equal(saved(), true)
    failSettingsReplace = true
    try {
      if (method === 'button') assert.equal(await control(mini, 'Hide Monitor'), true)
      else mini.close()
      await wait(300)
      outcomes.push({ method, hidden: !mini.isVisible(), savedStartupVisible: saved() })
    } finally {
      failSettingsReplace = false
    }
    if (mini.isVisible()) {
      // Recover the fixture before testing the other dismissal path on the old build.
      mini.close()
    }
    await until(() => mini.isDestroyed(), 'dismissed mini disposal')
  }
  console.log(JSON.stringify({ miniDismissalWithFailedWrite: outcomes }))
  assert.deepEqual(outcomes, [
    { method: 'button', hidden: true, savedStartupVisible: true },
    { method: 'native-close', hidden: true, savedStartupVisible: true }
  ])
  if (Notification.isSupported()) {
    const warnings = miniDismissWarnings.slice(firstWarning)
    assert.equal(warnings.length, 2)
    for (const warning of warnings) assert.match(warning, /startup preference was not saved/i)
    console.log('Mini dismissal: both paths requested an accurate native warning')
  }
  const recovered = await open()
  recovered.close()
  assert.equal(recovered.isVisible(), false)
  assert.equal(saved(), false)
  await until(() => recovered.isDestroyed(), 'recovered mini disposal')
  console.log('Mini dismissal recovery: explicit retry saved the startup preference')
}

async function smoke() {
  const started = Date.now()
  const main = await until(() => view('') ?? view('#/'), 'main window')
  await heading(main, 'Overview')
  const dashboardReadyMs = Date.now() - started
  const run = (js) => main.webContents.executeJavaScript(js)
  if (process.env.SENTINEL_SMOKE_MINI_DISMISS_ONLY === '1') {
    await verifyMiniDismissal(main)
    return
  }

  const snapshot = await until(async () => {
    const current = await run('window.electronAPI.getLatestMetrics()')
    return current.cpu?.cores > 0 &&
      current.memory?.totalBytes > 0 &&
      current.disk.drives.length > 0
      ? current
      : null
  }, 'CPU, memory, and disk samples')
  const primary = snapshot.disk.drives.find((drive) => drive.isPrimary)
  assert.ok(primary?.totalBytes > 0, 'primary disk capacity')
  assert.equal(snapshot.processes, undefined)
  assert.equal(snapshot.capabilities.platform, process.platform)
  assert.equal(snapshot.statuses.diskCapacity.state, 'ok')
  assert.equal(snapshot.memory.totalBytes, totalmem())
  assert.equal(main.webContents.getLastWebPreferences().sandbox, true)
  assert.equal(await run('typeof require'), 'undefined')
  if (process.platform === 'darwin') {
    assert.equal(snapshot.memory.cachedBytes, null)
    assert.equal(primary.mount, '/')
    assert.equal(primary.availableBytes, primary.freeBytes + (primary.purgeableBytes ?? 0))
    assert.equal(primary.availableIncludesPurgeable, primary.purgeableBytes !== null)
    const dataVolume = statfsSync('/System/Volumes/Data')
    assert.ok(
      Math.abs(primary.freeBytes - dataVolume.bavail * dataVolume.bsize) < 512_000_000,
      'immediately free capacity agrees with Data volume statfs within sampling drift'
    )
  }
  console.log({
    dashboardReadyMs,
    firstCompleteReadMs: Date.now() - started,
    disk: {
      mount: primary.mount,
      availableBytes: primary.availableBytes,
      freeBytes: primary.freeBytes,
      purgeableBytes: primary.purgeableBytes
    },
    sandbox: main.webContents.getLastWebPreferences().sandbox
  })
  if (startPaused) {
    assert.equal(
      await run(
        'window.electronAPI.getUiSettings().then(settings => settings.ui.dashboardPollingPaused)'
      ),
      true
    )
    assert.ok(snapshot.cpu, 'a paused startup still receives an initial CPU reading')
    console.log('Paused startup received an initial metrics frame without changing settings')
  }
  const benchmarkMs = Number(process.env.SENTINEL_SMOKE_BENCHMARK_MS ?? 0)
  if (benchmarkMs > 0) await collectBenchmark(main, benchmarkMs)

  for (const [route, title] of [
    ['/alerts', 'Alerts'],
    ['/processes', 'Processes'],
    ['/network', 'Network Connections'],
    ['/system', 'System'],
    ['/history', 'History'],
    ['/settings', 'Settings']
  ]) {
    await run(`location.hash = ${JSON.stringify(route)}; true`)
    await heading(main, title)
    console.log(`Rendered: ${title}`)
  }
  const systemInfo = await run('window.electronAPI.getSystemInfo()')
  assert.equal(await run('typeof window.electronAPI.toggleStartupItem'), 'undefined')
  assert.equal(registeredIpc.has('toggle-startup-item'), false)
  const startup = await run('window.electronAPI.getStartupMetrics()')
  assert.ok(startup.limitation)
  assert.ok(
    startup.items.every(
      (item) =>
        ['disabled', 'not-disabled', 'unknown'].includes(item.configuration) &&
        !Object.hasOwn(item, 'editable') &&
        !Object.hasOwn(item, 'path')
    )
  )
  await run('location.hash = "#/processes"; true')
  await heading(main, 'Processes')
  const processMetrics = await until(
    () => run('window.electronAPI.getLatestMetrics().then(frame => frame.processes)'),
    'process metrics'
  )
  assert.ok(processMetrics.total > 0 && processMetrics.list.length > 0)
  const processRequest = { query: '', page: 0, sort: 'pid', direction: 'asc', filter: 'all' }
  await assert.rejects(
    run(`window.electronAPI.getProcessPage(${JSON.stringify({ ...processRequest, page: 500 })})`),
    /Invalid process page request/
  )
  if (!startPaused) {
    const page = await until(
      () => run(`window.electronAPI.getProcessPage(${JSON.stringify(processRequest)})`),
      'cached process page'
    )
    assert.ok(page.rows.length > 0 && page.rows.length <= 50 && page.captured <= 4096)
    assert.ok(
      page.rows.every(
        (row, i, all) => (i === 0 || row.pid > all[i - 1].pid) && !('commandLine' in row)
      )
    )
    console.log('Bounded process inventory, deterministic ordering and summary-only IPC verified')
  } else {
    assert.equal(
      await run(`window.electronAPI.getProcessPage(${JSON.stringify(processRequest)})`),
      null
    )
  }
  const selectedProcess = processMetrics.list.find(
    (entry) => entry.pid > 1 && entry.pid !== process.pid
  )
  assert.ok(selectedProcess)
  const details = await run(`window.electronAPI.getProcessDetails(${selectedProcess.pid})`)
  assert.equal(details?.pid, selectedProcess.pid)
  const connections = await run('window.electronAPI.getNetworkConnections()')
  assert.ok(Array.isArray(connections.connections) && connections.collectedAt > 0)
  assert.ok(connections.connections.length <= 2048)
  const thermal = await run('window.electronAPI.getThermalMetrics()')
  assert.ok(thermal.description)
  const history = await run('window.electronAPI.getHistoryDownsampled(30)')
  assert.ok(systemInfo.platform && Math.abs(systemInfo.uptimeSeconds - uptime()) < 20)
  const retained = history.find(
    (row) => row.timestamp === Math.floor(legacyTimestamp / 60_000) * 60_000
  )
  assert.ok(retained, 'legacy history retained')
  assert.equal(retained.disk_free, 800)
  assert.equal(retained.disk_read, null)
  assert.equal(retained.disk_read_legacy_ops, 7)
  assert.ok(history.some((row) => row.cpu_usage !== null && row.timestamp > retained.timestamp))
  const retainedDatabase = new Database(join(profile, 'sentinel.db'), { readonly: true })
  try {
    assert.equal(
      retainedDatabase.prepare('SELECT 1 FROM metric_snapshots WHERE id = 13').get(),
      undefined
    )
  } finally {
    retainedDatabase.close()
  }
  const report = JSON.parse(
    await run('window.electronAPI.exportSystemReport("json").then(report => report.content)')
  )
  assert.equal(report.monitoring.capabilities.platform, process.platform)
  assert.ok(report.storage.some((drive) => drive.isPrimary))
  const diagnostic = await run(
    'window.electronAPI.exportDiagnosticBundle().then(bundle => new TextDecoder().decode(bundle.content))'
  )
  assert.ok(diagnostic.startsWith('PK\x03\x04'))
  assert.ok(diagnostic.includes('"hostname": "[redacted]"'))
  assert.ok(diagnostic.includes('"mount": "[system volume]"'))
  assert.ok(!diagnostic.includes('"localIpAddress": "'))
  await assert.rejects(run('window.electronAPI.copyText("\\u0000")'), /Invalid clipboard text/)
  const settings = await run('window.electronAPI.getSettings().then(result => result.settings)')
  assert.equal(settings.ui.historyView, 'table')
  assert.deepEqual(settings.collectionIntervalsMs, {})
  const save = await run(`
    window.electronAPI.getSettings().then(result => window.electronAPI.saveSettings({
      ...result.settings,
      tempUnit: 'F',
      collectionIntervalsMs: { processes: 1000 }
    }, false))
  `)
  assert.equal(save.success, true)
  assert.equal(save.settings.collectionIntervalsMs.processes, 1000)
  assert.equal(save.settings.tempUnit, 'F')
  assert.equal(
    await run(`
      window.smokeDeliveries = 0;
      window.electronAPI.onMetricsUpdated(() => window.smokeDeliveries++);
      window.electronAPI.saveUiSettings({ dashboardPollingPaused: true });
    `),
    true
  )
  const pausedDeliveries = await run('window.smokeDeliveries')
  const recordedRows = () => {
    const reader = new Database(join(profile, 'sentinel.db'), { readonly: true })
    try {
      return reader.prepare('SELECT COUNT(*) AS count FROM metric_snapshots').pluck().get()
    } finally {
      reader.close()
    }
  }
  const historyCount = recordedRows()
  await until(() => recordedRows() > historyCount, 'recording while dashboard is paused')
  assert.equal(await run('window.smokeDeliveries'), pausedDeliveries)
  assert.equal(
    await run('window.electronAPI.saveUiSettings({ dashboardPollingPaused: false })'),
    true
  )
  await until(
    async () => (await run('window.smokeDeliveries')) > pausedDeliveries,
    'resumed updates'
  )
  assert.equal(
    await run(
      'window.electronAPI.killProcess({ pid: 2, name: "smoke", started: "" }).then(result => result.success)'
    ),
    false
  )

  assert.ok(openTray, 'native tray')
  assert.equal(view('#tray'), undefined, 'tray renderer should be lazy')
  openTray()
  const tray = await until(() => view('#tray'), 'tray window')
  await heading(tray, 'Sentinel')
  assert.equal(tray.webContents.getLastWebPreferences().sandbox, true)
  await assert.rejects(
    tray.webContents.executeJavaScript('window.electronAPI.saveSettings({}, false)'),
    /untrusted sender/
  )
  await run('window.electronAPI.showMiniMonitor()')
  const mini = await until(() => view('#mini-monitor'), 'mini monitor window')
  await heading(mini, 'Sentinel Mini Monitor')
  assert.equal(mini.webContents.getLastWebPreferences().sandbox, true)
  await verifyAuthorization(main, tray, mini)
  failSettingsReplace = true
  try {
    assert.equal(await control(mini, 'Unpin'), true)
    await until(
      () => hasText(mini, '[role=alert]', 'Could not save. Try again.'),
      'mini pin failure feedback'
    )
    assert.equal(await hasText(mini, 'button', 'Unpin'), true)
  } finally {
    failSettingsReplace = false
  }
  console.log('Mini: failed pin write kept committed pin state and displayed a retryable error')
  await verifySettingsRecovery(main, tray)
  await verifyHistoryGap(main)
  assert.equal(loginWrites, 0, 'changes unrelated to login must never call the OS setter')
  const miniContents = mini.webContents
  const miniEvent = { sender: miniContents, senderFrame: miniContents.mainFrame }
  await mini.webContents.executeJavaScript('window.electronAPI.hideMiniMonitor()')
  await until(() => mini.isDestroyed(), 'mini disposal')
  assert.throws(() => handlers.get('get-ui-settings')(miniEvent), /untrusted sender/)
  await verifyMiniDismissal(main)
  const mainContents = main.webContents
  const mainEvent = { sender: mainContents, senderFrame: mainContents.mainFrame }
  app.once('before-quit', () => {
    try {
      assert.throws(() => handlers.get('get-ui-settings')(mainEvent), /untrusted sender/)
      console.log('Destroyed windows and shutdown reject further IPC')
    } catch (error) {
      console.error(error.message)
      app.exit(1)
    }
  })
  assert.deepEqual(rendererErrors, [])
  console.log(
    'Tray, mini monitor, legacy history/settings, exports, policy updates, and IPC checks passed'
  )
}

const deadline = setTimeout(() => {
  console.error('Desktop smoke test timed out')
  app.exit(1)
}, 120_000)

void app
  .whenReady()
  .then(smoke)
  .then(() => {
    clearTimeout(deadline)
    app.quit()
  })
  .catch((error) => {
    console.error(error)
    app.exit(1)
  })
