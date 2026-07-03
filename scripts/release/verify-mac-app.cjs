#!/usr/bin/env node
/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-require-imports */
const { existsSync } = require('fs')
const { join, resolve } = require('path')
const { execFileSync, spawnSync } = require('child_process')

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

try {
  console.log(`Verifying ${appPath}`)
  const appDetails = printSigningDetails(appPath, 'App bundle')
  const mainDetails = printSigningDetails(mainExecutable, 'Main executable')
  const frameworkDetails = printSigningDetails(electronFramework, 'Electron Framework')

  verifyCodesign(appPath)

  if (strictRelease) {
    requireTeamIdentifier(appDetails, 'app bundle')
    requireTeamIdentifier(mainDetails, 'main executable')
    requireTeamIdentifier(frameworkDetails, 'Electron Framework')
  }

  verifyGatekeeper(appPath, strictRelease)

  if (launch) verifyLaunch(appPath)
  console.log('macOS package verification complete.')
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}

function getArgValue(name) {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : null
}

function findDefaultApp() {
  const candidates = [
    'dist/mac-arm64/Sentinel.app',
    'dist/mac/Sentinel.app',
    'dist/mac-universal/Sentinel.app'
  ]
  return candidates.find((candidate) => existsSync(candidate)) ?? null
}

function printSigningDetails(target, label) {
  const result = spawnSync('codesign', ['-dv', '--verbose=4', target], {
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
  return Object.fromEntries(
    output
      .split(/\r?\n/)
      .map((line) => line.match(/^([^=]+)=(.*)$/))
      .filter(Boolean)
      .map((match) => [match[1], match[2]])
  )
}

function verifyCodesign(target) {
  execFileSync('codesign', ['--verify', '--deep', '--strict', '--verbose=4', target], {
    stdio: 'inherit'
  })
}

function verifyGatekeeper(target, required) {
  const result = spawnSync('spctl', ['--assess', '--type', 'execute', '--verbose=4', target], {
    encoding: 'utf8'
  })
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

function requireTeamIdentifier(details, label) {
  if (!details.TeamIdentifier || details.TeamIdentifier === 'not set') {
    throw new Error(`Strict release verification failed: ${label} has no TeamIdentifier.`)
  }
}

function verifyLaunch(target) {
  execFileSync('open', [target], { stdio: 'ignore' })

  const executablePath = join(target, 'Contents/MacOS/Sentinel')
  const pids = waitForProcess(executablePath)
  if (pids.length === 0) {
    throw new Error('Packaged app did not appear to launch a Sentinel process.')
  }

  spawnSync('osascript', ['-e', 'tell application "Sentinel" to quit'], { stdio: 'ignore' })
  console.log('Packaged app launched successfully.')
}

function waitForProcess(executablePath) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const pids = findProcessIds(executablePath)
    if (pids.length > 0) return pids
    spawnSync('sleep', ['1'])
  }

  return []
}

function findProcessIds(executablePath) {
  const result = spawnSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8' })
  if (result.status !== 0) return []

  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.includes(executablePath))
    .map((line) => line.match(/^(\d+)/)?.[1])
    .filter(Boolean)
}
