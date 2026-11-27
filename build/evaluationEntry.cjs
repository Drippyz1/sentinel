/* eslint-disable @typescript-eslint/no-require-imports */
// Dedicated entry point for private evaluation packages. Normal packages use out/main/index.js.
const { app } = require('electron')
const { lstatSync, mkdirSync, readdirSync, realpathSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

const scratch = app.commandLine.getSwitchValue('sentinel-evaluation-smoke')
if (scratch && !/^sentinel-18a2-eval-[\da-zA-Z]{6}$/.test(scratch))
  throw new Error('Invalid isolated evaluation profile')
const profile = scratch
  ? join(realpathSync(tmpdir()), scratch)
  : join(app.getPath('appData'), 'Sentinel 1.8A.2 Evaluation')
if (!scratch) mkdirSync(profile, { mode: 0o700, recursive: true })
const metadata = lstatSync(profile)
if (!metadata.isDirectory() || (process.getuid && metadata.uid !== process.getuid()))
  throw new Error('Evaluation profile must be a directory owned by the current user')
if (scratch && readdirSync(profile).length) throw new Error('Smoke-test profile must be empty')
app.setPath('userData', profile)
app.setPath('sessionData', profile)

if (scratch) {
  const deadline = setTimeout(() => {
    console.error('Packaged evaluation: timed out waiting for Overview and monitoring')
    app.exit(1)
  }, 25_000)
  app.on('browser-window-created', (_event, window) => {
    window.webContents.once('did-finish-load', async () => {
      if (!window.webContents.getURL().startsWith('file:')) return
      try {
        const ready = await window.webContents.executeJavaScript(`new Promise((resolve, reject) => {
          const check = async () => {
            try {
              if (document.querySelector('.instrument-board') &&
                document.querySelector('.status-strip')?.textContent.includes('Live monitoring') &&
                (await window.electronAPI.getHistoryDownsampled(30)).length) {
                resolve(true);
                return;
              }
              setTimeout(check, 250);
            } catch (error) { reject(error); }
          };
          check();
        })`)
        if (ready && window.webContents.getLastWebPreferences().sandbox) {
          clearTimeout(deadline)
          console.log(
            'PASS: packaged evaluation rendered Overview, received live observations and used an isolated profile.'
          )
          app.quit()
        }
      } catch {
        clearTimeout(deadline)
        app.exit(1)
      }
    })
  })
}

require('./index.js')
