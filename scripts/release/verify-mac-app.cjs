#!/usr/bin/env node
/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-require-imports */
const { existsSync, mkdtempSync, mkdirSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')
const { execFileSync, spawn, spawnSync } = require('node:child_process')
const { DatabaseSync } = require('node:sqlite')
const { setTimeout: wait } = require('node:timers/promises')

const args = process.argv.slice(2)
const strictRelease = args.includes('--strict-release')
const launch = args.includes('--launch')
const appPathArg = getArgValue('--app') ?? findDefaultApp()
const appPath = appPathArg ? resolve(appPathArg) : null

if (process.platform !== 'darwin') {
  console.error('macOS app verification must run on macOS.')
  process.exit(1)
}

if (!appPath || !existsSync(appPath)) {
  console.error('No packaged Sentinel.app found. Pass --app /path/to/Sentinel.app.')
  process.exit(1)
}

const mainExecutable = join(appPath, 'Contents/MacOS/Sentinel')
const electronFramework = join(
  appPath,
  'Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework'
)

async function verify() {
  console.log(`Verifying ${appPath}`)
  const appDetails = printSigningDetails(appPath, 'App bundle')
  const mainDetails = printSigningDetails(mainExecutable, 'Main executable')
  const frameworkDetails = printSigningDetails(electronFramework, 'Electron Framework')

  verifyCodesign(appPath)

  if (strictRelease) {
    for (const [details, label] of [
      [appDetails, 'app bundle'],
      [mainDetails, 'main executable'],
      [frameworkDetails, 'Electron Framework']
    ]) {
      if (
        !/^[A-Z0-9]{10}$/.test(details.TeamIdentifier ?? '') ||
        details.TeamIdentifier !== appDetails.TeamIdentifier ||
        !details.Authority?.startsWith('Developer ID Application: ')
      ) {
        throw new Error(`Expected a matching Developer ID Application signature on ${label}.`)
      }
    }
    execFileSync('/usr/bin/xcrun', ['stapler', 'validate', appPath], { stdio: 'inherit' })
  }

  verifyGatekeeper(appPath, strictRelease)

  if (launch) await verifyLaunch(mainExecutable)
  console.log('macOS package verification complete.')
}

verify().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})

function getArgValue(name) {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : null
}

function findDefaultApp() {
  const candidates = [
    process.arch === 'arm64' ? 'dist/mac-arm64/Sentinel.app' : 'dist/mac/Sentinel.app',
    'dist/mac-universal/Sentinel.app'
  ]
  return candidates.find((candidate) => existsSync(candidate)) ?? null
}

function printSigningDetails(target, label) {
  const result = spawnSync('/usr/bin/codesign', ['-dv', '--verbose=4', target], {
    encoding: 'utf8'
  })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  if (result.status !== 0) throw new Error(output || `codesign details failed for ${target}`)

  const details = parseCodesignDetails(output)
  const summary = [
    `Identifier=${details.Identifier ?? 'unknown'}`,
    `TeamIdentifier=${details.TeamIdentifier ?? 'unknown'}`,
    `Signature=${details.Signature ?? 'unknown'}`
  ].join(' ')
  console.log(`${label}: ${summary}`)
  return details
}

function parseCodesignDetails(output) {
  const details = Object.create(null)
  for (const line of output.split(/\r?\n/)) {
    const field = line.match(/^(Identifier|TeamIdentifier|Signature|Authority)=(.+)$/)
    if (field) details[field[1]] ??= field[2]
  }
  return details
}

function verifyCodesign(target) {
  execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', target], {
    stdio: 'inherit'
  })
}

function verifyGatekeeper(target, required) {
  const result = spawnSync(
    '/usr/sbin/spctl',
    ['--assess', '--type', 'execute', '--verbose=4', target],
    {
      encoding: 'utf8'
    }
  )
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()

  if (result.status === 0) {
    console.log(output || 'Gatekeeper assessment accepted.')
    return
  }

  if (required) {
    throw new Error(output || 'Gatekeeper assessment failed.')
  }

  console.warn(output || 'Gatekeeper assessment rejected this dev/ad-hoc build.')
}

async function verifyLaunch(executablePath) {
  const home = mkdtempSync(join(tmpdir(), 'sentinel-package-'))
  const profile = join(home, 'profile')
  const database = join(profile, 'sentinel.db')
  mkdirSync(profile, { mode: 0o700 })
  const child = spawn(executablePath, [`--user-data-dir=${profile}`], {
    env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', HOME: home, CFFIXED_USER_HOME: home },
    stdio: 'inherit'
  })
  let stopped = false
  let spawnError
  const closed = new Promise((done) => {
    child.once('error', (error) => {
      spawnError = error
    })
    child.once('close', () => {
      stopped = true
      done()
    })
  })
  try {
    const deadline = Date.now() + 20_000
    while (!stopped && Date.now() < deadline) {
      if (existsSync(database)) {
        const reader = new DatabaseSync(database, { readOnly: true })
        try {
          if (reader.prepare('SELECT 1 FROM metric_snapshots LIMIT 1').get()) {
            console.log('Packaged app recorded a metric in an isolated profile.')
            return
          }
        } catch {
          // The child may still be initializing the database schema.
        } finally {
          reader.close()
        }
      }
      await wait(250)
    }
    throw spawnError ?? new Error('Packaged app did not record a metric within 20 seconds.')
  } finally {
    if (!stopped) child.kill('SIGTERM')
    const abort = new AbortController()
    await Promise.race([closed, wait(2_000, undefined, { signal: abort.signal })])
    abort.abort()
    if (!stopped) {
      child.kill('SIGKILL')
      await closed
    }
    rmSync(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
  }
}
