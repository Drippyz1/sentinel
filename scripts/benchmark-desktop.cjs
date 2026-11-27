/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict')
const { mkdtempSync, rmSync, writeFileSync, statSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')
const { monitorEventLoopDelay } = require('node:perf_hooks')
const { setTimeout: wait } = require('node:timers/promises')
const { app, BrowserWindow, Tray } = require('electron')
const Database = require('better-sqlite3')
const si = require('systeminformation')
const {
  createObservations,
  documentState,
  startDomCounter,
  memory: checkpointMemory
} = require('./benchmark-observations.cjs')

const profile = mkdtempSync(join(tmpdir(), 'sentinel-benchmark-'))
const databasePath = join(profile, 'sentinel.db')
app.setPath('userData', profile)
app.setPath('sessionData', profile)
delete process.env.ELECTRON_RENDERER_URL

const scenarioMs = Number(process.env.SENTINEL_BENCH_SCENARIO_MS ?? 20_000)
const extendedMs = Number(process.env.SENTINEL_BENCH_EXTENDED_MS ?? 600_000)
const warmupMs = 4_000
const cadenceMs = 2_000
const detail = process.env.SENTINEL_BENCH_DETAIL === '1'
const reconciliation = process.env.SENTINEL_BENCH_RECONCILE
const reconcileWarmupMs = 20_000
const fixtureCadenceMs = detail ? 1000 : 2000
const fixtureRows = 86_400_000 / fixtureCadenceMs
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
        insert.run(now - (fixtureRows - i) * fixtureCadenceMs, 10 + (i % 41), 50 + (i % 9))
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

function accumulate(output, key, entry) {
  const bucket = (output[key] ??= { cpu: 0, workingSetMiB: 0, count: 0 })
  bucket.cpu += entry.cpu.percentCPUUsage
  bucket.workingSetMiB += (entry.memory?.workingSetSize ?? 0) / 1024
  bucket.count++
}

function processes(byWindowRole, observe) {
  const output = {}
  const roleByPid = new Map()
  if (byWindowRole) {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.webContents.getURL()) continue
      const pid = window.webContents.getOSProcessId()
      if (!pid) continue
      const role = windowRole(window)
      roleByPid.set(pid, roleByPid.has(pid) ? 'shared-window-renderer' : role)
    }
  }
  const metrics = app.getAppMetrics()
  observe?.(metrics)
  for (const entry of metrics) {
    accumulate(output, entry.type, entry)
    const role = roleByPid.get(entry.pid)
    if (role) accumulate(byWindowRole, role, entry)
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

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)]
}

function windowRole(window) {
  const url = window.webContents.getURL()
  if (!url) return 'pending'
  const hash = new URL(url).hash
  return hash === '#tray' ? 'tray' : hash === '#mini-monitor' ? 'mini' : 'main'
}

function visibleRoles() {
  return BrowserWindow.getAllWindows()
    .filter((window) => window.isVisible() && !window.isMinimized() && window.webContents.getURL())
    .map(windowRole)
    .sort()
}

