# Install, Upgrade, and Troubleshoot

See [Build from Source](../README.md#build-from-source) for prerequisites and commands. Use a
local checkout of the intended release and install development dependencies: Electron and the
compiler are needed to launch from source.

## Source Launch

- **Electron uninstall:** Electron 45 defers its binary download. Sentinel's `postinstall` runs
  the locked Electron package's official `install-electron` command; Electron Vite's preview
  expects the binary to already exist. If you intentionally installed with
  `npm ci --ignore-scripts`, review and run `npm run setup:runtime` explicitly before building.
  This runs the official installer and Electron Builder's native dependency rebuild.
- **npm script policy:** A user or organization can disable install scripts or require
  approvals. Under a strict policy, review any blocked dependency hooks with the package
  manager and follow the organization's approval process. Do not turn off npm safeguards
  globally. A dependency that needs a build hook may still require its own approval.
- **Runtime download fails:** Check access to Electron release downloads on GitHub and your
  approved network configuration. Retry `npm run setup:runtime` after addressing the reported
  failure. Do not bypass checksum or certificate verification.
- **SQLite cannot load:** Quit Sentinel, verify that Node and Electron use the intended
  architecture, and rerun `npm ci`. If the native compilation fails on macOS, check that
  Python 3 and Xcode Command Line Tools are available. Do not copy native modules between
  architectures or between standalone Node and Electron.
- **Public binary unavailable:** Use the source instructions. Ad-hoc development builds are
  not notarized or publicly trusted. Do not disable Gatekeeper, SmartScreen, or antivirus.

## Upgrade and Uninstall

Quit Sentinel before switching source revisions or replacing a local app. Back up the
application profile while the app is closed. Source launches can use a different profile
name from packaged launches; on macOS, look for the matching directory under
`~/Library/Application Support`. Settings are kept in `settings.json`; History and alerts use
`sentinel.db`. Back up the full directory, not only one file.

Install and launch the new release using the same distribution type if you intend to keep
using its profile. Verify that settings and History opened as expected. Don't copy a profile
over a live installation or assume that a database migrated by a newer version can be opened
by an older version. When evaluating locally, use a separate profile.

To remove Sentinel, quit the app, disable its launch-at-login setting if enabled, then remove
the app bundle or source checkout. This does not remove the application profile. Removing
that profile is optional and destructive: it deletes local history, alerts, and settings.
