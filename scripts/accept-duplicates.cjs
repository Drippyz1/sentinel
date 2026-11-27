/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const { join } = require('node:path')
const { monitorEventLoopDelay } = require('node:perf_hooks')
const { setTimeout: wait } = require('node:timers/promises')

if (!process.versions.electron) {
  const { spawnSync } = require('node:child_process')
  const root = fs.mkdtempSync(join(fs.realpathSync('/tmp'), 'sentinel-analysis-'))
  try {
    const result = spawnSync(require('electron'), [__filename], {
      env: { ...process.env, SENTINEL_DUPLICATE_FIXTURE: root },
      stdio: 'inherit',
      timeout: 150_000
    })
    if (result.error) console.error(result.error)
    process.exitCode = result.status ?? 1
  } finally {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 3 })
    assert.equal(fs.existsSync(root), false)
    console.log('PASS: temporary synthetic fixture and profile removed after Electron exit.')
  }
  return
}

const { app, BrowserWindow, dialog } = require('electron')
const Database = require('better-sqlite3')
const workers = require('node:worker_threads')
const handles = new Set()
const root = process.env.SENTINEL_DUPLICATE_FIXTURE
assert.ok(root && fs.readdirSync(root).length === 0, 'Run the harness with node, not electron')
const profile = join(root, 'profile')
const exact = join(root, 'Synthetic workshop files')
const photos = join(root, 'Synthetic photo collection')
const busy = join(root, 'Synthetic cancellation tree')
const captures = process.env.SENTINEL_DUPLICATE_CAPTURES
let choice = exact
let cancelledPicker = false
let frames = 0
let metricBytes = 0
let pickerCalls = 0
let decoderCreated = 0
let liveDecoders = 0
let peakDecoders = 0
const duplicateRequests = {}
const delay = monitorEventLoopDelay({ resolution: 10 })

workers.Worker = class extends workers.Worker {
  constructor(...args) {
    super(...args)
    if (String(args[0]).endsWith('/duplicate-scan.js')) {
      handles.add(this)
      this.once('exit', () => handles.delete(this))
    }
  }
}
app.on('web-contents-created', (_, contents) => {
  const original = contents.send.bind(contents)
  contents.send = (channel, ...args) => {
    if (channel === 'metrics-updated') {
      frames++
      metricBytes += JSON.stringify(args).length
    }
    return original(channel, ...args)
  }
  contents.on('did-finish-load', () => {
    if (!contents.getURL().startsWith('data:text/html;base64,')) return
    decoderCreated++
    liveDecoders++
    peakDecoders = Math.max(peakDecoders, liveDecoders)
    const preferences = contents.getLastWebPreferences()
    assert.equal(preferences.sandbox, true)
    assert.equal(preferences.nodeIntegration, false)
    assert.equal(Boolean(preferences.preload), false)
    contents.once('destroyed', () => liveDecoders--)
  })
})
const { ipcMain } = require('electron')
const register = ipcMain.handle.bind(ipcMain)
ipcMain.handle = (name, handler) =>
  register(name, (...args) => {
    if (name.startsWith('duplicate-')) duplicateRequests[name] = (duplicateRequests[name] ?? 0) + 1
    return handler(...args)
  })
fs.mkdirSync(profile)
fs.writeFileSync(
  join(profile, 'settings.json'),
  JSON.stringify({
    settingsVersion: 1,
    pollIntervalMs: 2000,
    anomalyNotifications: false
  })
)
app.setPath('userData', profile)
app.setPath('sessionData', profile)
delete process.env.ELECTRON_RENDERER_URL
app.on('quit', () => {
  assert.equal(handles.size, 0)
  assert.equal(liveDecoders, 0)
  console.log('PASS: analysis threads and decoder closed on quit.')
})
dialog.showOpenDialog = async (_window, options) => {
  assert.match(options.title, /^Authorize .* analysis$/)
  assert.deepEqual(options.properties, ['openDirectory', 'noResolveAliases', 'dontAddToRecent'])
  pickerCalls++
  if (cancelledPicker) return { canceled: true, filePaths: [] }
  return { canceled: false, filePaths: [choice] }
}
require('../out/main/index.js')

async function until(check, label, timeout = 18000) {
  const end = performance.now() + timeout
  while (performance.now() < end) {
    const value = await check()
    if (value) return value
    await wait(50)
  }
  throw new Error(`Timed out: ${label}`)
}

