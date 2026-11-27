/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')
const { setTimeout: wait } = require('node:timers/promises')
const { app, BrowserWindow, dialog, ipcMain, nativeTheme, Tray } = require('electron')
const Database = require('better-sqlite3')

const destination = process.env.SENTINEL_DESIGN_CAPTURE_DIR
const baseline = process.env.SENTINEL_DESIGN_BASELINE === '1'
const liveOnly = process.env.SENTINEL_DESIGN_LIVE === '1'
const examples = process.env.SENTINEL_DESIGN_EXAMPLE === '1' && !liveOnly
let unavailableExample = false
const profile = fs.mkdtempSync(join(tmpdir(), 'sentinel-design-'))
app.setPath('userData', profile)
app.setPath('sessionData', profile)
delete process.env.ELECTRON_RENDERER_URL
app.on('quit', () => fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5 }))

const fixtureSettings = join(profile, 'settings.json')
const file = join(profile, 'appearance.json')
const widgetOrder = ['memory', 'cpu', 'disk', 'gpu', 'network', 'battery', 'anomalies']
fs.writeFileSync(
  fixtureSettings,
  JSON.stringify({
    settingsVersion: 1,
    anomalyNotifications: false,
    ui:
      baseline || liveOnly
        ? {}
        : { dashboardWidgetOrder: widgetOrder, dashboardWidgets: { network: true } }
  })
)
const db = new Database(join(profile, 'sentinel.db'))
db.exec(`CREATE TABLE metric_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp INTEGER NOT NULL,
  cpu_usage REAL, memory_usage REAL, memory_used INTEGER, disk_usage REAL,
  disk_read REAL, disk_write REAL, disk_io_in_bytes INTEGER,
  net_down REAL, net_up REAL, gpu_usage REAL, battery REAL
)`)
const insert = db.prepare(
  'INSERT INTO metric_snapshots VALUES (NULL, ?, ?, ?, 7000000000, 42, 23000000, 3400000, 1, 18000000, 9200000, 56, 82)'
)
const now = Math.floor(Date.now() / 60_000) * 60_000
for (let minute = 55; minute > 1; minute--) {
  if (minute >= 23 && minute <= 30) continue
  insert.run(now - minute * 60_000, 18 + ((minute * 7) % 45), 43 + ((minute * 2) % 11))
}
db.exec(`CREATE TABLE alert_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp INTEGER NOT NULL, type TEXT NOT NULL,
  severity TEXT NOT NULL, title TEXT NOT NULL, message TEXT NOT NULL, metric_value REAL NOT NULL,
  threshold REAL NOT NULL, is_read INTEGER NOT NULL DEFAULT 0
)`)
const addAlert = db.prepare('INSERT INTO alert_history VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?)')
addAlert.run(
  now - 4 * 60_000,
  'cpu',
  'warning',
  'High CPU load (fixture)',
  'Synthetic CPU utilization crossed the example threshold.',
  92,
  90,
  0
)
addAlert.run(
  now - 15 * 60_000,
  'disk',
  'critical',
  'Low disk space (fixture)',
  'Synthetic disk usage crossed the example threshold.',
  98,
  95,
  1
)
db.close()

