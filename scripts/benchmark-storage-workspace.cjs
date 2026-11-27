/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { mkdir, writeFile } = require('node:fs/promises')
const { join, basename, resolve } = require('node:path')
const { setTimeout: wait } = require('node:timers/promises')
const { monitorEventLoopDelay, PerformanceObserver } = require('node:perf_hooks')
const { app, BrowserWindow, dialog, ipcMain, powerMonitor } = require('electron')
const threads = require('node:worker_threads')
const Database = require('better-sqlite3')

const build = process.env.SENTINEL_BENCH_BUILD_ID
assert.match(build ?? '', /^[a-f\d]{64}$/)
const output = process.env.SENTINEL_STORAGE_REPORT
assert.ok(output)
const stage = fs.mkdtempSync(join(fs.realpathSync('/tmp'), 'sentinel-workspace-bench-'))
const profile = join(stage, 'profile')
fs.mkdirSync(profile)
fs.writeFileSync(
  join(profile, 'settings.json'),
  JSON.stringify({ settingsVersion: 1, pollIntervalMs: 1000, anomalyNotifications: false })
)
app.setPath('userData', profile)
app.setPath('sessionData', profile)
delete process.env.ELECTRON_RENDERER_URL
let selection,
  frames = 0
const workers = new Map()
process.on('uncaughtException', (error) => {
  console.error(error)
  app.exit(1)
})
let launched = 0,
  exited = 0
const Worker = threads.Worker
threads.Worker = class extends Worker {
  constructor(entry, options) {
    const probe = basename(entry) === 'storage-scan.js' ? new SharedArrayBuffer(4) : null
    super(
      probe
        ? `
      const { workerData } = require('node:worker_threads');
      const probe = new Int32Array(workerData.probe);
      setInterval(() => Atomics.store(probe, 0, Math.round(process.memoryUsage().heapUsed / 1024)), 200).unref();
      require(workerData.entry);
    `
        : entry,
      probe
        ? { ...options, eval: true, workerData: { ...options.workerData, entry, probe } }
        : options
    )
    if (!probe) return
    workers.set(this, new Int32Array(probe))
    launched++
    this.once('exit', () => {
      exited++
      workers.delete(this)
    })
  }
}
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selection] })
const register = ipcMain.handle.bind(ipcMain)
let traffic = {}
ipcMain.handle = (channel, handler) =>
  register(channel, async (event, ...args) => {
    const result = await handler(event, ...args)
    if (channel.startsWith('storage-')) {
      const channelStats = (traffic[channel] ??= { count: 0, bytes: 0, maxBytes: 0 })
      const bytes = Buffer.byteLength(JSON.stringify(result ?? null))
      channelStats.count++
      channelStats.bytes += bytes
      channelStats.maxBytes = Math.max(bytes, channelStats.maxBytes)
    }
    return result
  })
app.on('browser-window-created', (_, win) => {
  const send = win.webContents.send.bind(win.webContents)
  win.webContents.send = (channel, ...args) => {
    if (channel === 'metrics-updated') frames++
    return send(channel, ...args)
  }
})
require(resolve(process.env.SENTINEL_BENCH_MAIN ?? join(__dirname, '../out/main/index.js')))
app.once('quit', () => fs.rmSync(stage, { recursive: true, force: true, maxRetries: 3 }))

const query = {
  folder: 0,
  selected: null,
  view: 'folder',
  basis: 'logical',
  kind: 'all',
  category: null,
  text: '',
  sort: 'size',
  direction: 'desc',
  page: 0
}

async function until(fn, description, timeout = 120_000) {
  const end = performance.now() + timeout
  while (performance.now() < end) {
    const value = await fn()
    if (value) return value
    await wait(100)
  }
  throw new Error(`Timed out: ${description}`)
}

async function createFixture(name, files, folders) {
  const root = join(stage, name)
  await mkdir(root)
  const sizes = Array.from({ length: 23 }, (_, index) => Buffer.alloc(52 + index * 13, 65))
  for (let dir = 0; dir < folders; dir++) {
    const path = folders === 1 ? root : join(root, `Group-${dir}`)
    if (folders > 1) await mkdir(path)
    for (let start = dir; start < files; start += folders * 32) {
      await Promise.all(
        Array.from({ length: 32 }, (_, k) => start + k * folders)
          .filter((n) => n < files)
          .map((n) => writeFile(join(path, `fixture-${n}.dat`), sizes[n % sizes.length]))
      )
    }
  }
  return root
}

