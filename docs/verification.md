# Desktop Verification

## Reproduce

Run `npm ci`, `npm run format:check`, and `npm run verify` (lint, tests, TypeScript, production build, version and diff checks). Run `npm run smoke:desktop` and `SENTINEL_SMOKE_START_PAUSED=1 npm run smoke:desktop` against the built app. Both use temporary profiles. Run the full `npm audit` as well as `npm audit --omit=dev`: the renderer bundles some dependencies installed for builds.

`SENTINEL_BENCH_OUTPUT=/absolute/path/results.json npm run benchmark:desktop` records sanitized process aggregates, collector calls, rows and IPC measurements from an isolated seeded profile. Set `SENTINEL_BENCH_MAIN` to a frozen compiled main bundle for comparison (keep its sibling preload, renderer and runtime resources). Run sequentially on the same machine and Electron version with other workloads quiet. `SENTINEL_BENCH_CAPTURE_DIR` captures the actual dashboard and fixture History into an existing directory instead of benchmarking. Inspect captures for device identifiers before sharing.

## Baseline Comparison

One baseline and one optimization run on the same Apple Silicon Mac (macOS 26.6.2, Electron 45.5.0, Node 24.22.2 for build, 43,200 seeded rows, 2s cadence). Each short scenario used 4s warm-up and 10 samples over 20s; the final dashboard sampled 300 times over ten minutes. These are sequential local samples, not a controlled repeated performance lab. CPU and working set sum Electron per-process measurements; shared pages can be counted more than once, and OS probe subprocesses are excluded. IPC bytes estimate the JSON size, not transport bytes.

| Scenario              | CPU % before → after | Summed working set MiB before → after | Frames / new rows (both) |
| --------------------- | -------------------: | ------------------------------------: | -----------------------: |
| Dashboard             |          1.74 → 1.40 |                             503 → 439 |                  10 / 10 |
| History               |          4.19 → 0.34 |                             960 → 474 |                  10 / 10 |
| Processes             |          0.42 → 0.37 |                             698 → 467 |                  10 / 10 |
| Tray only             |          0.92 → 0.95 |                             802 → 531 |                  10 / 10 |
| Mini Monitor          |          0.25 → 0.24 |                             876 → 630 |                  10 / 10 |
| Live display paused   |          0.11 → 0.11 |                             612 → 517 |                   0 / 10 |
| Hidden, recording     |          0.13 → 0.12 |                             608 → 511 |                   0 / 10 |
| Dashboard, 10 minutes |          1.62 → 1.29 |                             426 → 469 |                300 / 300 |

- First Dashboard render: 1.21s to 0.78s; first CPU/memory/disk frame: 1.22s to 0.78s. Dashboard entry JavaScript (uncompressed, including required chunks) went from about 1.71 MB to 0.29 MB. The full History chart code is loaded on demand.
- Dashboard IPC went from 177 KB to 27 KB per short window, and from 5.34 MB to 0.82 MB in the extended run. Process data is still sent to the Processes view. In the extended run, memory and network each sampled 300 times, disk capacity and GPU 40 times each, temperature and battery 60 times each and Processes about 120 times. CPU and disk I/O now use native probes, so their old `systeminformation` call counts are not directly comparable.
- The ten-minute renderer sum fell from 265 to 215 MiB, but browser/GPU/utility together rose from 161 to 255 MiB. First-to-last minute sums fell in both runs (646 to 398 MiB and 511 to 436 MiB). The extended total did not improve. An earlier comparison used different Electron versions and lacked equivalent per-process data, so it does not isolate a cause. Repeat with physical-footprint and heap measurements before setting a long-run budget.

## Follow-up Apple Silicon Benchmark

A subsequent local run using Electron 45.5.0, a 43,200-row fixture, 2s cadence and 300 extended samples produced these summed per-process values. This is a separate observation, not a controlled repeated baseline comparison.

| Scenario           | Sampled CPU sum (%) | Summed working set (MiB) |
| ------------------ | ------------------: | -----------------------: |
| Dashboard          |                1.61 |                   378.80 |
| History            |                0.30 |                   345.78 |
| Processes          |                0.44 |                   329.13 |
| Tray               |                0.98 |                   449.35 |
| Mini Monitor       |                0.27 |                   519.75 |
| Paused             |                0.16 |                   404.23 |
| Background         |                0.11 |                   397.24 |
| Extended dashboard |                1.12 |                   318.80 |

The extended run lasted 600,554 ms, recorded 300 rows and sent 300 measured frames with an estimated JSON payload total of 827,359 bytes. First- and last-minute summed working sets were 394.54 and 304.98 MiB. The paused and background scenarios each recorded 10 rows with zero measured frames. Dashboard render and first metric timings were 1,127 and 1,128 ms. The earlier extended memory increase has not been conclusively explained: operating system cache and memory pressure, retained renderer processes, and measurement variability may affect these results. These measurements do not establish unique physical memory use, a general memory budget, or absence of leaks outside the observed window.

## Validation and Limits

All 24 regression tests passed on Apple Silicon and in a Linux ARM64 container. Isolated desktop smoke tests covered recording while paused, pause and resume, and the absence of third-party startup write IPC. Temperature failure and recovery were tested with fixtures. Both a source build and an ad-hoc macOS package recorded metrics in isolated profiles.

On Apple Silicon, native process termination was tested against a disposable process. Cancel left it running; confirming termination ended the same verified child. Third-party startup inventory is read-only.

| Target            | Verified                                                                                                                                                                                                | Still unverified                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| macOS arm64       | Native Electron windows, all tabs, tray, Mini Monitor, isolated migrations, retention, pause/resume, exports and IPC denials; ad-hoc DMG/ZIP, isolated packaged launch, and native process confirmation | Developer ID signing and notarization                  |
| Linux arm64       | Node unit tests and AppImage/deb build in an isolated ARM Linux container                                                                                                                               | Native desktop, installation and hardware sensors      |
| Linux x64         | Counter/normalization fixtures; configured build target                                                                                                                                                 | Native desktop and installation                        |
| Windows x64/arm64 | Settings, volume selection and release guards covered by fixtures                                                                                                                                       | Native desktop collectors, installers and Authenticode |
| macOS x64         | Shared Darwin fixtures and configured build target                                                                                                                                                      | Native Intel desktop, signing and packaging            |

Native macOS: the dashboard reported 22.27 GB available, 18.03 GB immediately free and 4.24 GB reclaimable; the Data-volume `statfs` check agreed with immediate free space. In a later paired CLI check, `df` and `diskutil` agreed that `/` and `/System/Volumes/Data` share free space and 245.11 GB total; Foundation's immediate-free and important-usage values differed by about 4.24 GB. These readings change during package builds. Finder/System Settings could not be observed directly. RAM total matched `hw.memsize` (8 GiB), battery reported 100% on AC as in `pmset`, and uptime matched Node OS uptime. Disk rate units and reset behavior were also checked against counter fixtures. Exact rate synchronization, swap and GPU utilization on other hardware remain unverified.

The full and runtime-only npm audits report zero known findings after replacing affected `minimatch` 9/10 links without downgrading the builder. Recheck advisories at release time. The built-in process safeguards do not eliminate the race between the final identity check and a PID-based signal. Native installers and device capability tests are the next gate before the Agent or Hub.
