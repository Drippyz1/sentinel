/* eslint-disable @typescript-eslint/no-require-imports */
const { verifyReleaseReadiness } = require('./releaseChecks.cjs')

module.exports = async function beforePackRelease(context) {
  verifyReleaseReadiness(context.projectDir, context.electronPlatformName)
}
