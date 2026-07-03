#!/usr/bin/env node
/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-require-imports */
const { readFileSync } = require('fs')
const { join } = require('path')
const { verifyVersionLock } = require('../../build/releaseChecks.cjs')

const root = process.cwd()
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const builderConfig = readFileSync(join(root, 'electron-builder.yml'), 'utf8')

try {
  verifyVersionLock(root)
  requireValue(builderConfig, 'appId: io.github.drippyz1.sentinel', 'electron-builder appId')
  requireValue(builderConfig, 'productName: Sentinel', 'electron-builder productName')
  console.log(`Version OK: Sentinel ${packageJson.version}`)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}

function requireValue(text, expected, label) {
  if (!text.includes(expected)) {
    throw new Error(`Unexpected ${label}; expected to find "${expected}".`)
  }
}