function historyCount() {
  const db = new Database(join(profile, 'sentinel.db'), { readonly: true })
  try {
    return db.prepare('SELECT count(*) AS n FROM metric_snapshots').get().n
  } finally {
    db.close()
  }
}

function latency() {
  const loop = monitorEventLoopDelay({ resolution: 10 })
  loop.enable()
  let last = performance.now(),
    stalls = 0,
    gc = 0,
    maxGc = 0
  const clock = setInterval(() => {
    const now = performance.now()
    if (now - last >= 100) stalls++
    last = now
  }, 20)
  const gcObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      gc++
      maxGc = Math.max(maxGc, entry.duration)
    }
  })
  gcObserver.observe({ entryTypes: ['gc'] })
  return () => {
    clearInterval(clock)
    gcObserver.disconnect()
    loop.disable()
    return {
      p95Ms: loop.percentile(95) / 1e6,
      maxMs: loop.max / 1e6,
      intervalsAtLeast100ms: stalls,
      gc,
      maxGc
    }
  }
}

async function run() {
  await app.whenReady()
  const main = await until(
    () => BrowserWindow.getAllWindows().find((win) => win.webContents.getURL().startsWith('file:')),
    'main'
  )
  main.setContentSize(1200, 800)
  main.setIgnoreMouseEvents(true)
  main.webContents.on('before-input-event', (event) => event.preventDefault())
  main.show()
  main.focus()
  if (process.platform === 'darwin') app.focus({ steal: true })
  const runInRenderer = (source) => main.webContents.executeJavaScript(source)
  const call = (method, ...args) =>
    runInRenderer(`window.electronAPI.${method}(...${JSON.stringify(args)})`)
  await runInRenderer('location.hash = "#/storage"; true')
  await until(
    () => runInRenderer('document.querySelector("main h2")?.textContent === "Storage Explorer"'),
    'storage route'
  )
  let foreground = 0
  const runs = []
  for (const [name, files, folders] of [
    ['continuity', 24000, 60],
    ['wide-limit', 126000, 1]
  ]) {
    selection = await createFixture(`Synthetic ${name}`, files, folders)
    console.log(JSON.stringify({ phase: 'fixture-ready', name, files }))
    await wait(1000)
    traffic = {}
    const chosen = await call('chooseStorageScope')
    assert.ok(chosen)
    await runInRenderer(`(() => {
      const trace = globalThis.__frames161 = { count:0, max:0, long:0, last: performance.now(), running:true };
      const tick = (now) => {
        if (!trace.running) return;
        const time = now - trace.last;
        trace.count++; trace.max = Math.max(trace.max, time);
        if (time >= 100) trace.long++;
        trace.last = now; requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick); return true;
    })()`)
    const earlier = { rows: historyCount(), frames, rss: process.memoryUsage.rss() }
    const start = performance.now()
    const cpu = process.cpuUsage()
    const endLatency = latency()
    const scan = await call('startStorageScan', chosen.id)
    console.log(JSON.stringify({ phase: 'scan-started', name, state: scan.state }))
    const statusMs = [],
      heap = []
    let peakRss = earlier.rss
    const result = await until(async () => {
      if (main.isFocused()) foreground++
      const from = performance.now()
      const current = await call('getStorageSession')
      statusMs.push(performance.now() - from)
      peakRss = Math.max(peakRss, process.memoryUsage.rss())
      const probe = workers.values().next().value
      if (probe) heap.push(Atomics.load(probe, 0) * 1024)
      if (current?.state === 'failed') throw new Error('Storage worker failed')
      if (current?.totals) return current
      return null
    }, name)
    if (name === 'wide-limit') {
      assert.equal(result.indexed, 120000)
      assert.equal(result.skipped.entryLimit, 1)
      assert.equal(result.state, 'partial')
    } else assert.equal(result.totals.files, files)
    const duration = performance.now() - start
    console.log(JSON.stringify({ phase: 'scan-complete', name, indexed: result.indexed }))
    const cpuReading = process.cpuUsage(cpu)
    const after = { rows: historyCount(), frames, rss: process.memoryUsage.rss() }
    const queryTimes = []
    for (const [label, patch] of [
      ['folder', {}],
      ['search', { view: 'search', text: 'fixture' }],
      ['sortName', { view: 'search', text: 'fixture', sort: 'name' }],
      ['sortNameCachedPage', { view: 'search', text: 'fixture', sort: 'name', page: 1 }],
      ['sortAllocated', { view: 'search', text: 'fixture', basis: 'allocated', sort: 'size' }],
      ['select', { selected: 1 }]
    ]) {
      const at = performance.now()
      const page = await until(
        () => call('queryStorageScan', scan.id, { ...query, ...patch }),
        label
      )
      queryTimes.push({
        label,
        elapsedMs: performance.now() - at,
        matches: page.matches,
        rows: page.rows.length,
        bytes: Buffer.byteLength(JSON.stringify(page))
      })
    }
    const renderer = await runInRenderer(
      'globalThis.__frames161.running = false; globalThis.__frames161'
    )
    const finishedLatency = endLatency()
    const captures = process.env.SENTINEL_STORAGE_CAPTURES
    if (captures && name === 'wide-limit') {
      await runInRenderer('location.hash = "#/"; true')
      await until(
        () => runInRenderer('document.querySelector("main h2")?.textContent === "Overview"'),
        'overview'
      )
      await runInRenderer('location.hash = "#/storage"; true')
      await until(
        () => runInRenderer('Boolean(document.querySelector(".storage-table tbody tr"))'),
        'limited workspace'
      )
      await runInRenderer('document.querySelector(".storage-coverage").open = true; true')
      const screenshot = await main.webContents.capturePage()
      assert.ok(!screenshot.isEmpty())
      fs.mkdirSync(captures, { recursive: true })
      fs.writeFileSync(join(captures, '14-entry-limit.png'), screenshot.toPNG())
    }
    const dropStart = performance.now()
    await call('dropStorageScan', scan.id)
    const disposalMs = performance.now() - dropStart
    assert.equal(await call('getStorageSession'), null)
    assert.equal(launched, exited)
    const postDisposalRss = process.memoryUsage.rss()
    let cancellation = null
    if (name === 'wide-limit') {
      const again = await call('chooseStorageScope')
      const restarted = await call('startStorageScan', again.id)
      await until(
        async () => (await call('getStorageSession'))?.processed > 0,
        'progress before cancellation'
      )
      const at = performance.now()
      await call('cancelStorageScan', restarted.id)
      const stopped = await until(async () => {
        const session = await call('getStorageSession')
        return session?.state === 'cancelled' && session
      }, 'cancelled')
      cancellation = {
        observedMs: performance.now() - at,
        indexed: stopped.indexed,
        partial: Boolean(stopped.totals)
      }
      await call('dropStorageScan', restarted.id)
    }
    runs.push({
      name,
      files,
      folders,
      contentBytesPerFile: [52, 338],
      duration,
      workerElapsedMs: result.elapsedMs,
      indexed: result.indexed,
      processed: result.processed,
      state: result.state,
      skipped: result.skipped,
      peakOpenDirectories: result.peakOpenDirectories,
      maxPendingDirectoryQueue: 0,
      mainRss: {
        before: earlier.rss,
        peak: peakRss,
        finished: after.rss,
        afterDisposal: postDisposalRss
      },
      workerHeapSamples: heap,
      cpuMicros: cpuReading.user + cpuReading.system,
      monitoringFrames: after.frames - earlier.frames,
      historyRows: after.rows - earlier.rows,
      loop: finishedLatency,
      renderer,
      statusMs,
      queryTimes,
      traffic,
      disposalMs,
      cancellation
    })
  }
  assert.equal(launched, exited)
  fs.writeFileSync(
    output,
    JSON.stringify(
      {
        build,
        runs,
        launched,
        exited,
        foreground,
        battery: powerMonitor.isOnBatteryPower(),
        thermal: powerMonitor.getCurrentThermalState(),
        display: main.getContentSize(),
        electron: process.versions.electron
      },
      null,
      2
    ) + '\n'
  )
  console.log(
    'PASS: two native workloads, capacity limit, pagination, cancellation, and worker disposal.'
  )
}

void run()
  .then(() => app.quit())
  .catch((error) => {
    console.error(error)
    app.quit()
    process.exitCode = 1
  })
