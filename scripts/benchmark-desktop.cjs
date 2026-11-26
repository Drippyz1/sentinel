/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict')
const { mkdtempSync, rmSync, writeFileSync, statSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')
const { setTimeout: wait } = require('node:timers/promises')
const { app, BrowserWindow, Tray } = require('electron')
const Database = require('better-sqlite3')
const si = require('systeminformation')

const profile = mkdtempSync(join(tmpdir(), 'sentinel-benchmark-'))
const databasePath = join(profile, 'sentinel.db')
app.setPath('userData', profile)
app.setPath('sessionData', profile)
delete process.env.ELECTRON_RENDERER_URL

const scenarioMs = Number(process.env.SENTINEL_BENCH_SCENARIO_MS ?? 20_000)
const extendedMs = Number(process.env.SENTINEL_BENCH_EXTENDED_MS ?? 600_000)
const warmupMs = 4_000
const cadenceMs = 2_000
const fixtureRows = 43_200
const collectorCalls = {}
const wire = { frames: 0, bytes: 0 }

function seedProfile() {
  writeFileSync(
    join(profile, 'settings.json'),
    JSON.stringify({
      settingsVersion: 1,
      pollIntervalMs: cadenceMs,
      anomalyNotifications: false,
      ui: { historyRangeMinutes: 1440 }
    })
  )
  const db = new Database(databasePath)
  try {
    db.exec(`
      CREATE TABLE metric_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp INTEGER NOT NULL,
        cpu_usage REAL, memory_usage REAL, memory_used INTEGER, disk_usage REAL,
        disk_read REAL, disk_write REAL, disk_io_in_bytes INTEGER,
        net_down REAL, net_up REAL, gpu_usage REAL, battery REAL
      );
    `)
    const insert = db.prepare(`
      INSERT INTO metric_snapshots (
        timestamp, cpu_usage, memory_usage, memory_used, disk_usage, disk_read, disk_write,
        disk_io_in_bytes, net_down, net_up, gpu_usage, battery
      ) VALUES (?, ?, ?, 6000000000, 50, 10240, 20480, 1, 8096, 4096, 10, 80)
    `)
    const now = Date.now()
    db.transaction(() => {
      for (let i = 0; i < fixtureRows; i++) {
        insert.run(now - (fixtureRows - i) * cadenceMs, 10 + (i % 41), 50 + (i % 9))
      }
    })()
  } finally {
    db.close()
  }
}

for (const key of [
  'cpu',
  'currentLoad',
  'cpuTemperature',
  'mem',
  'fsSize',
  'fsStats',
  'disksIO',
  'networkStats',
  'networkInterfaces',
  'graphics',
  'battery',
  'processes'
]) {
  const original = si[key]
  si[key] = (...args) => {
    collectorCalls[key] = (collectorCalls[key] ?? 0) + 1
    return original(...args)
  }
}

let openTray
const addTrayListener = Tray.prototype.on
Tray.prototype.on = function (event, listener) {
  if (event === 'click') {
    openTray = () => this.emit('click')
    Tray.prototype.on = addTrayListener
  }
  return addTrayListener.call(this, event, listener)
}
app.on('browser-window-created', (_, window) => {
  const contents = window.webContents
  const send = contents.send.bind(contents)
  contents.send = (channel, ...args) => {
    if (channel === 'metrics-updated' || channel === 'process-metrics-updated') {
      wire.frames++
      wire.bytes += Buffer.byteLength(JSON.stringify(args[0]))
    }
    send(channel, ...args)
  }
})
app.on('quit', () => {
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 5 })
  } catch {
    console.warn('Could not remove temporary benchmark profile')
  }
})

const bundle = resolve(process.env.SENTINEL_BENCH_MAIN ?? join(__dirname, '../out/main/index.js'))

function view(hash) {
  return BrowserWindow.getAllWindows().find((window) => {
    const url = window.webContents.getURL()
    return url.startsWith('file:') && new URL(url).hash === hash
  })
}

