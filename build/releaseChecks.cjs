/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-require-imports */
const { readFileSync } = require('fs')
const { join } = require('path')

function verifyReleaseReadiness(projectDir, platform, env = process.env) {
  verifyVersionLock(projectDir, env)
  switch (platform) {
    case 'darwin':
    case 'mac':
      verifyMacReleaseEnvironment(env)
      break
    case 'win32':
    case 'win':
      verifyWindowsReleaseEnvironment(env)
      break
    case 'linux':
      break
    default:
      throw new Error('Release platform must be mac, win, or linux.')
  }
}

function verifyVersionLock(projectDir, env = process.env) {
  const packageJson = JSON.parse(readFileSync(join(projectDir, 'package.json'), 'utf8'))
  const packageLock = JSON.parse(readFileSync(join(projectDir, 'package-lock.json'), 'utf8'))
  const lockVersion = packageLock.packages?.['']?.version ?? packageLock.version

  if (packageJson.version !== lockVersion) {
    throw new Error(
      `Release version mismatch: package.json is ${packageJson.version}, package-lock.json is ${lockVersion}. Run npm install before packaging.`
    )
  }

  const githubRefType = env.GITHUB_REF_TYPE
  const githubRefName = env.GITHUB_REF_NAME
  if (githubRefType === 'tag' && githubRefName !== `v${packageJson.version}`) {
    throw new Error(
      `Release tag mismatch: expected v${packageJson.version}, received ${githubRefName}.`
    )
  }
}

function verifyMacReleaseEnvironment(env) {
  const has = (name) => hasEnv(env, name)
  const hasSigningIdentity =
    (has('CSC_LINK') && has('CSC_KEY_PASSWORD')) || (has('CSC_NAME') && env.CSC_NAME.trim() !== '-')
  if (!hasSigningIdentity) {
    throw new Error(
      [
        'macOS public release builds require a Developer ID Application signing identity.',
        'Provide CSC_LINK/CSC_KEY_PASSWORD or set CSC_NAME to your installed Developer ID identity.',
        'Use npm run dist:mac:dev for local ad-hoc packages.'
      ].join(' ')
    )
  }

  const hasNotaryCredentials =
    (has('APPLE_API_KEY') && has('APPLE_API_KEY_ID') && has('APPLE_API_ISSUER')) ||
    (has('APPLE_ID') && has('APPLE_APP_SPECIFIC_PASSWORD') && has('APPLE_TEAM_ID')) ||
    has('APPLE_KEYCHAIN_PROFILE')

  if (!hasNotaryCredentials) {
    throw new Error(
      [
        'macOS public release builds require notarization credentials.',
        'Provide APPLE_API_KEY/APPLE_API_KEY_ID/APPLE_API_ISSUER,',
        'or APPLE_ID/APPLE_APP_SPECIFIC_PASSWORD/APPLE_TEAM_ID,',
        'or APPLE_KEYCHAIN_PROFILE (with optional APPLE_KEYCHAIN).'
      ].join(' ')
    )
  }
}

function verifyWindowsReleaseEnvironment(env) {
  const has = (name) => hasEnv(env, name)
  if (
    !(has('WIN_CSC_LINK') && has('WIN_CSC_KEY_PASSWORD')) &&
    !(has('CSC_LINK') && has('CSC_KEY_PASSWORD'))
  ) {
    throw new Error(
      [
        'Windows public release builds require code-signing credentials.',
        'Provide WIN_CSC_LINK/WIN_CSC_KEY_PASSWORD or CSC_LINK/CSC_KEY_PASSWORD.',
        'Use npm run build:win for local, non-release installers.'
      ].join(' ')
    )
  }
}

function hasEnv(env, name) {
  return typeof env[name] === 'string' && env[name].trim().length > 0
}

module.exports = {
  verifyReleaseReadiness,
  verifyVersionLock
}
