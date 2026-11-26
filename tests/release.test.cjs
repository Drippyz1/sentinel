/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict')
const { join } = require('node:path')
const { test } = require('node:test')
const { version } = require('../package.json')
const { verifyReleaseReadiness, verifyVersionLock } = require('../build/releaseChecks.cjs')
const beforePackRelease = require('../build/beforePack.release.cjs')

const root = join(__dirname, '..')

test('the release hook reads the project directory from Electron Builder PackContext', async () => {
  await assert.doesNotReject(
    beforePackRelease({
      packager: { projectDir: root },
      electronPlatformName: 'linux'
    })
  )
})

test('public packages require the correct tag and a supported platform', () => {
  assert.doesNotThrow(() =>
    verifyVersionLock(root, { GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: `v${version}` })
  )
  assert.throws(
    () => verifyVersionLock(root, { GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'v0.0.0' }),
    /tag mismatch/
  )
  assert.throws(() => verifyReleaseReadiness(root, 'unknown', {}), /release platform/i)
  assert.doesNotThrow(() => verifyReleaseReadiness(root, 'linux', {}))
})

test('public macOS and Windows packages cannot silently fall back to unsigned builds', () => {
  assert.throws(() => verifyReleaseReadiness(root, 'mac', { CSC_NAME: '-' }), /Developer ID/)
  assert.throws(
    () => verifyReleaseReadiness(root, 'mac', { CSC_NAME: 'fixture' }),
    /notarization credentials/
  )
  assert.doesNotThrow(() =>
    verifyReleaseReadiness(root, 'mac', { CSC_NAME: 'fixture', APPLE_KEYCHAIN_PROFILE: 'fixture' })
  )
  assert.throws(
    () => verifyReleaseReadiness(root, 'win', { SENTINEL_ALLOW_UNSIGNED_WINDOWS_RELEASE: '1' }),
    /code-signing credentials/
  )
  assert.throws(
    () => verifyReleaseReadiness(root, 'win', { WIN_CSC_LINK: 'fixture' }),
    /code-signing credentials/
  )
})