async function until(check, label) {
  const deadline = performance.now() + 15_000
  do {
    const result = await check()
    if (result) return result
    await wait(100)
  } while (performance.now() < deadline)
  throw new Error(`Timed out waiting for ${label}`)
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

function rowCount() {
  const db = new Database(databasePath, { readonly: true, fileMustExist: true })
  try {
    return db.prepare('SELECT COUNT(*) AS count FROM metric_snapshots').pluck().get()
  } finally {
    db.close()
  }
}

function processes() {
  const output = {}
  for (const entry of app.getAppMetrics()) {
    const bucket = (output[entry.type] ??= { cpu: 0, workingSetMiB: 0, count: 0 })
    bucket.cpu += entry.cpu.percentCPUUsage
    bucket.workingSetMiB += (entry.memory?.workingSetSize ?? 0) / 1024
    bucket.count++
  }
  return output
}

function mean(samples) {
  const totals = {}
  for (const sample of samples) {
    for (const [type, stats] of Object.entries(sample)) {
      const target = (totals[type] ??= { cpu: 0, workingSetMiB: 0, count: 0 })
      for (const [key, value] of Object.entries(stats)) target[key] += value
    }
  }
  return Object.fromEntries(
    Object.entries(totals).map(([type, stats]) => [
      type,
      Object.fromEntries(
        Object.entries(stats).map(([key, value]) => [
          key,
          Number((value / samples.length).toFixed(2))
        ])
      )
    ])
  )
}

async function measure(name, duration = scenarioMs) {
  await wait(warmupMs)
  const beforeCalls = { ...collectorCalls }
  const beforeWire = { ...wire }
  const beforeRows = rowCount()
  processes()
  const start = performance.now()
  const samples = []
  while (performance.now() - start < duration) {
    await wait(cadenceMs)
    samples.push(processes())
  }
  const result = {
    name,
    durationMs: Math.round(performance.now() - start),
    samples: samples.length,
    byProcessType: mean(samples),
    firstMinute: name === 'extended' ? mean(samples.slice(0, 30)) : undefined,
    lastMinute: name === 'extended' ? mean(samples.slice(-30)) : undefined,
    historyRows: rowCount() - beforeRows,
    frames: wire.frames - beforeWire.frames,
    estimatedJsonBytes: wire.bytes - beforeWire.bytes,
    collectorCalls: Object.fromEntries(
      Object.entries(collectorCalls).map(([key, value]) => [key, value - (beforeCalls[key] ?? 0)])
    )
  }
  console.log(JSON.stringify(result))
  return result
}

async function run() {
  seedProfile()
  const start = performance.now()
  require(bundle)
  await app.whenReady()
  const dashboard = await until(() => view('') ?? view('#/'), 'dashboard')
  const run = (js) => dashboard.webContents.executeJavaScript(js)
  await heading(dashboard, 'Overview')
  const renderedMs = Math.round(performance.now() - start)
  await until(
    () =>
      run(
        'window.electronAPI.getLatestMetrics().then(s => Boolean(s.cpu && s.memory && s.disk.drives.length))'
      ),
    'first CPU, memory and disk readings'
  )
  const firstMetricsMs = Math.round(performance.now() - start)
  const startup = { renderedMs, firstMetricsMs, mainBundleBytes: statSync(bundle).size }
  console.log(JSON.stringify({ startup }))
  const captureDirectory = process.env.SENTINEL_BENCH_CAPTURE_DIR
  if (captureDirectory) {
    dashboard.setSize(1440, 1000)
    await run(`window.electronAPI.saveUiSettings({
      dashboardWidgetOrder: ['disk', 'cpu', 'memory', 'gpu', 'battery', 'anomalies', 'network'],
      dashboardWidgets: { network: false }
    })`)
    await wait(warmupMs)
    writeFileSync(join(captureDirectory, 'dashboard.png'), (await dashboard.capturePage()).toPNG())
  }
  const results = captureDirectory ? [] : [await measure('dashboard')]

  await run('location.hash = "#/history"; true')
  await heading(dashboard, 'History')
  await until(() => run('Boolean(document.querySelector(".recharts-surface"))'), 'historical chart')
  if (captureDirectory) {
    await wait(400)
    writeFileSync(join(captureDirectory, 'history.png'), (await dashboard.capturePage()).toPNG())
    return
  }
  results.push(await measure('history'))

  await run('location.hash = "#/processes"; true')
  await heading(dashboard, 'Processes')
  results.push(await measure('processes'))

  await run('location.hash = "#/"; true')
  await heading(dashboard, 'Overview')
  dashboard.hide()
  assert.ok(openTray)
  openTray()
  const tray = await until(() => view('#tray'), 'tray')
  await heading(tray, 'Sentinel')
  assert.ok(tray.isVisible())
  results.push(await measure('tray'))
  tray.hide()

  await run('window.electronAPI.showMiniMonitor()')
  const mini = await until(() => view('#mini-monitor'), 'mini monitor')
  await heading(mini, 'Sentinel Mini Monitor')
  assert.ok(mini.isVisible())
  results.push(await measure('mini'))
  await run('window.electronAPI.hideMiniMonitor()')

  dashboard.show()
  assert.equal(
    await run('window.electronAPI.saveUiSettings({ dashboardPollingPaused: true })'),
    true
  )
  const paused = await measure('paused')
  assert.equal(paused.frames, 0)
  assert.ok(paused.historyRows > 0)
  results.push(paused)
  assert.equal(
    await run('window.electronAPI.saveUiSettings({ dashboardPollingPaused: false })'),
    true
  )
  dashboard.hide()
  const background = await measure('background')
  assert.ok(background.historyRows > 0)
  results.push(background)
  dashboard.show()
  if (extendedMs > 0) results.push(await measure('extended', extendedMs))

  const report = {
    platform: process.platform,
    architecture: process.arch,
    electron: process.versions.electron,
    fixtureRows,
    settings: { cadenceMs, warmupMs, scenarioMs, extendedMs },
    startup,
    results
  }
  if (process.env.SENTINEL_BENCH_OUTPUT) {
    writeFileSync(process.env.SENTINEL_BENCH_OUTPUT, JSON.stringify(report, null, 2) + '\n')
  }
}

const deadline = setTimeout(
  () => {
    console.error('Desktop benchmark timed out')
    app.exit(1)
  },
  extendedMs + 7 * (scenarioMs + warmupMs) + 90_000
)

void run()
  .then(() => {
    clearTimeout(deadline)
    app.quit()
  })
  .catch((error) => {
    console.error(error)
    app.exit(1)
  })