async function seedFiles() {
  for (const folder of [exact, photos, busy, join(exact, 'Archive'), join(exact, 'Delivery')])
    await fsp.mkdir(folder)
  for (const [name, bytes] of [
    ['Audio master.wav', 12 * 1024 ** 2],
    ['Blue hour.notes', 62_000],
    ['Color sheet.pdf', 31_000],
    ['Field recordings.flac', 7 * 1024 ** 2],
    ['Reference clip.mov', 8 * 1024 ** 2],
    ['Sequence log.txt', 10_000]
  ]) {
    const content = Buffer.alloc(bytes, bytes % 127)
    await fsp.writeFile(join(exact, name), content)
    await fsp.writeFile(join(exact, 'Archive', name), content)
    await fsp.writeFile(join(exact, 'Delivery', name), content)
    const other = Buffer.from(content)
    other[other.length - 1]++
    await fsp.writeFile(join(exact, name + '.variant'), other)
  }
  await fsp.link(join(exact, 'Audio master.wav'), join(exact, 'Delivery', 'Existing hard link.wav'))
  for (const file of ['Over limit A.bin', 'Over limit B.bin']) {
    const fd = await fsp.open(join(exact, file), 'wx')
    try {
      await fd.write('allocated')
      await fd.truncate(256 * 1024 ** 2 + 1)
    } finally {
      await fd.close()
    }
  }
  for (const [folder, count] of [
    [exact, 2000],
    [busy, 10000]
  ]) {
    await fsp.mkdir(join(folder, 'Generated'))
    for (let i = 0; i < count; i += 24)
      await Promise.all(
        Array.from({ length: Math.min(24, count - i) }, (_, n) =>
          fsp.writeFile(
            join(folder, 'Generated', `Fixture-${i + n}.dat`),
            Buffer.alloc(i + n + 20, 61)
          )
        )
      )
  }
}

async function seedPhotos(main) {
  const image = (size, slope, variation, mime) =>
    main.webContents
      .executeJavaScript(
        `(() => {
    const width = ${size}, height = Math.round(width * 2 / 3);
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    const colors = [34, 142, 53, 192, 79, 179, 71, 203, 116];
    for (let y = 0; y < 8; y++) for (let x = 0; x < 9; x++) {
      const base = ${slope} < 0 ? 240 - colors[x] : colors[x];
      const level = base + (y - 4) * 4 + (${variation} && y === 3 && x === 4 ? 108 : 0);
      ctx.fillStyle = 'rgb(' + [level, level + (y < 4 ? 14 : 3), level + (x < 4 ? 0 : 9)].join(',') + ')';
      ctx.fillRect(Math.floor(x * width / 9), Math.floor(y * height / 8), Math.ceil(width / 9) + 1, Math.ceil(height / 8) + 1);
    }
    ctx.fillStyle = ${slope} < 0 ? '#5f4f32' : '#223748';
    ctx.beginPath(); ctx.moveTo(width * .12, height * .73); ctx.lineTo(width * .94, height * .77);
    ctx.lineTo(width * .46, height * .49); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#eaad68'; ctx.beginPath(); ctx.arc(width * .72, height * .23, height * .077, 0, Math.PI * 2); ctx.fill();
    return canvas.toDataURL(${JSON.stringify(mime)}, .64).split(',')[1]
  })()`
      )
      .then((text) => Buffer.from(text, 'base64'))
  const base = await image(360, 1, false, 'image/png')
  await fsp.writeFile(join(photos, '01 Evening ridgeline.png'), base)
  await fsp.writeFile(
    join(photos, '02 Resized and recompressed.jpg'),
    await image(180, 1, false, 'image/jpeg')
  )
  await fsp.writeFile(join(photos, '03 Exact raster copy.png'), base)
  await fsp.writeFile(
    join(photos, '04 Minor scene edit.png'),
    await image(360, 1, true, 'image/png')
  )
  await fsp.writeFile(
    join(photos, '05 Different scene.png'),
    await image(360, -1, false, 'image/png')
  )
  const jpeg = await image(300, -1, false, 'image/jpeg')
  const exif = Buffer.from(
    'ffe100224578696600004d4d002a00000008000101120003000000010006000000000000',
    'hex'
  )
  const oriented = Buffer.concat([jpeg.subarray(0, 2), exif, jpeg.subarray(2)])
  await fsp.writeFile(join(photos, '06 Tall scene orientation.jpg'), oriented)
  await fsp.writeFile(join(photos, '07 Tall scene copy.jpg'), oriented)
  const oversized = Buffer.from(base)
  oversized.writeUInt32BE(4000, 16)
  oversized.writeUInt32BE(4000, 20)
  await fsp.writeFile(join(photos, 'Oversized bitmap.png'), oversized)
  await fsp.writeFile(join(photos, 'Malformed image.png'), 'not a PNG')
  await fsp.writeFile(join(photos, 'Not supported.heic'), 'test format')
  const workload = []
  for (let i = 0; i < 12; i++)
    workload.push(await image(1380 + i * 24, i % 2 ? 1 : -1, i % 3 === 0, 'image/jpeg'))
  for (let i = 0; i < 384; i++)
    await fsp.writeFile(join(photos, `Photo fixture ${i}.jpg`), workload[i % workload.length])
}

