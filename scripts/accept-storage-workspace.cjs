/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { mkdir, writeFile } = require('node:fs/promises')
const { join, dirname } = require('node:path')
const { setTimeout: wait } = require('node:timers/promises')
const { app, BrowserWindow, dialog, ipcMain } = require('electron')
const captures = process.env.SENTINEL_STORAGE_CAPTURES
const root = fs.mkdtempSync(join(fs.realpathSync('/tmp'), 'sentinel-workspace-design-'))
const profile = join(root, 'profile')
const fixture = join(root, 'Synthetic media workstation')
const busyFixture = join(root, 'Synthetic file count fixture')
let choice = fixture,
  unavailable = false
fs.mkdirSync(profile)
fs.writeFileSync(
  join(profile, 'settings.json'),
  JSON.stringify({ settingsVersion: 1, anomalyNotifications: false })
)
app.setPath('userData', profile)
app.setPath('sessionData', profile)
delete process.env.ELECTRON_RENDERER_URL
app.on('quit', () => fs.rmSync(root, { recursive: true, force: true, maxRetries: 3 }))
dialog.showOpenDialog = async (_win, options) => {
  assert.deepEqual(options.properties, ['openDirectory', 'noResolveAliases', 'dontAddToRecent'])
  return { canceled: false, filePaths: [choice] }
}
const register = ipcMain.handle.bind(ipcMain)
const unknown = (value) => ({
  ...value,
  allocated: null,
  allocatedUnknown: value.files,
  parentShare: null,
  scopeShare: null
})
ipcMain.handle = (channel, listener) =>
  register(channel, async (event, ...args) => {
    const value = await listener(event, ...args)
    if (unavailable && channel === 'storage-session' && value?.totals)
      return { ...value, totals: unknown(value.totals) }
    if (unavailable && value && channel === 'storage-query' && args[1]?.basis === 'allocated') {
      return {
        ...value,
        map: [],
        folder: unknown(value.folder),
        mapFolder: unknown(value.mapFolder),
        rows: value.rows.map(unknown),
        selected: value.selected ? { ...value.selected, item: unknown(value.selected.item) } : null,
        categories: value.categories.map((row) => ({ ...row, totals: unknown(row.totals) }))
      }
    }
    return value
  })
require('../out/main/index.js')

async function until(check, label, maxMs = 15000) {
  const end = performance.now() + maxMs
  while (performance.now() < end) {
    const value = await check()
    if (value) return value
    await wait(45)
  }
  throw new Error(`Timed out: ${label}`)
}

async function seed() {
  for (const [path, bytes] of [
    ['Media/Footage/Studio session.mov', 11_200_000],
    ['Media/Still photos.png', 4_200_000],
    ['Media/Closing theme.flac', 2_100_000],
    ['Projects/node_modules/synthetic.module', 7_900_000],
    ['Projects/.next/static/chunk.bin', 3_200_000],
    ['Backups.backupdb/Local backup.bin', 8_500_000],
    ['Library/Application Support/Editor/session.db', 2_410_000],
    ['Library/Caches/Cache.bin', 1_220_000],
    ['Workshop notes.pdf', 1_830_000],
    ['Release notes.txt', 75_000],
    ['Meeting.ogg', 105_000],
    ['Color studies.zip', 750_000],
    ['Example.app/Contents/Resources/Editor icon', 1_600_000],
    ['README', 65_000],
    ['Layout drafts/Notes.txt', 88_600],
    ['Delivery.pptx', 790_000],
    ['Reference clips.zip', 81_000],
    ['Legal notice.pdf', 26_000]
  ]) {
    const file = join(fixture, path)
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, Buffer.alloc(bytes, 58))
  }
  fs.mkdirSync(join(fixture, 'Empty folder'))
  fs.symlinkSync(fixture, join(fixture, 'Excluded link'))
  fs.linkSync(join(fixture, 'Workshop notes.pdf'), join(fixture, 'Workshop notes copy.pdf'))
  await mkdir(busyFixture)
  for (let i = 0; i < 16000; i += 32)
    await Promise.all(
      Array.from({ length: 32 }, (_, j) =>
        writeFile(join(busyFixture, `Generated-${i + j}.txt`), 'fixture')
      )
    )
}

