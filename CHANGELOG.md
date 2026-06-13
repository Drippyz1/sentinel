# Changelog

All notable changes to Sentinel are documented in this file.

## [0.2.0] - 2026-06-13

> Upgrade note: v0.1.0 packages used the template version `1.0.0` and bundle identifier
> `com.electron.app`. Replace the previous installation if the operating system does not treat
> v0.2.0 as an in-place upgrade.

### Added

- Chart and table views for historical metrics.
- CSV export for the selected history range.
- Persistent dashboard, history, process, and system view preferences.
- Dashboard pause and resume controls with last-updated status.
- Process quick filters and configurable row density.
- Simple and advanced system information views.
- GitHub Actions checks for linting, type checking, and production builds.

### Changed

- Refined responsive layouts, segmented controls, metric formatting, and empty states.
- Improved settings validation and atomic persistence.
- Updated application metadata, icons, and release packaging configuration.

### Fixed

- Restored an initial dashboard snapshot when Sentinel starts with live updates paused.
- Preserved UI preferences when saving general application settings.
- Improved macOS window restoration from the Dock and menu bar.
- Made history export more compatible with spreadsheet applications.

## [0.1.0]

- Initial public release.

[0.2.0]: https://github.com/Drippyz1/sentinel/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Drippyz1/sentinel/releases/tag/v0.1.0
