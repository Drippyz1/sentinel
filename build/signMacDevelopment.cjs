/* eslint-disable @typescript-eslint/no-require-imports */
const { join } = require('node:path')

module.exports = async ({ appOutDir, electronPlatformName, packager }) => {
  if (electronPlatformName !== 'darwin') return
  const { signAsync } = require('@electron/osx-sign')
  const app = join(appOutDir, `${packager.appInfo.productFilename}.app`)
  const entitlements = join(__dirname, 'entitlements.mac.plist')
  // Explicit ad-hoc signing avoids probing the user's keychain for a certificate.
  await signAsync({
    app,
    identity: '-',
    identityValidation: false,
    preAutoEntitlements: false,
    optionsForFile: () => ({ entitlements, hardenedRuntime: true })
  })
}