const processes = [
  'TypeScript Compiler',
  'Build Worker',
  'Fixture Browser',
  'Example Sync',
  'Static Indexer',
  'Image Preview',
  'Documentation Server',
  'Font Cache',
  'Long Name for Layout Stress Testing'
].map((name, i) => ({
  pid: 51050 + i,
  name,
  started: '2026-01-01 11:20:00',
  cpuPercent: i ? (8 - i) / 2 : 28.4,
  memoryBytes: (12 - i) * 99_000_000,
  memoryPercent: (10 - i) / 2,
  status: 'sleeping'
}))
const connections = [
  ['Fixture Browser', 'TCP', '192.0.2.24', '50002', '198.51.100.12', '443', 'ESTABLISHED'],
  ['Example Sync', 'TCP', '2001:db8::2', '54331', '2001:db8::11', '443', 'ESTABLISHED'],
  ['Documentation Server', 'TCP', '127.0.0.1', '8080', '*', null, 'LISTEN'],
  ['Build Worker', 'UDP', '2001:db8::3', '5353', '*', null, null]
].map(([processName, protocol, localAddress, localPort, remoteAddress, remotePort, state], i) => ({
  processName,
  pid: processes[i].pid,
  protocol,
  localAddress,
  localPort,
  remoteAddress,
  remotePort,
  state
}))
const fixture = {
  'get-network-connections': () => ({
    connections,
    supported: true,
    limitation: null,
    collectedAt: now
  }),
  'get-process-page': (_event, request) => {
    const selected = processes.filter(
      (row) => !request.query || row.name.toLowerCase().includes(request.query.toLowerCase())
    )
    return {
      rows: selected,
      collectedAt: now,
      captured: processes.length,
      reported: 163,
      matching: selected.length,
      page: 0,
      pageCount: 1,
      truncated: false
    }
  },
  'get-process-details': (_event, pid) => ({
    ...processes.find((row) => row.pid === pid),
    parentPid: 51000,
    user: 'fixture',
    commandLine: '/example/build --watch',
    path: '/example/build',
    uptimeSeconds: 9200,
    architecture: 'arm64',
    platform: 'darwin',
    threads: 8
  }),
  'get-system-info': () => ({
    platform: 'darwin',
    distro: 'macOS',
    release: '15.6',
    arch: 'arm64',
    hostname: 'example-device',
    cpuBrand: 'Example 8-core processor',
    cpuCores: 8,
    cpuThreads: 8,
    cpuBaseSpeed: 3.2,
    totalMemory: 16 * 2 ** 30,
    model: 'Example notebook',
    manufacturer: 'Example',
    serial: '',
    uptimeSeconds: 460320
  }),
  'get-startup-metrics': () => ({
    limitation: 'Read-only third-party launch inventory.',
    items: [{ name: 'example.background', type: 'LaunchAgent', configuration: 'not-disabled' }]
  }),
  'get-thermal-metrics': () => ({
    level: 'unknown',
    isThrottling: false,
    cpuSpeedLimit: null,
    schedulerLimit: null,
    diskSpeedLimit: null,
    description: 'Thermal pressure is unavailable.',
    source: 'Fixture',
    requiresSudo: false
  })
}
function sanitize(frame) {
  const phase = Math.floor(frame.timestamp / 2000) % 11
  const exampleGpu = {
    name: 'Example integrated GPU',
    vendor: 'Example',
    vramBytes: 8e9,
    vramUsedBytes: 2e9,
    vramFreeBytes: 6e9,
    vramUsagePercent: 25,
    utilizationPercent: unavailableExample ? null : 36 + phase,
    temperatureCelsius: 50,
    powerDrawWatts: 19,
    powerLimitWatts: 45
  }
  return {
    ...frame,
    ...(examples &&
      frame.cpu && {
        cpu: {
          ...frame.cpu,
          brand: 'Example 8-core CPU',
          usagePercent: 37 + phase,
          perCoreUsage: Array.from({ length: 8 }, (_, i) => 18 + ((i * 19 + phase) % 76))
        }
      }),
    ...(examples && 'gpu' in frame && { gpu: { hasGpu: true, controllers: [exampleGpu] } }),
    ...(frame.processes && { processes: { list: processes, total: 163 } }),
    ...(frame.topProcesses && {
      topProcesses: processes.slice(0, 5).map(({ pid, name, cpuPercent, memoryBytes }) => ({
        pid,
        name,
        cpuPercent,
        memoryBytes
      }))
    }),
    ...(frame.network && {
      network: {
        ...frame.network,
        interfaces: [],
        monitoredInterface: examples ? 'example-link' : undefined,
        ...(examples && {
          totalDownloadBytesPerSec: (phase + 1) * 410000,
          totalUploadBytesPerSec: (12 - phase) * 78000
        })
      }
    }),
    ...(frame.disk && {
      disk: {
        ...frame.disk,
        drives: frame.disk.drives.slice(0, 1).map((drive) => ({
          ...drive,
          fs: 'APFS volume',
          mount: '/',
          label: 'Main volume',
          name: 'Main volume',
          ...(examples && {
            totalBytes: 512e9,
            usedBytes: 344e9,
            availableBytes: 168e9,
            freeBytes: 124e9,
            purgeableBytes: 44e9,
            usagePercent: 67,
            availableIncludesPurgeable: true
          })
        }))
      }
    })
  }
}
const originalHandle = ipcMain.handle.bind(ipcMain)
ipcMain.handle = (channel, listener) =>
  originalHandle(channel, async (event, ...args) => {
    if (fixture[channel]) return fixture[channel](event, ...args)
    const value = await listener(event, ...args)
    return channel === 'get-latest-metrics' ? sanitize(value) : value
  })