async function run() {
  await app.whenReady()
  await seed()
  const main = await until(
    () => BrowserWindow.getAllWindows().find((win) => win.webContents.getURL().startsWith('file:')),
    'main'
  )
  const js = (source) => main.webContents.executeJavaScript(source)
  const check = (source, label) => until(() => js(source), label)
  const state = (name) =>
    check(
      `window.electronAPI.getStorageSession().then(s => s?.state === ${JSON.stringify(name)} && s)`,
      name
    )
  const call = (name, ...args) => js(`window.electronAPI.${name}(...${JSON.stringify(args)})`)
  const click = (label) =>
    check(
      `(() => {
    const name = ${JSON.stringify(label)};
    const control = [...document.querySelectorAll('main button, main summary')].find(node => !node.disabled && node.getClientRects().length && (node.textContent.trim() === name || node.getAttribute('aria-label') === name));
    if (!control) return false;
    control.click(); return true;
  })()`,
      label
    )
  const set = (selector, value) =>
    js(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    const prototype = el.tagName === 'SELECT' ? HTMLSelectElement : HTMLInputElement;
    Object.getOwnPropertyDescriptor(prototype.prototype, 'value').set.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); return true;
  })()`)
  async function capture(name) {
    const image = await main.webContents.capturePage()
    assert.ok(!image.isEmpty(), name)
    if (captures) {
      fs.mkdirSync(captures, { recursive: true })
      fs.writeFileSync(join(captures, name + '.png'), image.toPNG())
    }
    console.log(JSON.stringify({ screenshot: name, viewport: main.getContentSize() }))
  }
  async function size(width, height) {
    main.setContentSize(width, height)
    await wait(140)
  }
  async function rows() {
    await check(
      'document.querySelector(".storage-table tbody tr") && !document.querySelector(".storage-table-scroll[aria-busy=true]")',
      'stable rows'
    )
  }
  async function key(key, code, windowsVirtualKeyCode) {
    const debug = main.webContents.debugger
    debug.attach('1.3')
    try {
      await debug.sendCommand('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key,
        code,
        windowsVirtualKeyCode
      })
      await debug.sendCommand('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key,
        code,
        windowsVirtualKeyCode
      })
    } finally {
      debug.detach()
    }
  }
  main.show()
  main.focus()
  if (process.platform === 'darwin') app.focus({ steal: true })
  await size(1200, 800)
  await assert.rejects(() => call('getStorageSession'), /Open Storage Explorer/)
  await js('location.hash = "#/storage"; true')
  await click('Choose location')
  await state('ready')
  await click('Start scan')
  const initial = await state('partial')
  assert.equal(initial.skipped.links, 1)
  assert.equal(initial.totals.hardLinkAliases, 1)
  await rows()
  const bounds = await js(`(() => {
    const main = document.querySelector('main');
    return {
      wholePageOverflow: main.scrollHeight - main.clientHeight,
      tableOverflowsHorizontally: document.querySelector('.storage-table-scroll').scrollWidth > document.querySelector('.storage-table-scroll').clientWidth,
      panes: ['.storage-toolbar','.storage-browser','.storage-map-pane','.storage-inspector','.storage-status'].map(selector => {
        const { x,y,width,height,bottom } = document.querySelector(selector).getBoundingClientRect();
        return { x,y,width,height,bottom, visible: width > 0 && height > 0 && bottom <= innerHeight + 1 };
      })
    };
  })()`)
  assert.ok(bounds.wholePageOverflow <= 1 && bounds.panes.every(({ visible }) => visible))
  assert.equal(bounds.tableOverflowsHorizontally, false)
  console.log(JSON.stringify({ layout: bounds }))
  await capture('01-dark-default-1200')
  await click('Media, folder')
  await check(
    'document.querySelector(".radial-sector[data-ring=inner][aria-pressed=true]")?.getAttribute("aria-label").startsWith("Media:") && document.querySelectorAll(".radial-sector[data-ring=outer]").length > 0',
    'row selected in radial map and nested children visible'
  )
  await capture('02-directory-selected')
  await js(
    'document.querySelector(".radial-sector[data-ring=inner][aria-pressed=true]").focus(); true'
  )
  await key('Enter', 'Enter', 13)
  await check(
    'document.querySelector("[aria-current=location]")?.textContent === "Media"',
    'radial keyboard drill-down'
  )
  await click('Back')
  await rows()
  await click('Treemap')
  await click('Media, folder')
  await check(
    'document.querySelector(".storage-tile[aria-pressed=true]")?.getAttribute("aria-label").startsWith("Media:")',
    'row selected in map'
  )
  await check(
    'document.querySelector(".storage-entry-title")?.textContent === "Media"',
    'row selected in inspector'
  )
  await capture('14-treemap-alternative')
  await js('document.querySelector(".storage-tile[aria-pressed=true]").focus(); true')
  await key('Enter', 'Enter', 13)
  await check(
    'document.querySelector("[aria-current=location]")?.textContent === "Media"',
    'keyboard drill-down'
  )
  await rows()
  await capture('03-map-drill-down')
  await click('Back')
  await check(
    'document.querySelector("[aria-current=location]")?.textContent === "Synthetic media workstation"',
    'Back'
  )
  await click('Forward')
  await check(
    'document.querySelector("[aria-current=location]")?.textContent === "Media"',
    'Forward'
  )
  await click('Parent folder')
  await rows()
  await js(`document.querySelector('.storage-entry[tabindex="0"]').focus(); true`)
  await key('ArrowDown', 'ArrowDown', 40)
  await check(
    'document.activeElement.getAttribute("aria-pressed") === "true"',
    'keyboard row selection'
  )
  await set('.storage-search input', 'Workshop notes')
  await check(
    'document.querySelector(".storage-pager")?.textContent.includes("2 matches")',
    'search results'
  )
  await click('Workshop notes.pdf, file')
  await check(
    'document.querySelector(".storage-entry-title")?.textContent === "Workshop notes.pdf"',
    'file inspector'
  )
  await capture('04-search-file-inspector')
  await click('Largest')
  await rows()
  await capture('05-largest-files')
  await click('Categories')
  if (await js('Boolean(document.querySelector(".storage-inspector .storage-button"))'))
    await click('Clear selection')
  await check('Boolean(document.querySelector(".storage-category-list li"))', 'category accounting')
  await capture('06-categories')
  await click('Columns')
  await js(`(() => {
    [...document.querySelectorAll('.storage-columns-menu label')].find(item => item.textContent.includes('entire indexed scope')).querySelector('input').click(); return true;
  })()`)
  await check(
    'document.querySelector(".storage-table thead")?.textContent.includes("Scope %")',
    'optional column'
  )
  assert.ok(
    JSON.parse(await js('localStorage.getItem("sentinel.storage.columns.v1")')).includes(
      'scopeShare'
    )
  )
  await capture('07-column-configuration')
  await click('Restore defaults')
  await click('Columns')
  await click('Folder')
  await set('.storage-map-size select', 'expanded')
  await check(
    'document.querySelector(".storage-body")?.dataset.mapSize === "expanded"',
    'keyboard-size control'
  )
  await size(900, 650)
  await click('Inspector')
  await check(
    'Boolean(document.querySelector(".storage-inspector").getClientRects().length)',
    'compact inspector'
  )
  await capture('08-compact-inspector')
  await click('Map')
  await capture('09-compact-map')
  const prefs = await call('getUiSettings')
  await call('saveUiSettings', { appearance: { ...prefs.ui.appearance, theme: 'glacier' } })
  await check('document.documentElement.dataset.theme === "glacier"', 'light theme')
  await size(1540, 900)
  await capture('10-light-wide')
  unavailable = true
  await js('location.hash = "#/"; true')
  await check('document.querySelector("main h2")?.textContent === "Overview"', 'return to overview')
  await js('location.hash = "#/storage"; true')
  await rows()
  await set('.storage-basis select', 'allocated')
  await click('Radial')
  await check(
    'document.querySelector(".storage-map-pane")?.textContent.includes("No positive measured sizes") && !document.querySelector(".radial-sector")',
    'unavailable allocation'
  )
  await js(`(() => {
    const note=document.createElement('div');
    note.textContent='TEST FIXTURE · ALLOCATION UNAVAILABLE';
    note.style.cssText='position:fixed;top:5px;right:8px;z-index:100;background:var(--bg-card);color:var(--text-primary);border:1px solid var(--border-strong);padding:4px 8px';
    document.body.append(note); return true;
  })()`)
  await capture('11-unavailable-allocation-simulated')
  await js('document.body.lastElementChild.remove(); true')
  unavailable = false
  choice = busyFixture
  await click('Choose location')
  const chosen = await state('ready')
  await assert.rejects(() => call('cancelStorageScan', initial.id), /no longer available/)
  await click('Start scan')
  const scanning = await state('scanning')
  await check('Boolean(document.querySelector("progress"))', 'indeterminate progress')
  await capture('12-active-scan')
  assert.notEqual(scanning.id, chosen.id)
  await click('Cancel scan')
  await state('cancelled')
  await capture('13-cancelled')
  await click('Discard scan')
  await check('window.electronAPI.getStorageSession().then(s => s === null)', 'disposed')
  console.log(
    'PASS: native workspace, sizing, table/map selection, keyboard, filters, themes and scan lifecycle.'
  )
}

void run()
  .then(() => app.quit())
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
    app.quit()
  })
