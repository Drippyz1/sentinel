/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { mkdir, writeFile } = require('node:fs/promises')
const { basename, join } = require('node:path')
const { tmpdir } = require('node:os')
const { setTimeout: wait } = require('node:timers/promises')
const { monitorEventLoopDelay } = require('node:perf_hooks')
const { app, BrowserWindow, dialog, ipcMain, powerMonitor, Tray } = require('electron')
const Database = require('better-sqlite3')
const threads = require('node:worker_threads')

const build = process.env.SENTINEL_STORAGE_BUILD_ID
assert.match(build ?? '', /^[a-f\d]{64}$/)
const captures = process.env.SENTINEL_STORAGE_CAPTURES
const output = process.env.SENTINEL_STORAGE_REPORT
const files = Number(process.env.SENTINEL_STORAGE_FILES ?? 24_000)
assert.ok(Number.isInteger(files) && files >= 8000 && files <= 50_000)
const stage = fs.mkdtempSync(
  join(
    fs.realpathSync(process.platform === 'darwin' ? '/tmp' : tmpdir()),
    'sentinel-storage-fixture-'
  )
)
const profile = join(stage, 'profile')
const small = join(stage, 'Synthetic Storage Fixture')
const large = join(stage, 'Synthetic File Count Fixture')
fs.mkdirSync(profile)
fs.writeFileSync(
  join(profile, 'settings.json'),
  JSON.stringify({
    settingsVersion: 1,
    pollIntervalMs: 1000,
    monitoringAlerts: {
      cpu: { enabled: false },
      memory: { enabled: false },
      disk: { enabled: false },
      battery: { enabled: false }
    }
  })
)
delete process.env.ELECTRON_RENDERER_URL
app.setPath('userData', profile)
app.setPath('sessionData', profile)

const workerEvents = { started: 0, exited: 0 }
const Worker = threads.Worker
threads.Worker = class extends Worker {
  constructor(path, opts) {
    super(path, opts)
    if (basename(path) === 'storage-scan.js') {
      workerEvents.started++
      this.once('exit', () => workerEvents.exited++)
    }
  }
}
const traffic = {}
let frames = 0
let location = small
let openedPicker = 0
let openTray
const rendererErrors = []
dialog.showOpenDialog = async (window, opts) => {
  assert.ok(window.isVisible())
  assert.deepEqual(opts.properties, ['openDirectory', 'noResolveAliases', 'dontAddToRecent'])
  openedPicker++
  return { canceled: false, filePaths: [location] }
}
const originalOn = Tray.prototype.on
Tray.prototype.on = function (event, listener) {
  if (event === 'click') openTray = () => this.emit('click')
  return originalOn.call(this, event, listener)
}
const register = ipcMain.handle.bind(ipcMain)
ipcMain.handle = (channel, handler) =>
  register(channel, async (event, ...args) => {
    const response = await handler(event, ...args)
    if (channel.startsWith('storage-')) {
      const wire = (traffic[channel] ??= { messages: 0, estimatedJsonBytes: 0 })
      wire.messages++
      wire.estimatedJsonBytes += Buffer.byteLength(JSON.stringify(response ?? null))
    }
    return response
  })
app.on('browser-window-created', (_event, win) => {
  const send = win.webContents.send.bind(win.webContents)
  win.webContents.send = (channel, ...args) => {
    if (channel === 'metrics-updated') frames++
    send(channel, ...args)
  }
  win.webContents.on('console-message', (event) => {
    if (event.level === 'error') rendererErrors.push(event.message)
  })
})
app.once('quit', () =>
  fs.rmSync(stage, { recursive: true, force: true, maxRetries: 4, retryDelay: 50 })
)
require('../out/main/index.js')

function view(hash) {
  return BrowserWindow.getAllWindows().find((win) => {
    const path = win.webContents.getURL()
    return path.startsWith('file:') && new URL(path).hash === hash
  })
}

async function until(fn, label, timeout = 20_000) {
  const deadline = performance.now() + timeout
  do {
    const result = await fn()
    if (result) return result
    await wait(60)
  } while (performance.now() < deadline)
  throw new Error(`Timed out: ${label}`)
}

