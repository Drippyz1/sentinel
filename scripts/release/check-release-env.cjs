#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
const { verifyReleaseReadiness } = require('../../build/releaseChecks.cjs')

const platform = process.argv[2] ?? process.platform

try {
  verifyReleaseReadiness(process.cwd(), platform)
  console.log(`Release environment OK for ${platform}.`)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