async function measure(name, duration = scenarioMs, observation) {
  await wait(observation ? reconcileWarmupMs : warmupMs)
  if (observation) await startDomCounter(observation.dashboard)
  const beforeCalls = { ...collectorCalls }
  const beforeWire = { ...wire }
  const beforeRows = rowCount()
  processes()
  const start = performance.now()
  const samples = []
  const windowSamples = []
  const visibility = {}
  const focus = {}
  const timeline = []
  const loop = detail || observation ? monitorEventLoopDelay({ resolution: 10 }) : undefined
  loop?.enable()
  while (performance.now() - start < duration) {
    await wait(cadenceMs)
    const windowSample = detail || observation ? {} : undefined
    let record
    samples.push(
      processes(
        windowSample,
        observation &&
          ((metrics) => {
            record = {
              ms: Math.round(performance.now() - start),
              ...observation.instrument.sample(metrics),
              frames: wire.frames - beforeWire.frames,
              estimatedJsonBytes: wire.bytes - beforeWire.bytes
            }
          })
      )
    )
    if (record) {
      if (timeline.length % 5 === 0) record.document = await documentState(observation.dashboard)
      timeline.push(record)
    }
    if (windowSample) {
      windowSamples.push(windowSample)
      const key = visibleRoles().join(',') || 'none'
      visibility[key] = (visibility[key] ?? 0) + 1
      const active = BrowserWindow.getFocusedWindow()
      const focused = active?.webContents.getURL() ? windowRole(active) : 'none'
      focus[focused] = (focus[focused] ?? 0) + 1
    }
  }
  loop?.disable()
  const result = {
    name,
    durationMs: Math.round(performance.now() - start),
    samples: samples.length,
    ...(loop && {
      visibility,
      focus,
      byWindowRole: mean(windowSamples),
      eventLoopDelayMs: {
        p50: loop.percentile(50) / 1e6,
        p95: loop.percentile(95) / 1e6,
        max: loop.max / 1e6
      },
      workingSetMiB: {
        p50: percentile(
          samples.map((sample) =>
            Object.values(sample).reduce((sum, p) => sum + p.workingSetMiB, 0)
          ),
          0.5
        ),
        p95: percentile(
          samples.map((sample) =>
            Object.values(sample).reduce((sum, p) => sum + p.workingSetMiB, 0)
          ),
          0.95
        )
      }
    }),
    byProcessType: mean(samples),
    firstMinute: name === 'extended' || observation ? mean(samples.slice(0, 30)) : undefined,
    lastMinute: name === 'extended' || observation ? mean(samples.slice(-30)) : undefined,
    historyRows: rowCount() - beforeRows,
    frames: wire.frames - beforeWire.frames,
    estimatedJsonBytes: wire.bytes - beforeWire.bytes,
    collectorCalls: Object.fromEntries(
      Object.entries(collectorCalls).map(([key, value]) => [key, value - (beforeCalls[key] ?? 0)])
    )
  }
  console.log(JSON.stringify(result))
  return observation ? { ...result, timeline } : result
}

function writeReport(startup, results, extra = {}) {
  if (!process.env.SENTINEL_BENCH_OUTPUT) return
  const report = {
    platform: process.platform,
    architecture: process.arch,
    electron: process.versions.electron,
    node: process.versions.node,
    fixtureRows,
    settings: { cadenceMs, fixtureCadenceMs, warmupMs, scenarioMs, extendedMs },
    startup,
    results,
    ...extra
  }
  writeFileSync(process.env.SENTINEL_BENCH_OUTPUT, JSON.stringify(report, null, 2) + '\n')
}