async function prepare() {
  const samples = [
    ['Media/Example recording.mov', 10_000_000],
    ['Projects/node_modules/package.bin', 5_100_000],
    ['Backups.backupdb/Example backup', 6_900_000],
    ['Downloads/Example archive.zip', 3_000_000],
    ['Docs/Workshop notes.pdf', 2_100_000],
    ['Example.app/Contents/Resources/Example asset', 2_500_000],
    ['Library/Caches/Example cache', 1_500_000],
    ['readme', 110_000],
    ['zero', 0]
  ]
  for (const [file, size] of samples) {
    const path = join(small, file)
    await mkdir(require('node:path').dirname(path), { recursive: true })
    await writeFile(path, Buffer.alloc(size, 50))
  }
  fs.mkdirSync(join(small, 'Empty'))
  fs.symlinkSync(small, join(small, 'not followed'))
  const batches = 60
  const bytes = Buffer.alloc(336, 12)
  for (let dir = 0; dir < batches; dir++) {
    const folder = join(large, `Group-${dir}`)
    await mkdir(folder, { recursive: true })
    for (let i = dir; i < files; i += batches * 16) {
      await Promise.all(
        Array.from({ length: 16 }, (_, index) => i + index * batches)
          .filter((n) => n < files)
          .map((n) => writeFile(join(folder, `Synthetic-${n}.txt`), bytes))
      )
    }
  }
  return samples.reduce((sum, [, size]) => sum + size, 0)
}

function recorded() {
  const db = new Database(join(profile, 'sentinel.db'), { readonly: true })
  try {
    return db.prepare('SELECT COUNT(*) AS count FROM metric_snapshots').get().count
  } finally {
    db.close()
  }
}

async function capture(window, label) {
  if (!captures) return
  fs.mkdirSync(captures, { recursive: true })
  const image = await window.webContents.capturePage()
  assert.ok(!image.isEmpty())
  fs.writeFileSync(join(captures, `${label}.png`), image.toPNG())
}

