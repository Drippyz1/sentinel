/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict')
const { mkdtempSync, rmSync, statfsSync, writeFileSync } = require('node:fs')
const { tmpdir, totalmem, uptime } = require('node:os')
const { join } = require('node:path')
const { setTimeout: wait } = require('node:timers/promises')
const { app, BrowserWindow, ipcMain, Tray } = require('electron')
const si = require('systeminformation')

const profile = mkdtempSync(join(tmpdir(), 'sentinel-smoke-'))
app.setPath('userData', profile)
app.setPath('sessionData', profile)
delete process.env.ELECTRON_RENDERER_URL
const legacyTimestamp = Date.now() - 90_000
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
const originalHandle = ipcMain.handle.bind(ipcMain)
ipcMain.handle = (channel, listener) => {
  registeredIpc.add(channel)
  return originalHandle(channel, listener)
}
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

async function smoke() {
  const started = Date.now()
  const main = await until(() => view('') ?? view('#/'), 'main window')
  await heading(main, 'Overview')
  const dashboardReadyMs = Date.now() - started
  const run = (js) => main.webContents.executeJavaScript(js)

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
        'window.electronAPI.getSettings().then(settings => settings.ui.dashboardPollingPaused)'
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
  const selectedProcess = processMetrics.list.find(
    (entry) => entry.pid > 1 && entry.pid !== process.pid
  )
  assert.ok(selectedProcess)
  const details = await run(`window.electronAPI.getProcessDetails(${selectedProcess.pid})`)
  assert.equal(details?.pid, selectedProcess.pid)
  const connections = await run('window.electronAPI.getNetworkConnections()')
  assert.ok(Array.isArray(connections.connections) && connections.collectedAt > 0)
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
  const settings = await run('window.electronAPI.getSettings()')
  assert.equal(settings.ui.historyView, 'table')
  assert.deepEqual(settings.collectionIntervalsMs, {})
  const save = await run(`
    window.electronAPI.getSettings().then(settings => window.electronAPI.saveSettings({
      ...settings,
      tempUnit: 'F',
      collectionIntervalsMs: { processes: 1000 }
    }))
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
    tray.webContents.executeJavaScript('window.electronAPI.saveSettings({})'),
    /untrusted sender/
  )
  await run('window.electronAPI.showMiniMonitor()')
  const mini = await until(() => view('#mini-monitor'), 'mini monitor window')
  await heading(mini, 'Sentinel Mini Monitor')
  assert.equal(mini.webContents.getLastWebPreferences().sandbox, true)
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
