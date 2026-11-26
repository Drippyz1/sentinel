# Contributing to Sentinel

Check [existing issues](https://github.com/Drippyz1/sentinel/issues) first. For a large change, discuss the problem and proposed scope before implementing it. For vulnerabilities, follow the [security policy](SECURITY.md) instead of opening a public issue.

## Development

Follow the [source setup](../README.md#build-from-source). Run `npm run format:check` and `npm run verify` before sending a pull request. Run `npm run smoke:desktop` for changes to collection, storage, IPC, or window behavior; it uses a temporary profile. Report the OS and CPU architecture, and distinguish native desktop tests from container and build-only checks.

Add tests for behavior changes. Collectors should return a missing state rather than an invented value, and persistence changes should preserve existing databases and settings. The [monitoring architecture](../docs/core-monitoring.md) describes these boundaries.

## Reporting a Problem

Include the Sentinel version, OS and architecture, steps to reproduce, expected and observed behavior, and comparison commands when reporting an incorrect metric. Before posting screenshots, logs, or diagnostic exports, remove personal identifiers, local addresses, file paths, and secrets.
