# Changelog

All notable changes to Sentinel are documented in this file.

## 0.5.0 (pending publication)

### Monitoring and Desktop

- Collect nine configurable metric groups independently. Timed-out probes cannot overlap themselves, failures back off, and groups retain their own timestamps and availability.
- Record fresh CPU temperatures even if utilization is unavailable. Preserve nullable history, existing preferences and alerts.
- Show estimated reclaimable APFS storage separately from immediately free storage. Record disk throughput in bytes/s and keep legacy operations/s in separate CSV columns. Correct rate handling after counter resets and display resident process memory rather than virtual address space.
- Reduce work in History and avoid sending live frames to hidden windows or process data to unrelated views. Paused startup still displays an initial reading and background recording continues.
- Preserve settings, alert records, and existing SQLite history through transactional schema updates. Missing readings remain empty instead of becoming zero.

### Safety and Distribution

- Make third-party macOS LaunchAgent and LaunchDaemon inventory read-only. Show plist configuration, not running state; Sentinel's own Launch at Login setting is unchanged.
- Require native confirmation and recheck process identity before terminating. Restrict renderer permissions and IPC, and remove direct device identifiers from diagnostic ZIPs.
- Prepare a source-first release with separate local packages and manually dispatched binary candidates. Public macOS and Windows signing requirements remain in force.
- Add regression tests, isolated desktop checks, a reproducible benchmark, GitHub issue forms, CodeQL and Dependabot configuration.
- Native Apple Silicon desktop and ad-hoc packaging were verified. Linux ARM64 checks ran in a container; native Linux, Windows, and Intel macOS desktops are not yet verified.

## [0.4.4] - 2026-07-03

- Updated the version and tag documentation. Verified the locally packaged macOS app's version and launch.

## [0.4.3] - 2026-07-03

- Separated ad-hoc macOS development signing from public signing and notarization.
- Improved disk reporting and dashboard stability across platforms.

## [0.4.0] - 2026-06-15

### Added

- Network Connections page with local-only connection inspection, search, protocol and state
  filters, process grouping, and copy actions.
- Floating Mini Monitor with live CPU, memory, GPU, network, and battery metrics.
- Diagnostic Bundle export containing privacy-filtered reports, history, alerts, settings, and
  application metadata.
- Persistent Alert History with unread state, retention controls, and compact alert analytics.
- Process Details drawer with extended process metadata and safe quick actions.
- Dashboard widget reordering with migration-safe persistence for future widgets.
- Historical alert markers for correlating alerts with CPU, memory, disk, and battery charts.
- Dashboard mini charts and Compact, Comfortable, and Detailed density modes.

### Changed

- Improved dashboard customization, metric trend presentation, responsive controls, and widget
  layout behavior.
- Expanded report privacy disclosures and sanitization for troubleshooting exports.
- Centralized live metric collection so dashboard, tray, history, and mini-monitor consumers share
  snapshots.

### Fixed

- Corrected Mini Monitor restoration and shutdown lifecycle behavior.
- Constrained tray popover sizing and separated tray state from the main application window.
- Improved macOS Launch at Login failures and unsupported thermal sensor messaging.

## [0.3.1] - 2026-06-14

- Corrected tray sizing and position and tightened tray quit handling.

## [0.3.0] - 2026-06-14

- Added configurable alerts, dashboard customization, thermal history on supported systems, and JSON/TXT system exports.

## [0.2.1] - 2026-06-13

- Improved saved UI preferences, pause behavior, CSV exports, packaging metadata, and development checks.

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

[0.4.0]: https://github.com/Drippyz1/sentinel/compare/v0.3.1...v0.4.0
[0.4.4]: https://github.com/Drippyz1/sentinel/releases/tag/v0.4.4
[0.4.3]: https://github.com/Drippyz1/sentinel/releases/tag/v0.4.3
[0.3.1]: https://github.com/Drippyz1/sentinel/releases/tag/v0.3.1
[0.3.0]: https://github.com/Drippyz1/sentinel/releases/tag/v0.3.0
[0.2.1]: https://github.com/Drippyz1/sentinel/releases/tag/v0.2.1
[0.2.0]: https://github.com/Drippyz1/sentinel/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Drippyz1/sentinel/releases/tag/v0.1.0