let openTray
const originalOn = Tray.prototype.on
Tray.prototype.on = function (event, listener) {
  if (event === 'click') openTray = () => this.emit('click')
  return originalOn.call(this, event, listener)
}
let failSave = false
const rename = fs.renameSync
fs.renameSync = function (source, target) {
  if (failSave && target === fixtureSettings)
    throw Object.assign(new Error('Design fixture save failure'), { code: 'EIO' })
  return rename(source, target)
}
// Only redirect the OS picker destination; production parsing and I/O still run.
dialog.showSaveDialog = async () => ({ canceled: false, filePath: file })
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] })

const errors = []
app.on('browser-window-created', (_, win) => {
  const send = win.webContents.send.bind(win.webContents)
  win.webContents.send = (channel, ...args) => {
    if (channel === 'metrics-updated') args[0] = sanitize(args[0])
    send(channel, ...args)
  }
  win.webContents.on('render-process-gone', (_, { reason }) => {
    if (reason !== 'clean-exit') errors.push(reason)
  })
  win.webContents.on('console-message', (event) => {
    if (event.level === 'error' && !event.message.includes('expected injected'))
      errors.push(event.message)
  })
})
require(resolve(process.env.SENTINEL_DESIGN_MAIN ?? join(__dirname, '../out/main/index.js')))

async function until(action, name) {
  const stop = Date.now() + 16_000
  while (Date.now() < stop) {
    const value = await action()
    if (value) return value
    await wait(60)
  }
  throw new Error(`Timed out: ${name}`)
}
function hashes(hash) {
  return BrowserWindow.getAllWindows().find(
    (win) => new URL(win.webContents.getURL() || 'about:blank').hash === hash
  )
}
const exec = (win, js) => win.webContents.executeJavaScript(js)
function has(win, selector, text) {
  return until(
    () =>
      exec(
        win,
        `[...document.querySelectorAll(${JSON.stringify(selector)})].some(
    element => element.textContent.trim() === ${JSON.stringify(text)})`
      ),
    text
  )
}
async function click(win, label) {
  assert.ok(
    await exec(
      win,
      `(() => {
    const element = [...(document.querySelector('dialog[open]') ?? document).querySelectorAll('button,a,[role=button]')]
      .find(item => !item.disabled && (item.textContent.trim() === ${JSON.stringify(label)} || item.getAttribute('aria-label') === ${JSON.stringify(label)}));
    if (!element) return false;
    element.focus();
    element.click();
    return true;
  })()`
    ),
    `Control present: ${label}`
  )
}
async function capture(win, name) {
  await wait(300)
  const image = await win.webContents.capturePage()
  assert.ok(!image.isEmpty(), name)
  if (destination) {
    fs.mkdirSync(destination, { recursive: true })
    fs.writeFileSync(join(destination, name + '.png'), image.toPNG())
  }
  console.log(JSON.stringify({ screenshot: name, viewport: win.getContentSize() }))
}

function nameProfile(win, value) {
  return exec(
    win,
    `(() => {
    const input = document.querySelector('dialog input');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`
  )
}