async function run() {
  seedProfile()
  const start = performance.now()
  const instrument = reconciliation ? createObservations(windowRole) : undefined
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
  if (instrument) {
    assert.ok(
      reconciliation === 'fresh' || reconciliation === 'lifecycle',
      'Unknown reconciliation scenario'
    )
    assert.ok(
      extendedMs >= 600_000 || process.env.SENTINEL_BENCH_PREFLIGHT === '1',
      'Sustained run requires at least ten minutes'
    )
    dashboard.setSize(1200, 800)
    const checkpoints = [await instrument.checkpoint('initial-overview')]
    if (reconciliation === 'lifecycle') {
      await run('location.hash = "#/history"; true')
      await heading(dashboard, 'History')
      await until(
        () => run('Boolean(document.querySelector(".recharts-area-curve"))'),
        'history chart'
      )
      await wait(8_000)
      checkpoints.push(await instrument.checkpoint('history'))
      await run('location.hash = "#/processes"; true')
      await heading(dashboard, 'Processes')
      await wait(8_000)
      checkpoints.push(await instrument.checkpoint('processes'))
      await run('location.hash = "#/"; true')
      await heading(dashboard, 'Overview')
      dashboard.hide()
      openTray()
      const tray = await until(() => view('#tray'), 'tray')
      await heading(tray, 'Sentinel')
      await wait(6_000)
      checkpoints.push(await instrument.checkpoint('tray'))
      tray.hide()
      await run('window.electronAPI.showMiniMonitor()')
      const mini = await until(() => view('#mini-monitor'), 'mini')
      await heading(mini, 'Sentinel Mini Monitor')
      await wait(6_000)
      checkpoints.push(await instrument.checkpoint('mini'))
      await mini.webContents.executeJavaScript('window.electronAPI.hideMiniMonitor()')
      await until(() => mini.isDestroyed(), 'mini disposal')
    }
    dashboard.show()
    if (process.platform === 'darwin') app.focus({ steal: true })
    dashboard.focus()
    checkpoints.push(await instrument.checkpoint('sustained-enter'))
    const memoryBefore = await checkpointMemory(dashboard)
    const steady = await measure(reconciliation, extendedMs, { dashboard, instrument })
    const memoryAfter = await checkpointMemory(dashboard)
    checkpoints.push(await instrument.checkpoint('sustained-exit'))
    writeReport(startup, [steady], {
      reconciliation,
      warmupMs: reconcileWarmupMs,
      checkpoints,
      memoryBefore,
      memoryAfter,
      lifecycle: instrument.lifecycle,
      build: process.env.SENTINEL_BENCH_BUILD_ID ?? null
    })
    return
  }
  if (process.env.SENTINEL_BENCH_STARTUP_ONLY === '1') return
  if (process.env.SENTINEL_BENCH_OVERVIEW_ONLY === '1') {
    dashboard.setSize(1200, 800)
    dashboard.show()
    if (process.platform === 'darwin') app.focus({ steal: true })
    dashboard.focus()
    writeReport(startup, [await measure('overview-focused')])
    return
  }
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
  let historyRequests
  let memory
  if (detail) {
    const timings = []
    let rows
    const loop = monitorEventLoopDelay({ resolution: 10 })
    loop.enable()
    for (let i = 0; i < 12; i++) {
      await wait(50)
      const start = performance.now()
      rows = await run('window.electronAPI.getHistoryDownsampled(1440).then(rows => rows.length)')
      timings.push(performance.now() - start)
    }
    loop.disable()
    historyRequests = {
      rows,
      samples: timings.length,
      p50Ms: percentile(timings, 0.5),
      p95Ms: percentile(timings, 0.95),
      eventLoopMaxMs: loop.max / 1e6
    }
    const info = await process.getProcessMemoryInfo()
    const debuggerClient = dashboard.webContents.debugger
    debuggerClient.attach('1.3')
    try {
      const rendererHeap = await debuggerClient.sendCommand('Runtime.getHeapUsage')
      memory = {
        mainPrivateKiB: info.private,
        mainSharedKiB: info.shared,
        mainRssBytes: process.memoryUsage.rss(),
        mainHeapBytes: process.memoryUsage().heapUsed,
        rendererHeapBytes: rendererHeap.usedSize
      }
    } finally {
      debuggerClient.detach()
    }
  }

  await run('location.hash = "#/processes"; true')
  await heading(dashboard, 'Processes')
  results.push(await measure('processes'))

  await run('location.hash = "#/"; true')
  await heading(dashboard, 'Overview')
  if (detail) {
    dashboard.minimize()
    await until(() => dashboard.isMinimized(), 'actual minimized window')
    const minimized = await measure('minimized')
    assert.equal(minimized.frames, 0)
    assert.ok(minimized.historyRows > 0)
    results.push(minimized)
    dashboard.restore()
  }
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
  await mini.webContents.executeJavaScript('window.electronAPI.hideMiniMonitor()')

  const auxiliary = []
  if (detail) {
    await until(() => !view('#mini-monitor'), 'hidden mini disposal')
    for (let i = 0; i < 3; i++) {
      const start = performance.now()
      openTray()
      await until(() => tray.isVisible(), 'tray reopen')
      const trayReopenMs = performance.now() - start
      tray.hide()
      await run('window.electronAPI.showMiniMonitor()')
      const reopened = await until(() => view('#mini-monitor'), 'mini reopen')
      await heading(reopened, 'Sentinel Mini Monitor')
      await reopened.webContents.executeJavaScript('window.electronAPI.hideMiniMonitor()')
      await until(() => !view('#mini-monitor'), 'mini re-disposal')
      auxiliary.push({ trayReopenMs, hiddenWorkingSetByType: processes() })
    }
  }

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

  writeReport(startup, results, detail ? { historyRequests, memory, auxiliary } : undefined)
}

const deadline = setTimeout(
  () => {
    console.error('Desktop benchmark timed out')
    app.exit(1)
  },
  extendedMs + 8 * (scenarioMs + warmupMs) + 90_000
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