function rows() {
  try {
    const db = new Database(join(profile, 'sentinel.db'), { readonly: true, fileMustExist: true })
    try {
      return db.prepare('SELECT COUNT(*) AS n FROM metric_snapshots').get().n
    } finally {
      db.close()
    }
  } catch {
    return 0
  }
}

async function main() {
  assert.equal(process.arch, 'arm64')
  await app.whenReady()
  await seedFiles()
  const win = await until(
    () =>
      BrowserWindow.getAllWindows().find((item) => item.webContents.getURL().startsWith('file:')),
    'main window'
  )
  win.setContentSize(1200, 800)
  win.show()
  const js = (source) => win.webContents.executeJavaScript(source)
  const call = (method, ...args) => js(`window.electronAPI.${method}(...${JSON.stringify(args)})`)
  const check = (test, label) => until(() => js(test), label)
  const state = () => call('getDuplicateSession').then((reply) => reply.snapshot)
  const terminal = () =>
    until(
      async () => {
        const reading = await state()
        return ['complete', 'partial', 'cancelled', 'failed'].includes(reading?.state) && reading
      },
      'terminal analysis',
      90000
    )
  const click = (name) =>
    check(
      `(() => {
    const text = ${JSON.stringify(name)};
    const button = [...document.querySelectorAll('main button, main summary')].find(node =>
      !node.disabled && node.getClientRects().length && (node.textContent.trim() === text ||
        node.querySelector(':scope > bdi')?.textContent === text || node.getAttribute('aria-label') === text));
    if (!button) return false; button.click(); return true;
  })()`,
      name
    )
  const set = (selector, value) =>
    js(`(() => {
    const node = document.querySelector(${JSON.stringify(selector)});
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(node, ${JSON.stringify(value)});
    node.dispatchEvent(new Event('input', {bubbles:true})); node.dispatchEvent(new Event('change', {bubbles:true}));
  })()`)
  const capture = async (name) => {
    const screenshot = await win.webContents.capturePage()
    assert.ok(!screenshot.isEmpty(), name)
    if (captures) {
      fs.mkdirSync(captures, { recursive: true })
      fs.writeFileSync(join(captures, name + '.png'), screenshot.toPNG())
    }
    return { screenshot: name, viewport: win.getContentSize() }
  }
  const screenshots = []
  await seedPhotos(win)
  await assert.rejects(call('getDuplicateSession'), /Open Duplicate Files/)
  await js('location.hash = "#/duplicates"')
  await check('document.querySelector(".duplicate-workbench") !== null', 'analyzer route')
  await until(() => frames > 0 && rows() > 0, 'monitoring capture')
  cancelledPicker = true
  await click('Choose folder')
  await until(() => pickerCalls === 1, 'native picker substitution')
  assert.equal(await state(), null)
  cancelledPicker = false
  await assert.rejects(call('chooseDuplicateScope', '/tmp'), /Invalid analysis mode/)
  const query = {
    text: '',
    sort: 'bytes',
    threshold: 10,
    page: 0,
    memberPage: 0,
    group: null,
    hideEmpty: true
  }
  const baseline = { frames, rows: rows(), metricBytes }
  delay.enable()
  delay.reset()
  let maxRss = 0,
    maxWorkingSet = 0,
    maxWorkerHeap = 0
  let samplePending = false
  const timer = setInterval(() => {
    maxRss = Math.max(maxRss, process.memoryUsage.rss())
    maxWorkingSet = Math.max(
      maxWorkingSet,
      app.getAppMetrics().reduce((n, p) => n + (p.memory?.workingSetSize ?? 0) * 1024, 0)
    )
    if (samplePending) return
    samplePending = true
    void Promise.all(
      [...handles].map(async (worker) => {
        try {
          maxWorkerHeap = Math.max(
            maxWorkerHeap,
            (await worker.getHeapStatistics?.())?.total_heap_size ?? 0
          )
        } catch {
          /* Exiting worker */
        }
      })
    ).finally(() => {
      samplePending = false
    })
  }, 150)
  const cpuAt = process.cpuUsage()
  const read = async (scan, options = query) => call('queryDuplicateScan', scan.id, options)
  let exactReading, photoReading, elapsedQueryMs, elapsedPreviewMs, cancelMs, monitorDuringPhotos
  try {
    await click('Choose folder')
    const ready = await until(state, 'authorized folder')
    assert.equal(ready.state, 'ready')
    await assert.rejects(
      call('startDuplicateScan', '00000000-0000-4000-8000-000000000001'),
      /no longer available/
    )
    await click('Start analysis')
    exactReading = await terminal()
    assert.equal(exactReading.state, 'partial')
    assert.equal(exactReading.skipped.resourceLimit, 2)
    assert.equal(exactReading.groups, 6)
    await assert.rejects(read(ready), /no longer available/)
    await assert.rejects(
      read(exactReading, { ...query, path: '/private' }),
      /Invalid analysis query/
    )
    const queryStarted = performance.now()
    const files = await read(exactReading)
    elapsedQueryMs = performance.now() - queryStarted
    assert.deepEqual([files.groups[0].paths, files.groups[0].copies], [4, 3])
    await click('Audio master.wav')
    await check(
      'document.querySelector(".duplicate-inspector")?.textContent.includes("Byte-for-byte match")',
      'verification inspector'
    )
    await click('Existing hard link.wav')
    await check(
      'document.querySelector(".duplicate-inspector")?.textContent.includes("Counted with its file")',
      'hard link inspector'
    )
    screenshots.push(await capture('01-exact-dark-inspector'))
    await set('input[type=search][placeholder="Search file names"]', 'Sequence')
    await check(
      'document.querySelector(".duplicate-groups tbody")?.rows.length === 1 && document.querySelector(".duplicate-groups tbody")?.textContent.includes("Sequence log")',
      'search across exact groups'
    )

    await click('Similar photos')
    await until(async () => (await state()) === null, 'mode switch disposes old authorization')
    choice = photos
    await click('Choose folder')
    const beforePhotos = { frames, rows: rows() }
    await click('Start analysis')
    photoReading = await terminal()
    monitorDuringPhotos = { frames: frames - beforePhotos.frames, rows: rows() - beforePhotos.rows }
    assert.equal(photoReading.state, 'partial')
    assert.equal(photoReading.skipped.decoderUnavailable, 0, JSON.stringify(photoReading))
    assert.equal(photoReading.skipped.unsupportedFormat, 1)
    assert.equal(photoReading.skipped.invalidImage, 1)
    assert.equal(photoReading.skipped.imageLimit, 1)
    const photoGroups = await read(photoReading, { ...query, sort: 'name' })
    const first = photoGroups.groups.find((group) => group.label.startsWith('01 '))
    const tall = photoGroups.groups.find((group) => group.label.startsWith('06 '))
    assert.ok(first && tall, JSON.stringify(photoGroups))
    const images = await read(photoReading, { ...query, group: first.id })
    const compared = images.members.find((m) => m.name.startsWith('02 '))
    assert.ok(
      compared && !compared.byteEqual && compared.image.width === 180,
      JSON.stringify(images)
    )
    assert.ok(images.members.some((m) => m.name.startsWith('03 ') && m.byteEqual))
    assert.ok(!images.members.some((m) => m.name.startsWith('05 ')))
    assert.ok(images.members.some((m) => m.name.startsWith('04 ') && m.distance > 0))
    const oriented = await read(photoReading, { ...query, group: tall.id })
    assert.deepEqual(oriented.members[0].image, { width: 200, height: 300, format: 'jpeg' })
    assert.equal(
      await call('previewDuplicateMember', photoReading.id, first.id, oriented.members[0].id),
      null
    )
    const previewAt = performance.now()
    const preview = await call('previewDuplicateMember', photoReading.id, first.id, compared.id)
    elapsedPreviewMs = performance.now() - previewAt
    assert.match(preview.reference, /^data:image\/png;base64,/)
    assert.match(preview.member, /^data:image\/png;base64,/)
    assert.ok(preview.member.length <= 210000)
    await until(() => liveDecoders === 0, 'preview renderer cleanup')
    await click('01 Evening ridgeline.png')
    await check(
      '[...document.querySelectorAll(".duplicate-comparison img")].filter(i => i.naturalWidth > 0).length === 2',
      'visible paired previews'
    )
    screenshots.push(await capture('02-photo-dark-comparison'))
    await click('3 skips / limits')
    screenshots.push(await capture('03-coverage-unsupported'))
    await click('3 skips / limits')
    await set('input[type=range][aria-label="Maximum Hamming distance"]', '0')
    await check(
      '!document.querySelector(".duplicate-files tbody")?.textContent.includes("04 Minor scene edit") && document.querySelector(".duplicate-filters output")?.value.includes("0")',
      'threshold filters from fixed reference'
    )
    const settings = await call('getUiSettings')
    await call('saveUiSettings', { appearance: { ...settings.ui.appearance, theme: 'glacier' } })
    await check('document.documentElement.dataset.theme === "glacier"', 'light appearance')
    await check(
      '[...document.querySelectorAll(".duplicate-comparison img")].filter(i => i.naturalWidth > 0).length === 2',
      'light paired previews'
    )
    screenshots.push(await capture('04-photo-light-filter'))
    win.setContentSize(900, 650)
    await check('innerWidth === 900', 'compact viewport')
    await click('Comparison')
    await check(
      'document.querySelector(".duplicate-inspector").getClientRects().length > 0',
      'compact comparison pane'
    )
    await check(
      '[...document.querySelectorAll(".duplicate-comparison img")].filter(i => i.naturalWidth > 0 && i.getClientRects().length).length === 2',
      'compact paired previews'
    )
    screenshots.push(await capture('05-compact-comparison'))
    await click('Results')
    await check(
      'document.querySelector(".duplicate-results").getClientRects().length > 0',
      'compact results pane'
    )
    const keyboard = win.webContents.debugger
    const focused = await js(`(() => {
      const button = document.querySelector('.duplicate-groups tbody button');
      button.focus(); return document.activeElement === button;
    })()`)
    assert.equal(focused, true)
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
      async () => (await js('document.activeElement?.getAttribute("aria-pressed")')) === 'true',
      'keyboard group activation'
    )

    await click('Exact duplicates')
    choice = busy
    await click('Choose folder')
    await click('Start analysis')
    await check('!!document.querySelector(".duplicate-start progress")', 'active analysis progress')
    screenshots.push(await capture('06-active-discovery'))
    const cancelAt = performance.now()
    await click('Cancel analysis')
    const cancelled = await terminal()
    cancelMs = performance.now() - cancelAt
    assert.equal(cancelled.state, 'cancelled')
    await check(
      'document.querySelector(".duplicate-status").textContent.includes("Cancelled")',
      'cancel coverage'
    )
    screenshots.push(await capture('07-cancelled'))
    await click('Discard')
    await until(() => handles.size === 0, 'worker disposal')
    assert.equal(await state(), null)
  } catch (error) {
    console.log(
      JSON.stringify({
        exactReading: exactReading && { ...exactReading, id: undefined, scope: undefined },
        photoReading: photoReading && { ...photoReading, id: undefined, scope: undefined },
        screenshots,
        duplicateRequests
      })
    )
    throw error
  } finally {
    clearInterval(timer)
    delay.disable()
  }
  const delta = {
    frames: frames - baseline.frames,
    rows: rows() - baseline.rows,
    estimatedMetricBytes: metricBytes - baseline.metricBytes
  }
  assert.ok(delta.frames >= 1 && delta.rows >= 1, JSON.stringify(delta))
  console.log(
    JSON.stringify({
      buildId: process.env.SENTINEL_DUPLICATE_BUILD_ID ?? 'development',
      exact: { ...exactReading, id: undefined, scope: undefined },
      photos: { ...photoReading, id: undefined, scope: undefined },
      elapsedQueryMs,
      elapsedPreviewMs,
      cancelMs,
      monitorDuringWorkload: delta,
      monitorDuringPhotos,
      duplicateRequests,
      screenshots,
      peakDecoders,
      decoderCreated,
      maxMainRssMiB: maxRss / 1024 ** 2,
      maxSummedWorkingSetMiB: maxWorkingSet / 1024 ** 2,
      maxWorkerHeapMiB: maxWorkerHeap ? maxWorkerHeap / 1024 ** 2 : null,
      browserProcessCpuMs: Object.fromEntries(
        Object.entries(process.cpuUsage(cpuAt)).map(([key, us]) => [key, us / 1000])
      ),
      mainEventLoopMs: { p95: delay.percentile(95) / 1e6, max: delay.max / 1e6 }
    })
  )
  console.log(
    'PASS: native macOS duplicate authorization, verification, safe photos, previews, filtering, keyboard, cancellation and recording.'
  )
  app.quit()
}

void main().catch((error) => {
  console.error(error)
  void Promise.all([...handles].map((worker) => worker.terminate())).finally(() => app.exit(1))
})
