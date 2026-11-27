/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict')
const { execFileSync, spawn } = require('node:child_process')
const { randomBytes } = require('node:crypto')
const { mkdtempSync, rmSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { setTimeout: wait } = require('node:timers/promises')
const { app, BrowserWindow } = require('electron')

if (process.platform !== 'darwin')
  throw Error('This disposable native acceptance harness is macOS-only')

const profile = mkdtempSync(join(tmpdir(), 'sentinel-process-acceptance-'))
app.setPath('userData', profile)
app.setPath('sessionData', profile)
delete process.env.ELECTRON_RENDERER_URL
writeFileSync(
  join(profile, 'settings.json'),
  JSON.stringify({
    settingsVersion: 1,
    collectionIntervalsMs: { processes: 1000 },
    anomalyNotifications: false,
    ui: { dashboardWidgets: { network: false } }
  })
)

const fixtures = new Set()
app.on('quit', () => {
  for (const child of fixtures) child.stdin.end()
  rmSync(profile, { force: true, recursive: true })
})
require('../out/main/index.js')

async function until(check, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  do {
    const value = await check()
    if (value) return value
    await wait(150)
  } while (Date.now() < deadline)
  throw Error('Timed out verifying the disposable fixture or dialog')
}

async function fixture(main, choice) {
  const name = `sentinel-fixture-${randomBytes(5).toString('hex')}`
  const child = spawn(
    process.execPath,
    [
      '-e',
      `
    process.title = ${JSON.stringify(name)};
    const load = setInterval(() => {
      const deadline = performance.now() + 15;
      while (performance.now() < deadline) {}
    }, 250);
    process.stdin.on('data', () => clearInterval(load));
    process.stdin.on('end', () => process.exit(0));
    setTimeout(() => process.exit(0), 360_000).unref();
  `
    ],
    { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: ['pipe', 'ignore', 'ignore'] }
  )
  child.stdin.on('error', () => {})
  fixtures.add(child)
  try {
    assert.ok(child.pid, 'the fixture must have been spawned by this test')
    assert.ok(!app.getAppMetrics().some((entry) => entry.pid === child.pid))
    const run = (source) => main.webContents.executeJavaScript(source)
    const identity = await until(
      () =>
        run(`window.electronAPI.getLatestMetrics().then(frame =>
      frame.processes?.list.find(p => p.pid === ${child.pid} && p.name === ${JSON.stringify(name)}))`),
      20_000
    )
    const ps = execFileSync('/bin/ps', ['-p', String(child.pid), '-o', 'uid=', '-o', 'command='], {
      encoding: 'utf8'
    })
    assert.equal(ps.trim().split(/\s+/, 2).join(' '), `${process.getuid()} ${name}`)
    const target = { pid: identity.pid, name: identity.name, started: identity.started }
    assert.ok(target.started)
    child.stdin.write('idle\n')
    main.show()
    main.focus()
    console.log(`Choose ${choice} only for ${name} (PID ${child.pid}). Timeout: 5 minutes.`)
    const watchdog = new AbortController()
    let result
    try {
      result = await Promise.race([
        run(`window.electronAPI.killProcess(${JSON.stringify(target)})`),
        wait(300_000, null, { signal: watchdog.signal }).then(() => {
          throw Error('No dialog decision received')
        })
      ])
    } finally {
      watchdog.abort()
    }
    if (choice === 'Cancel') {
      assert.deepEqual(result, { success: false, cancelled: true })
      assert.equal(child.exitCode, null)
      assert.equal(child.signalCode, null)
      console.log(
        'Cancel verified: the native IPC reported cancellation and the child remained alive.'
      )
    } else {
      assert.deepEqual(result, { success: true })
      await until(() => child.signalCode === 'SIGKILL', 5000)
      console.log(
        'Terminate verified: the native IPC reported success and only the intended child exited.'
      )
    }
  } finally {
    child.stdin.end()
    await until(() => child.exitCode !== null || child.signalCode !== null, 5000)
    fixtures.delete(child)
  }
}

async function accept() {
  const main = await until(
    () => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().startsWith('file:')),
    15_000
  )
  await main.webContents.executeJavaScript('location.hash = "#/processes"; true')
  await fixture(main, 'Cancel')
  await fixture(main, 'Terminate')
  console.log('Both disposable child processes cleaned up.')
}
void app
  .whenReady()
  .then(accept)
  .then(() => app.quit())
  .catch((error) => {
    console.error(error.message)
    process.exitCode = 1
    app.quit()
  })