async function reducedMotion(win) {
  const debuggerClient = win.webContents.debugger
  debuggerClient.attach('1.3')
  try {
    await debuggerClient.sendCommand('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }]
    })
    assert.ok(await exec(win, "matchMedia('(prefers-reduced-motion: reduce)').matches"))
    assert.equal(
      await exec(win, `getComputedStyle(document.querySelector('.rail-link')).transitionDuration`),
      '0s'
    )
  } finally {
    debuggerClient.detach()
  }
}
function key(win, keyCode, modifiers = []) {
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers })
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers })
  return wait(90)
}
async function run() {
  await app.whenReady()
  const main = await until(() => hashes('') ?? hashes('#/'), 'main window')
  const prefs = () => exec(main, 'window.electronAPI.getUiSettings().then(snapshot => snapshot.ui)')
  const apply = (patch) => exec(main, `window.electronAPI.saveUiSettings(${JSON.stringify(patch)})`)
  const route = async (hash, heading) => {
    await exec(main, `location.hash = ${JSON.stringify(hash)}; true`)
    await has(main, 'h2', heading)
  }
  await has(main, 'h2', 'Overview')
  main.show()
  main.focus()
  main.setContentSize(1200, 800)
  if (process.platform === 'darwin') app.focus({ steal: true })
  await until(
    () =>
      exec(
        main,
        'window.electronAPI.getLatestMetrics().then(frame => Boolean(frame.cpu && frame.memory && frame.disk?.drives.length))'
      ),
    'live metrics'
  )
  if (examples) {
    await exec(
      main,
      `(() => {
      const label = document.createElement('aside');
      label.textContent = 'Isolated example readings';
      label.setAttribute('aria-label', 'Isolated example readings');
      Object.assign(label.style, { position: 'fixed', zIndex: '99', bottom: '8px', left: '10px', borderRadius: '4px',
        padding: '4px 7px', background: 'var(--bg-secondary)', color: 'var(--text-primary)',
        border: '1px solid var(--border-strong)', fontSize: '11px' });
      document.body.append(label);
    })()`
    )
    await wait(4_000)
  }
  await capture(main, liveOnly ? '01-live-overview' : '01-overview')
  if (liveOnly) return
  await click(main, 'Analyze')
  await until(
    () => exec(main, 'document.activeElement?.textContent === "Duplicate Files"'),
    'focus enters Analyze'
  )
  await key(main, 'Down')
  await until(
    () => exec(main, 'document.activeElement?.textContent === "Similar Photos"'),
    'Analyze arrow navigation'
  )
  await key(main, 'Escape')
  await until(
    () =>
      exec(
        main,
        'document.activeElement?.textContent === "Analyze" && !document.querySelector(".workspace-popup")'
      ),
    'Analyze Escape restores focus'
  )
  await route('#/processes', 'Processes')
  await until(
    () => exec(main, 'document.body.textContent.includes("TypeScript Compiler")'),
    'synthetic process rows'
  )
  await capture(main, '02-processes')
  await click(main, 'View details for TypeScript Compiler, PID 51050')
  await has(main, 'h2', 'TypeScript Compiler')
  await capture(main, '03-process-details')
  await click(main, 'Close process details')
  if (!baseline) {
    await click(main, 'Browse collected processes')
    await until(
      () => exec(main, 'document.body.textContent.includes("captured of 163 reported")'),
      'cached process browse'
    )
    await capture(main, '02-process-inventory')
    await click(main, 'Browse collected processes')
  }
  await route('#/network', 'Network Connections')
  await until(
    () => exec(main, 'document.body.textContent.includes("[2001:db8::2]:54331")'),
    'IPv6 endpoints'
  )
  await capture(main, '04-network')
  if (!baseline) {
    await exec(main, 'document.querySelector(".connection-select")?.click()')
    await until(
      () =>
        exec(
          main,
          'document.querySelector(".connection-inspector")?.textContent.includes("Observed")'
        ),
      'connection row and observation inspector'
    )
    await capture(main, '04-network-inspector')
  }
  await route('#/system', 'System')
  await until(
    () => exec(main, 'document.body.textContent.includes("Example 8-core processor")'),
    'synthetic hardware'
  )
  await capture(main, '05-system')
  if (!baseline) {
    await until(
      () => exec(main, 'document.body.textContent.includes("Monitoring capability")'),
      'capability panel'
    )
    await exec(
      main,
      'Array.from(document.querySelectorAll("h3")).find(el => el.textContent === "Monitoring capability")?.scrollIntoView()'
    )
    await capture(main, '05-capabilities')
  }
  await route('#/history', 'History')
  await until(
    () => exec(main, 'document.querySelectorAll(".recharts-area-curve").length'),
    'history charts'
  )
  await capture(main, '06-history')
  if (!baseline) {
    const latest = await exec(main, 'document.querySelector("#observation-cursor").valueAsNumber')
    await exec(main, 'document.querySelector("#observation-cursor").focus()')
    await key(main, 'Left')
    await until(
      () =>
        exec(main, `document.querySelector("#observation-cursor").valueAsNumber === ${latest - 1}`),
      'keyboard history cursor'
    )
    await capture(main, '06-history-selected')
    await click(main, 'Latest')
  }
  await route('#/alerts', 'Alerts')
  await has(main, 'p', 'High CPU load (fixture)')
  if (!baseline) {
    await click(main, 'Low disk space (fixture)')
    await until(
      () =>
        exec(
          main,
          'document.querySelector(".incident-detail")?.textContent.includes("Low disk space (fixture)")'
        ),
      'alert selection updates inspector'
    )
  }
  await capture(main, '07-alerts')
  await route('#/settings', 'Settings')
  await capture(main, '08-settings')
  if (baseline) return

  assert.deepEqual((await prefs()).dashboardWidgetOrder, widgetOrder)
  assert.equal((await prefs()).dashboardLayout.preset, 'custom')
  await route('#/settings?section=appearance', 'Settings')
  await has(main, 'legend', 'Appearance')
  await capture(main, '09-appearance')
  const themes = ['graphite', 'glacier', 'obsidian', 'nordic']
  const appearance = (await prefs()).appearance
  const themeCommitMs = {}
  for (const theme of themes) {
    const started = performance.now()
    assert.ok(await apply({ appearance: { ...appearance, theme } }))
    await until(() => exec(main, `document.documentElement.dataset.theme === "${theme}"`), theme)
    themeCommitMs[theme] = Math.round(performance.now() - started)
    const colors = await exec(
      main,
      `(() => {
      const css = getComputedStyle(document.documentElement);
      const tokens = ['--bg-base','--bg-card','--bg-card-hover','--bg-secondary',
        '--text-primary','--text-secondary','--text-muted','--accent-green','--accent-red','--accent-amber',
        '--accent','--accent-solid','--on-accent','--border-strong'];
      return Object.fromEntries(tokens.map(name => [name.slice(2), css.getPropertyValue(name).trim()]));
    })()`
    )
    for (const surface of ['bg-base', 'bg-card', 'bg-card-hover', 'bg-secondary']) {
      for (const ink of [
        'text-primary',
        'text-secondary',
        'text-muted',
        'accent-green',
        'accent-red',
        'accent-amber',
        'accent'
      ]) {
        assert.ok(ratio(colors[surface], colors[ink]) >= 4.5, `${theme} ${ink}/${surface}`)
      }
      assert.ok(ratio(colors[surface], colors['border-strong']) >= 3, `${theme} control border`)
    }
    assert.ok(ratio(colors['accent-solid'], colors['on-accent']) >= 4.5, theme)
    await route('#/', 'Overview')
    await capture(main, `10-theme-${theme}`)
  }
  console.log(JSON.stringify({ themeCommitMs }))
  const originalTheme = nativeTheme.themeSource
  try {
    await apply({ appearance: { ...appearance, theme: 'system' } })
    for (const source of ['light', 'dark']) {
      nativeTheme.themeSource = source
      await until(
        () =>
          exec(
            main,
            `document.documentElement.dataset.theme === "${source === 'light' ? 'glacier' : 'graphite'}"`
          ),
        'OS theme sync'
      )
    }
  } finally {
    nativeTheme.themeSource = originalTheme
  }
  await apply({ appearance: { ...appearance, accent: '#000001', textSize: 16 } })
  for (const [width, height] of [
    [900, 650],
    [1200, 800],
    [1600, 1000]
  ]) {
    main.setContentSize(width, height)
    await capture(main, `11-overview-${main.getContentSize().join('x')}`)
    assert.ok(
      await exec(
        main,
        `document.querySelector('.desktop-main').scrollWidth <= document.querySelector('.desktop-main').clientWidth + 1`
      ),
      'no overview horizontal clipping'
    )
  }
  await click(main, 'Collapse sidebar')
  await until(
    () => exec(main, 'document.querySelector(".desktop-shell").dataset.sidebar === "collapsed"'),
    'sidebar collapse'
  )
  await click(main, 'Expand sidebar')
  main.setContentSize(900, 650)
  await click(main, 'Customize Dashboard')
  await has(main, 'h3', 'Edit layout')
  assert.equal(await exec(main, 'document.activeElement.textContent'), 'Edit layout')
  await exec(main, 'document.querySelector(`[aria-label="Move CPU widget up"]`).focus()')
  const editStarted = performance.now()
  await key(main, 'Space')
  await until(
    () => exec(main, 'document.querySelector(".editing-cell").dataset.widget === "cpu"'),
    'keyboard draft order'
  )
  console.log(
    JSON.stringify({ keyboardLayoutPreviewMs: Math.round(performance.now() - editStarted) })
  )
  assert.deepEqual((await prefs()).dashboardWidgetOrder, widgetOrder)
  await key(main, 'Escape')
  await until(
    () => exec(main, 'document.activeElement.textContent === "Customize Dashboard"'),
    'editor focus restoration'
  )
  assert.deepEqual((await prefs()).dashboardWidgetOrder, widgetOrder)
  await click(main, 'Customize Dashboard')
  await has(main, 'h3', 'Edit layout')
  await exec(
    main,
    `(() => {
    const transfer = new DataTransfer();
    window.fixtureDragTransfer = transfer;
    document.querySelector('[data-widget="cpu"] .drag-handle').dispatchEvent(new DragEvent('dragstart', {
      bubbles: true, cancelable: true, dataTransfer: transfer
    }));
    document.querySelector('[data-widget="memory"]').dispatchEvent(new DragEvent('dragover', {
      bubbles: true, cancelable: true, dataTransfer: transfer
    }));
  })()`
  )
  await until(
    () =>
      exec(
        main,
        'document.querySelector(`[data-drop-target="true"]`)?.dataset.widget === "memory"'
      ),
    'visible target'
  )
  await exec(
    main,
    `(() => {
    document.querySelector('[data-widget="memory"]').dispatchEvent(new DragEvent('drop', {
      bubbles: true, cancelable: true, dataTransfer: window.fixtureDragTransfer
    }));
    delete window.fixtureDragTransfer;
  })()`
  )
  await until(
    () => exec(main, 'document.querySelector(".editing-cell").dataset.widget === "cpu"'),
    'drop previews reorder'
  )
  async function chooseLabel(label, value) {
    await exec(
      main,
      `(() => {
      const control = [...document.querySelectorAll('.widget-editor select')].find(e => e.getAttribute('aria-label') === ${JSON.stringify(label)});
      control.value = ${JSON.stringify(value)};
      control.dispatchEvent(new Event('change', { bubbles: true }));
    })()`
    )
  }
  await chooseLabel('Memory width', 'full')
  await chooseLabel('Memory height', 'expanded')
  await chooseLabel('Memory visualization', 'timeline')
  await until(
    () =>
      exec(
        main,
        'document.querySelector(`.editing-cell[data-widget="memory"]`).dataset.width === "full"'
      ),
    'preview width'
  )
  assert.ok(
    await exec(
      main,
      `(() => {
    const boxes = [...document.querySelectorAll('.editing-cell')].map(e => e.getBoundingClientRect());
    return boxes.every((a,i) => boxes.slice(i+1).every(b => a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top));
  })()`
    ),
    'bounded grid cells do not collide'
  )
  assert.deepEqual((await prefs()).dashboardWidgetOrder, widgetOrder)
  await capture(main, '12-dashboard-edit')
  failSave = true
  try {
    await click(main, 'Save layout')
    await has(main, '.layout-error', 'Layout was not saved. Your draft is still open.')
    assert.deepEqual((await prefs()).dashboardWidgetOrder, widgetOrder)
    await capture(main, '12-layout-save-failure')
  } finally {
    failSave = false
  }
  await click(main, 'Save layout')
  await until(() => exec(main, '!document.querySelector(".layout-editor")'), 'draft saved')
  const full = (await prefs()).dashboardLayout.presentation.memory
  assert.deepEqual(full, { width: 'full', height: 'expanded', style: 'timeline' })
  assert.equal((await prefs()).dashboardWidgetOrder[0], 'cpu')
  await capture(main, '12-custom-layout')
  await click(main, 'Customize Dashboard')
  await has(main, 'h3', 'Edit layout')
  await exec(main, 'document.querySelector(`[aria-label="Show Memory chart"]`).click()')
  await click(main, 'Save layout')
  await until(
    () => exec(main, '!document.querySelector(".layout-editor")'),
    'chart visibility saved'
  )
  assert.ok((await prefs()).dashboardLayout.noChart.includes('memory'))
  assert.ok(await exec(main, '!document.querySelector(`[data-widget="memory"] .live-chart`)'))
  await key(main, 'k', [process.platform === 'darwin' ? 'meta' : 'control'])
  await until(() => exec(main, 'document.activeElement.id === "command-search"'), 'palette focus')
  await capture(main, '13-command-palette')
  await key(main, 'Escape')
  await reducedMotion(main)

  await route('#/settings?section=appearance', 'Settings')
  await has(main, 'legend', 'Appearance')
  await click(main, 'Save current setup')
  await has(main, 'dialog h3', 'Save appearance profile')
  assert.equal(await exec(main, 'document.activeElement.tagName'), 'INPUT')
  await key(main, 'Tab', ['shift'])
  assert.equal(await exec(main, 'document.activeElement.textContent'), 'Cancel')
  await key(main, 'Tab')
  assert.equal(await exec(main, 'document.activeElement.tagName'), 'INPUT')
  assert.ok(
    await exec(
      main,
      `(() => { document.querySelector('.workstation-navigation a').focus(); return Boolean(document.activeElement.closest('dialog[open]')); })()`
    ),
    'dialog background is inert'
  )
  await nameProfile(main, 'Review setup')
  await click(main, 'Save profile')
  await until(async () => (await prefs()).appearanceProfiles.length === 1, 'profile save')
  await capture(main, '14-profiles')
  const stored = (await prefs()).appearanceProfiles[0]
  assert.equal(
    await exec(main, `window.electronAPI.exportAppearanceProfile(${JSON.stringify(stored)})`),
    'saved'
  )
  assert.equal(
    await exec(main, `window.electronAPI.exportAppearanceProfile(${JSON.stringify(stored)})`),
    'exists'
  )
  assert.deepEqual(await exec(main, 'window.electronAPI.importAppearanceProfile()'), {
    status: 'ready',
    profile: stored
  })
  for (const invalid of [
    '{',
    JSON.stringify({ ...stored, url: 'https://example.test' }),
    'x'.repeat(16_385)
  ]) {
    fs.writeFileSync(file, invalid)
    assert.equal(
      (await exec(main, 'window.electronAPI.importAppearanceProfile()')).status,
      'invalid'
    )
  }
  fs.writeFileSync(file, JSON.stringify({ ...stored, name: 'Imported setup' }))
  await click(main, 'Import profile')
  await has(main, 'dialog h3', 'Save appearance profile')
  assert.equal((await prefs()).appearanceProfiles.length, 1)
  await click(main, 'Save profile')
  await until(async () => (await prefs()).appearanceProfiles.length === 2, 'import persisted')
  await click(main, 'Rename')
  await nameProfile(main, 'Renamed setup')
  await click(main, 'Save profile')
  await until(
    async () => (await prefs()).appearanceProfiles[0].name === 'Renamed setup',
    'rename persisted'
  )
  await click(main, 'Remove')
  await until(async () => (await prefs()).appearanceProfiles.length === 1, 'remove persisted')
  await click(main, 'Reset appearance')
  await until(
    async () => (await prefs()).appearance.textSize === 15,
    'reset appearance independently'
  )
  assert.deepEqual((await prefs()).dashboardLayout, stored.dashboard.dashboardLayout)
  await click(main, 'Apply')
  await until(
    async () => (await prefs()).appearance.textSize === 16,
    'apply imported configuration'
  )
  await route('#/settings?section=dashboard', 'Settings')
  await has(main, 'legend', 'Dashboard layout')
  await click(main, 'Reset dashboard layout')
  await until(
    async () => (await prefs()).dashboardLayout.preset === 'essential',
    'reset dashboard independently'
  )
  assert.deepEqual((await prefs()).appearance, stored.appearance)
  await apply({ appearance })
  await route('#/', 'Overview')
  main.setContentSize(1200, 800)
  await capture(main, '21-essential')
  assert.ok(
    await exec(
      main,
      `(() => {
    const metrics = [...document.querySelectorAll('.instrument[data-metric]')].filter(e => e.dataset.metric !== 'anomalies');
    return metrics.length === 6 && metrics.every(e => e.getBoundingClientRect().bottom <= innerHeight)
  })()`
    ),
    'six principal instruments fit the normal viewport'
  )
  for (const preset of ['performance', 'diagnostics']) {
    await click(main, 'Customize Dashboard')
    await has(main, 'h3', 'Edit layout')
    await click(main, preset)
    await click(main, 'Save layout')
    await until(() => exec(main, '!document.querySelector(".layout-editor")'), preset + ' saved')
    await capture(main, '21-' + preset)
  }
  unavailableExample = true
  if (examples) {
    await click(main, 'Customize Dashboard')
    await has(main, 'h3', 'Edit layout')
    await click(main, 'essential')
    await click(main, 'Save layout')
    await route('#/system', 'System')
    await route('#/', 'Overview')
    await until(
      () =>
        exec(
          main,
          'Boolean(document.querySelector(`[data-metric="gpu"] [data-unavailable="true"]`))'
        ),
      'unavailable GPU'
    )
  }
  await capture(main, '21-unavailable')
  await route('#/settings?section=appearance', 'Settings')
  await has(main, 'legend', 'Appearance')
  assert.equal(await apply({ appearance: { ...appearance, accent: 'rgb(255, 0, 0)' } }), false)
  failSave = true
  try {
    await click(main, 'Glacier')
    await has(main, '[role="alert"]', 'Could not save settings.')
    assert.notEqual((await prefs()).appearance.theme, 'glacier')
    await capture(main, '15-settings-failure')
  } finally {
    failSave = false
  }
  await click(main, 'Retry')
  await until(async () => (await prefs()).appearance.theme === 'glacier', 'appearance retry')
  assert.ok(await exec(main, 'window.electronAPI.showMiniMonitor()'))
  const mini = await until(() => hashes('#mini-monitor'), 'Mini Monitor')
  await has(mini, 'h1', 'Sentinel Mini Monitor')
  await until(
    () => exec(mini, 'document.documentElement.dataset.theme === "glacier"'),
    'mini appearance'
  )
  assert.ok(
    await exec(
      mini,
      `(() => {
    const grid = document.querySelector('.mini-grid');
    return grid.children.length === 6 &&
      grid.getBoundingClientRect().bottom <= document.querySelector('footer').getBoundingClientRect().top;
  })()`
    ),
    'all six default tiles clear footer at largest text size'
  )
  await capture(mini, '16-mini')
  for (const zoom of [1.25, 1.5]) {
    mini.webContents.setZoomFactor(zoom)
    await wait(80)
    assert.ok(
      await exec(
        mini,
        `(() => {
      const viewport = document.querySelector('.aux-scroll');
      viewport.scrollTop = viewport.scrollHeight;
      const footer = document.querySelector('footer').getBoundingClientRect();
      return viewport.getBoundingClientRect().bottom <= footer.top + 1 &&
        footer.bottom <= innerHeight + 1 &&
        document.querySelector('.mini-grid').getBoundingClientRect().bottom <= footer.top + 1;
    })()`
      ),
      `Mini footer stays clear and all readings reachable at ${zoom}x`
    )
  }
  mini.webContents.setZoomFactor(1)
  const miniSettings = (await prefs()).miniPresentation
  assert.ok(
    await apply({
      miniPresentation: { ...miniSettings, size: 'small', layout: 'list', opacity: 90 }
    })
  )
  await until(
    () => exec(mini, 'document.querySelector(".mini-grid").dataset.layout === "list"'),
    'mini list sync'
  )
  assert.deepEqual(mini.getContentSize(), [270, 258])
  if (process.platform === 'darwin' || process.platform === 'win32')
    assert.ok(Math.abs(mini.getOpacity() - 0.9) < 0.02)
  await capture(mini, '17-mini-list')
  await click(mini, 'Hide Monitor')
  await until(() => mini.isDestroyed(), 'mini disposed')
  openTray()
  const tray = await until(() => hashes('#tray'), 'tray')
  await has(tray, 'h1', 'Sentinel')
  await until(
    () => exec(tray, 'document.documentElement.dataset.theme === "glacier"'),
    'tray appearance'
  )
  await capture(tray, '18-tray')
  await click(tray, 'Compact')
  await until(async () => (await prefs()).trayPresentation.compact, 'compact persisted')
  await capture(tray, '19-tray-compact')
  tray.hide()
  main.focus()
  await route('#/processes', 'Processes')
  await exec(
    main,
    `(() => {
    const input = document.querySelector('#process-search');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'no fixture can match this request');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`
  )
  await has(main, 'p', 'No processes match these filters.')
  await capture(main, '20-empty-process-search')
  await route('#/alerts', 'Alerts')
  await has(main, 'p', 'High CPU load (fixture)')
  await click(main, 'Mark all as read')
  await until(
    () =>
      exec(
        main,
        'window.electronAPI.getAlertHistory().then(rows => rows.length === 2 && rows.every(row => row.read))'
      ),
    'alerts acknowledged'
  )
  assert.ok(await apply({ appearance: { ...(await prefs()).appearance, startupPage: '/alerts' } }))
  main.destroy()
  await exec(tray, 'window.electronAPI.openMainWindow()')
  const reopened = await until(() => hashes('#/alerts'), 'new main window starts on saved page')
  await has(reopened, 'h2', 'Alerts')
  assert.deepEqual(errors, [])
  console.log(
    'PASS: native renderer, preferences, profile I/O, accessibility probes and auxiliary layout'
  )
}
function luminance(hex) {
  const components = hex.match(/[a-f0-9]{2}/gi).map((part) => parseInt(part, 16) / 255)
  return components.reduce(
    (sum, v, i) =>
      sum + [0.2126, 0.7152, 0.0722][i] * (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4),
    0
  )
}
function ratio(first, second) {
  const values = [luminance(first), luminance(second)].sort((a, b) => a - b)
  return (values[1] + 0.05) / (values[0] + 0.05)
}
const deadline = setTimeout(() => {
  console.error('Native design acceptance timed out')
  app.exit(1)
}, 190_000)
run()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => {
    clearTimeout(deadline)
    if (process.exitCode) app.exit(process.exitCode)
    else app.quit()
  })