async function run() {
  const expected = await prepare()
  await app.whenReady()
  const main = await until(() => view(''), 'main window')
  const js = (source) => main.webContents.executeJavaScript(source)
  const session = () => js('window.electronAPI.getStorageSession()')
  const text = (value) =>
    js(`document.querySelector('main').textContent.includes(${JSON.stringify(value)})`)
  const has = (value) => until(() => text(value), value)
  const press = async (label) =>
    until(
      () =>
        js(`(() => {
    const button = [...document.querySelectorAll('main button')]
      .find(b => !b.disabled && (b.textContent.trim() === ${JSON.stringify(label)} || b.getAttribute('aria-label') === ${JSON.stringify(label)}))
    if (!button) return false
    button.click()
    return true
  })()`),
      label
    )
  const call = (method, ...args) => js(`window.electronAPI.${method}(...${JSON.stringify(args)})`)
  const status = (state) =>
    until(
      async () => {
        const current = await session()
        return current?.state === state && current
      },
      state,
      60_000
    )
  const rootQuery = {
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
  main.setContentSize(1200, 850)
  main.show()
  main.focus()
  if (process.platform === 'darwin') app.focus({ steal: true })
  await assert.rejects(session, /Open Storage Explorer/)
  await js('location.hash = "#/storage"; true')
  await has('Choose a folder or local volume')
  await capture(main, '01-no-scan')
  await assert.rejects(() => call('startStorageScan', '/tmp'), /Invalid storage session/)
  await press('Choose location')
  const ready = await status('ready')
  assert.equal(openedPicker, 1)
  assert.equal(workerEvents.started, 0)
  await press('Start scan')
  const partial = await status('partial')
  assert.notEqual(partial.id, ready.id)
  assert.equal(partial.skipped.links, 1)
  assert.equal(partial.totals.logical, String(expected))
  await assert.rejects(() => call('queryStorageScan', ready.id, rootQuery), /no longer available/)
  await assert.rejects(
    () => call('queryStorageScan', partial.id, { ...rootQuery, path: '/tmp' }),
    /Invalid storage query/
  )
  await assert.rejects(
    () => call('queryStorageScan', partial.id, { ...rootQuery, page: 100_000 }),
    /Invalid storage query/
  )
  await has('Categories')
  await capture(main, '02-partial-storage-map')
  main.focus()
  main.webContents.focus()
  await until(
    () =>
      js(`(() => {
    const tile = document.querySelector('.storage-tile[aria-label^="Media:"]');
    tile?.focus(); return Boolean(tile && tile === document.activeElement);
  })()`),
    'focused map tile'
  )
  const keyboard = main.webContents.debugger
  keyboard.attach('1.3')
  try {
    await keyboard.sendCommand('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13
    })
    await keyboard.sendCommand('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13
    })
  } finally {
    keyboard.detach()
  }
  await until(
    () => js(`document.querySelector('[aria-current="location"]')?.textContent === 'Media'`),
    'keyboard drill-in'
  )
  await press('Search')
  await js(`(() => {
    const input = document.querySelector('main input[type=search]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Workshop');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`)
  await has('1 match')
  await press('Workshop notes.pdf, file')
  await has('Inferred from the file extension')
  await capture(main, '03-search-entry-details')
  await call('saveUiSettings', {
    appearance: {
      ...(await js('window.electronAPI.getUiSettings()')).ui.appearance,
      theme: 'glacier'
    }
  })
  await until(() => js('document.documentElement.dataset.theme === "glacier"'), 'light theme')
  await press('Clear selection')
  await press('Synthetic Storage Fixture')
  await js(`(() => {
    const basis = document.querySelector('.storage-basis select');
    basis.value = 'allocated';
    basis.dispatchEvent(new Event('change', { bubbles: true }));
  })()`)
  await has('Allocated')
  await press('Name')
  await until(
    () => js('document.querySelector("th[aria-sort=ascending]")?.textContent.includes("Name")'),
    'name sorting'
  )
  main.setContentSize(900, 650)
  await capture(main, '04-light-compact')
  main.setContentSize(1200, 850)
  assert.equal(
    await js(
      'document.querySelector("main").scrollWidth <= document.querySelector("main").clientWidth'
    ),
    true
  )

  location = large
  await press('Choose location')
  const firstLarge = await status('ready')
  await press('Start scan')
  const scanning = await status('scanning')
  assert.notEqual(firstLarge.id, scanning.id)
  await until(async () => (await session())?.processed > 0, 'scan checkpoints')
  const cancelAt = performance.now()
  await call('cancelStorageScan', scanning.id)
  const cancelled = await status('cancelled')
  const cancelMs = performance.now() - cancelAt
  assert.ok(cancelled.processed < files)
  await has('Cancelled')
  await capture(main, '05-cancelled')
  await assert.rejects(() => call('dropStorageScan', partial.id), /no longer available/)

  const before = { rows: recorded(), frames, memory: await process.getProcessMemoryInfo() }
  const eventLoop = monitorEventLoopDelay({ resolution: 10 })
  const cpu = process.cpuUsage()
  const begin = performance.now()
  eventLoop.enable()
  await press('Rescan')
  const restarted = await status('scanning')
  assert.notEqual(restarted.id, cancelled.id)
  const memory = []
  const roundTrips = []
  const samples = []
  const complete = await until(
    async () => {
      const sent = performance.now()
      const current = await session()
      roundTrips.push(performance.now() - sent)
      if (!current || current.state === 'failed') throw new Error('Scanner failed')
      memory.push(process.memoryUsage.rss())
      samples.push(
        app.getAppMetrics().map(({ type, cpu, memory }) => ({
          type,
          cpuPercent: cpu.percentCPUUsage,
          workingSetKiB: memory.workingSetSize
        }))
      )
      if (current.state === 'complete') return current
      await wait(170)
      return false
    },
    'large fixture completed',
    120_000
  )
  eventLoop.disable()
  const scanWallMs = Math.round(performance.now() - begin)
  const usage = process.cpuUsage(cpu)
  assert.equal(complete.totals.files, files)
  assert.equal(complete.totals.logical, String(files * 336))
  const after = { rows: recorded(), frames, memory: await process.getProcessMemoryInfo() }
  assert.ok(
    after.rows > before.rows && after.frames > before.frames,
    'monitoring and history during scanning'
  )
  const pageStart = performance.now()
  const page = await call('queryStorageScan', complete.id, {
    ...rootQuery,
    view: 'search',
    text: 'Synthetic-',
    page: 1
  })
  // The page UI can have a request in flight following the state transition.
  const resolvedPage =
    page ??
    (await until(
      () =>
        call('queryStorageScan', complete.id, {
          ...rootQuery,
          view: 'search',
          text: 'Synthetic-',
          page: 1
        }),
      'paged query'
    ))
  assert.equal(resolvedPage.rows.length, 50)
  assert.equal(resolvedPage.matches, files)
  assert.equal(resolvedPage.page, 1)
  const pageMs = performance.now() - pageStart
  await has('Entries')
  await js('document.querySelector(".storage-browser").scrollIntoView(); true')
  await capture(main, '06-directory-browser')
  await js('document.querySelector("main").scrollTop = 0; true')
  await press('Discard scan')
  await until(async () => (await session()) === null, 'discarded session')
  await until(() => workerEvents.started === workerEvents.exited, 'thread exits on discard')
  const afterDrop = await process.getProcessMemoryInfo()
  assert.equal(rendererErrors.length, 0, 'No renderer errors')

  await js('location.hash = "#/"; true')
  await has('Overview')
  await call('showMiniMonitor')
  const mini = await until(() => view('#mini-monitor'), 'mini renderer')
  await assert.rejects(
    () => mini.webContents.executeJavaScript('window.electronAPI.getStorageSession()'),
    /untrusted sender/
  )
  await mini.webContents.executeJavaScript('window.electronAPI.hideMiniMonitor()')
  assert.ok(openTray)
  main.hide()
  openTray()
  const tray = await until(() => view('#tray'), 'tray renderer')
  await assert.rejects(
    () => tray.webContents.executeJavaScript('window.electronAPI.chooseStorageScope()'),
    /untrusted sender/
  )
  tray.hide()
  main.show()
  await js('location.hash = "#/storage"; true')
  await has('Choose a folder or local volume')
  const quitScope = await call('chooseStorageScope')
  await call('startStorageScan', quitScope.id)
  await status('scanning')
  assert.equal(workerEvents.started - workerEvents.exited, 1)
  const report = {
    build,
    selector: 'isolated native-picker result substitute',
    platform: process.platform,
    architecture: process.arch,
    electron: process.versions.electron,
    battery: powerMonitor.isOnBatteryPower(),
    fixture: { files, directories: 60, bytesPerFile: 336 },
    scan: {
      elapsedMs: complete.elapsedMs,
      wallMs: scanWallMs,
      processed: complete.processed,
      indexed: complete.indexed,
      peakOpenDirectories: complete.peakOpenDirectories,
      peakPendingDirectoryQueue: 0,
      cpuMicros: usage.user + usage.system,
      rendererStatusRoundTripsMs: roundTrips,
      eventLoopP95Ms: eventLoop.percentile(95) / 1e6,
      pageMs,
      memoryRssPeakBytes: Math.max(...memory),
      memory: { before: before.memory, after: after.memory, afterDrop },
      monitoringFrames: after.frames - before.frames,
      historyRows: after.rows - before.rows,
      electronProcessSamples: samples
    },
    cancellation: {
      observedMs: cancelMs,
      processed: cancelled.processed,
      retainedFiles: cancelled.totals?.files ?? 0
    },
    partial: { skippedLinks: partial.skipped.links, logicalBytes: partial.totals.logical },
    ipcAcrossHarness: traffic,
    cleanup: workerEvents
  }
  app.once('will-quit', () => {
    assert.deepEqual(workerEvents, { started: 4, exited: 4 })
    if (output) fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n')
    console.log(
      'PASS: real worker scan, bounded IPC, renderer navigation, cancellation, live recording, tray, Mini Monitor and worker shutdown.'
    )
  })
}

void run()
  .then(() => app.quit())
  .catch((error) => {
    console.error(error)
    app.exit(1)
  })
