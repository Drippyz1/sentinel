/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-require-imports */
const { cpus, loadavg } = require('node:os')
const { execFile } = require('node:child_process')
const { promisify } = require('node:util')
const { BrowserWindow, app, powerMonitor } = require('electron')

const run = promisify(execFile)
const memoryProbes = process.env.SENTINEL_BENCH_MEMORY_PROBES === '1'

async function hostMemory() {
  if (process.platform !== 'darwin' || !memoryProbes) return undefined
  try {
    const { stdout } = await run('/usr/bin/vm_stat', [], { timeout: 3000 })
    return Object.fromEntries(
      [
        ...stdout.matchAll(
          /^(Pages free|Pages active|Pages inactive|Pages wired down|Pages occupied by compressor|Swapins|Swapouts):\s*(\d+)/gm
        )
      ].map(([, label, count]) => [label, Number(count)])
    )
  } catch {
    return null
  }
}

async function footprints(windows, roleForWindow) {
  if (process.platform !== 'darwin' || !memoryProbes) return undefined
  return Promise.all(
    windows.map(async (window) => {
      const role = roleForWindow(window)
      const pid = window.webContents.getOSProcessId()
      if (!pid) return { role, physicalFootprint: null }
      try {
        const { stdout } = await run('/usr/bin/vmmap', ['-summary', String(pid)], { timeout: 3500 })
        return {
          role,
          physicalFootprint: stdout.match(/^Physical footprint:\s*([\d.]+\s*[KMG]B?)/m)?.[1] ?? null
        }
      } catch {
        return { role, physicalFootprint: null }
      }
    })
  )
}

const inspectDocument = `({
  visibility: document.visibilityState, focused: document.hasFocus(),
  width: innerWidth, height: innerHeight, devicePixelRatio,
  activeAnimations: document.getAnimations().filter(animation => animation.playState === 'running').length,
  domChanges: globalThis.__sentinelBenchmarkDom?.counts
})`

function documentState(window) {
  return window.webContents.executeJavaScript(inspectDocument).catch(() => null)
}

function cpuTicks() {
  return cpus().reduce(
    (sum, core) => {
      sum.idle += core.times.idle
      sum.total += Object.values(core.times).reduce((count, duration) => count + duration, 0)
      return sum
    },
    { idle: 0, total: 0 }
  )
}

function createObservations(roleForWindow) {
  const windowIds = new WeakMap()
  const processIds = new Map()
  let nextWindow = 1
  let previous = cpuTicks()
  const lifecycle = []
  const start = performance.now()

  function watch(_event, window) {
    const token = nextWindow++
    windowIds.set(window, token)
    let role = 'pending'
    const record = (event) => {
      lifecycle.push({ ms: Math.round(performance.now() - start), window: token, role, event })
    }
    record('created')
    window.webContents.once('did-finish-load', () => {
      role = roleForWindow(window)
      record('loaded')
    })
    for (const event of ['show', 'hide', 'focus', 'blur', 'minimize', 'restore', 'closed']) {
      window.on(event, () => record(event))
    }
  }
  app.on('browser-window-created', watch)

  function native() {
    return BrowserWindow.getAllWindows().map((window) => {
      const [width, height] = window.getSize()
      return {
        window: windowIds.get(window),
        role: roleForWindow(window),
        visible: window.isVisible(),
        minimized: window.isMinimized(),
        focused: window.isFocused(),
        width,
        height
      }
    })
  }

  function sample(appMetrics) {
    const roles = new Map(
      BrowserWindow.getAllWindows().map((window) => [
        window.webContents.getOSProcessId(),
        roleForWindow(window)
      ])
    )
    const live = new Set(appMetrics.map((entry) => entry.pid))
    for (const pid of processIds.keys()) {
      if (!live.has(pid)) processIds.delete(pid)
    }
    const processStats = appMetrics.map((entry) => {
      if (!processIds.has(entry.pid)) processIds.set(entry.pid, ++sample.lastProcess)
      return {
        process: processIds.get(entry.pid),
        type: entry.type,
        role: roles.get(entry.pid),
        cpuPercent: entry.cpu.percentCPUUsage,
        workingSetKiB: entry.memory?.workingSetSize,
        privateBytes: entry.memory?.privateBytes
      }
    })
    const current = cpuTicks()
    const elapsed = current.total - previous.total
    const hostCpuBusyPercent =
      elapsed > 0 ? 100 * (1 - (current.idle - previous.idle) / elapsed) : null
    previous = current
    return {
      nativeWindows: native(),
      processes: processStats,
      hostCpuBusyPercent,
      hostLoad1m: loadavg()[0],
      thermalState: powerMonitor.getCurrentThermalState()
    }
  }
  sample.lastProcess = 0

  async function checkpoint(name) {
    const windows = BrowserWindow.getAllWindows()
    const states = native()
    for (const [i, window] of windows.entries()) {
      states[i].document = await documentState(window)
    }
    const processes = sample(app.getAppMetrics()).processes
    const [memory, rendererFootprints] = await Promise.all([
      hostMemory(),
      footprints(windows, roleForWindow)
    ])
    return {
      name,
      ms: Math.round(performance.now() - start),
      windows: states,
      processes,
      ...(memoryProbes && {
        onBattery: powerMonitor.isOnBatteryPower(),
        hostMemoryPageCounts: memory,
        rendererFootprints
      })
    }
  }

  return { sample, checkpoint, lifecycle }
}

async function startDomCounter(window) {
  await window.webContents.executeJavaScript(`(() => {
    const counts = { callbacks: 0, mutations: 0, text: 0, attribute: 0, childList: 0 };
    const observer = new MutationObserver(records => {
      counts.callbacks++;
      for (const record of records) {
        counts.mutations++;
        if (record.type === 'characterData') counts.text++;
        if (record.type === 'attributes') counts.attribute++;
        if (record.type === 'childList') counts.childList++;
      }
    });
    observer.observe(document.querySelector('main') ?? document.body,
      { subtree: true, childList: true, characterData: true, attributes: true });
    globalThis.__sentinelBenchmarkDom = { counts, observer };
    return true;
  })()`)
}

async function memory(window) {
  const info = await process.getProcessMemoryInfo()
  const debug = window.webContents.debugger
  let rendererV8UsedBytes = null
  try {
    debug.attach('1.3')
    rendererV8UsedBytes = (await debug.sendCommand('Runtime.getHeapUsage')).usedSize
  } catch {
    // Retain the main-process checkpoint if the optional debugger is unavailable.
  } finally {
    if (debug.isAttached()) debug.detach()
  }
  return {
    mainPrivateKiB: info.private ?? null,
    mainSharedKiB: info.shared ?? null,
    mainRssBytes: process.memoryUsage.rss(),
    mainV8UsedBytes: process.memoryUsage().heapUsed,
    rendererV8UsedBytes
  }
}

module.exports = { createObservations, documentState, startDomCounter, memory }
