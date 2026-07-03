# Sentinel Release Guide

Sentinel uses Electron Builder for local development packages and public release artifacts.
Build each platform on its native operating system because the app includes the native
`better-sqlite3` module.

## Local Packages

Local packages are developer artifacts. macOS local packages are ad-hoc signed and use
`build/entitlements.mac.plist`, including disabled library validation so Electron's nested
frameworks can load under hardened runtime without a Developer ID team.

```bash
npm run dist:mac:dev
npm run build:win
npm run build:linux
```

Gatekeeper is expected to reject unsigned/ad-hoc macOS local packages. They are for local smoke
testing only and must not be published as public release artifacts.

## Public Release Packages

Public release packages use `electron-builder.release.yml`.

```bash
npm run dist:mac:release
npm run dist:win
npm run dist:linux
```

`npm run dist` is an alias for the macOS public release build on macOS.

### macOS Requirements

macOS public releases require both Developer ID signing and notarization.

Signing can be supplied by one of:

- `CSC_LINK` and `CSC_KEY_PASSWORD`
- `CSC_NAME`
- a local keychain containing a `Developer ID Application` identity

Notarization can be supplied by one of:

- `APPLE_API_KEY`, `APPLE_API_KEY_ID`, and `APPLE_API_ISSUER`
- `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`
- `APPLE_KEYCHAIN` and `APPLE_KEYCHAIN_PROFILE`

Release macOS entitlements use `build/entitlements.mac.release.plist` and inherited release
entitlements. Local dev entitlements intentionally differ so ad-hoc packages can launch without
being mistaken for distributable artifacts.

Electron Builder's in-signing Gatekeeper assessment is disabled because notarization happens later
in the package flow. `verify:mac:release` performs the Gatekeeper check after the package is signed
and notarized.

Verify macOS packages with:

```bash
npm run verify:mac -- --app dist/mac-arm64/Sentinel.app
npm run verify:mac:release -- --app dist/mac-arm64/Sentinel.app
npm run verify:mac -- --app dist/mac-arm64/Sentinel.app --launch
```

`verify:mac:release` requires a real Team ID and a passing Gatekeeper assessment.

### Windows Requirements

Windows public releases require Authenticode signing. Provide either:

- `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD`
- `CSC_LINK` and `CSC_KEY_PASSWORD`

Set `SENTINEL_ALLOW_UNSIGNED_WINDOWS_RELEASE=1` only for internal unsigned test artifacts.

### Linux Requirements

Linux release builds produce AppImage and deb artifacts from `electron-builder.release.yml`.
The release profile avoids Snap in CI because Snap packaging requires extra host tooling.

## Versioning

Release tags must match `package.json` exactly:

```bash
git tag v0.4.4
git push origin v0.4.4
```

`npm run verify:version` checks that `package.json`, `package-lock.json`, the GitHub tag, and
the Electron Builder app identity agree before release packaging.

## 0.4.4 Release Flow

Create the release tag from the verified commit that contains the 0.4.4 version bump:

```bash
git status
npm run verify
git add .
git commit -m "Prepare release 0.4.4"
git push

git tag v0.4.4
git push origin v0.4.4
```

If `v0.4.4` already exists and points at the wrong commit, delete and recreate it intentionally:

```bash
git tag -d v0.4.4
git push origin :refs/tags/v0.4.4
git tag v0.4.4
git push origin v0.4.4
```

The release workflow builds the commit referenced by the pushed tag, so do not reuse stale tags or
upload artifacts produced from an older commit.
