/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-require-imports */
const { execFileSync } = require('child_process')
const { readFileSync } = require('fs')
const { join } = require('path')

function verifyReleaseReadiness(projectDir, platform) {
  verifyVersionLock(projectDir)

  if (platform === 'darwin' || platform === 'mac') verifyMacReleaseEnvironment()
  if (platform === 'win32' || platform === 'win') verifyWindowsReleaseEnvironment()
}

function verifyVersionLock(projectDir) {
  const packageJson = JSON.parse(readFileSync(join(projectDir, 'package.json'), 'utf8'))
  const packageLock = JSON.parse(readFileSync(join(projectDir, 'package-lock.json'), 'utf8'))
  const lockVersion = packageLock.packages?.['']?.version ?? packageLock.version

  if (packageJson.version !== lockVersion) {
    throw new Error(
      `Release version mismatch: package.json is ${packageJson.version}, package-lock.json is ${lockVersion}. Run npm install before packaging.`
    )
  }

  const githubRefType = process.env.GITHUB_REF_TYPE
  const githubRefName = process.env.GITHUB_REF_NAME
  if (githubRefType === 'tag' && githubRefName !== `v${packageJson.version}`) {
    throw new Error(
      `Release tag mismatch: expected v${packageJson.version}, received ${githubRefName}.`
    )
  }
}

function verifyMacReleaseEnvironment() {
  const hasSigningIdentity = hasEnv('CSC_LINK') || hasEnv('CSC_NAME') || hasLocalDeveloperId()
  if (!hasSigningIdentity) {
    throw new Error(
      [
        'macOS public release builds require a Developer ID Application signing identity.',
        'Provide CSC_LINK/CSC_KEY_PASSWORD, CSC_NAME, or install a Developer ID Application certificate in the keychain.',
        'Use npm run dist:mac:dev for local ad-hoc packages.'
      ].join(' ')
    )
  }

  const hasNotaryCredentials =
    (hasEnv('APPLE_API_KEY') && hasEnv('APPLE_API_KEY_ID') && hasEnv('APPLE_API_ISSUER')) ||
    (hasEnv('APPLE_ID') && hasEnv('APPLE_APP_SPECIFIC_PASSWORD') && hasEnv('APPLE_TEAM_ID')) ||
    (hasEnv('APPLE_KEYCHAIN') && hasEnv('APPLE_KEYCHAIN_PROFILE'))

  if (!hasNotaryCredentials) {
    throw new Error(
      [
        'macOS public release builds require notarization credentials.',
        'Provide APPLE_API_KEY/APPLE_API_KEY_ID/APPLE_API_ISSUER,',
        'or APPLE_ID/APPLE_APP_SPECIFIC_PASSWORD/APPLE_TEAM_ID,',
        'or APPLE_KEYCHAIN/APPLE_KEYCHAIN_PROFILE.'
      ].join(' ')
    )
  }
}

function verifyWindowsReleaseEnvironment() {
  if (process.env.SENTINEL_ALLOW_UNSIGNED_WINDOWS_RELEASE === '1') return

  if (!hasEnv('WIN_CSC_LINK') && !hasEnv('CSC_LINK')) {
    throw new Error(
      [
        'Windows public release builds require code-signing credentials.',
        'Provide WIN_CSC_LINK/WIN_CSC_KEY_PASSWORD or CSC_LINK/CSC_KEY_PASSWORD.',
        'Set SENTINEL_ALLOW_UNSIGNED_WINDOWS_RELEASE=1 only for explicitly internal unsigned test artifacts.'
      ].join(' ')
    )
  }
}

function hasLocalDeveloperId() {
  if (process.platform !== 'darwin') return false

  try {
    const output = execFileSync('security', ['find-identity', '-v', '-p', 'codesigning'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    })
    return output.includes('Developer ID Application')
  } catch {
    return false
  }
}

function hasEnv(name) {
  return typeof process.env[name] === 'string' && process.env[name].trim().length > 0
}

module.exports = {
  verifyMacReleaseEnvironment,
  verifyReleaseReadiness,
  verifyVersionLock,
  verifyWindowsReleaseEnvironment
}
