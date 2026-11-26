# Monitoring Architecture

`src/monitoring/MetricPoller.ts` schedules typed collectors with an injectable clock. The collectors use Node and OS probes, not Electron, SQLite, or the renderer. `src/shared/contracts/metrics.ts` distinguishes `pending`, `ok`, `unavailable`, and `error` from device capabilities. Zero is a measured value, not a missing one. Each group keeps its own Unix-millisecond observation time and revision until sampled again; a desktop frame also has a publication timestamp.

The desktop `MetricsService` builds one snapshot for recording and alerts. IPC projects it for the active dashboard, Processes, System, tray, and Mini Monitor views. Hidden or minimized windows do not receive live updates. The tray is created on first open; a hidden Mini Monitor releases its renderer after a short delay. Pausing live display leaves sampling, recording, and alerts running; paused startup waits briefly for its initial reading. Separate on-demand probes handle network connections, startup inventory, and detailed thermal pressure.

## Collection Policies

CPU temperature survives missing utilization, and vice versa. A fresh CPU temperature is recorded without requiring a CPU usage reading. macOS startup inventory reads LaunchAgent and LaunchDaemon plists without editing them or reporting launchd execution state. Other login items are not queried; Sentinel's own Launch at Login setting remains separate.

The existing **Poll interval** sets the fast cadence (2s by default). **Settings > Monitoring > Collection intervals** overrides each group independently. Settings version 1 remains readable; missing overrides use these defaults:

| Groups                              | Default       |
| ----------------------------------- | ------------- |
| CPU, memory, disk activity, network | Poll interval |
| Processes                           | At least 5s   |
| CPU temperature, battery            | At least 10s  |
| Disk capacity, GPU                  | At least 15s  |

A group never overlaps itself. A 15s deadline changes its status without starting another copy. A failed probe backs off, up to 30s or its configured interval if slower, and recovery restores normal cadence. Other groups continue. The desktop publishes changes at the poll interval or fastest explicit override, whichever is shorter. Quit stops publication and waits up to 3s before closing storage; third-party OS probes may not be cancellable.

## Sources and Units

| Metric               | Source and semantics                                                                                                                                                                                                                                                                                           |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CPU and uptime       | Per-core busy time from Node OS counter deltas; uptime in seconds. CPU inventory is cached separately.                                                                                                                                                                                                         |
| Memory and swap      | OS active, free and swap values from the provider in bytes; cached bytes are currently collected on Linux. Usage divides active by total and is not Activity Monitor's memory pressure.                                                                                                                        |
| GPU and temperatures | Provider utilization, dedicated VRAM bytes, sensor degrees Celsius and power in watts, where supported. Shared memory is not dedicated VRAM.                                                                                                                                                                   |
| Disk capacity        | Bytes in the selected primary volume. macOS selects APFS Data and shows Foundation's important-usage `Available` estimate with `Free now` and `Purgeable`. With no estimate it shows free space and a warning. macOS `Used` is total less available, not the space attributed to a single APFS volume by `df`. |
| Disk activity        | System-wide bytes/s from macOS IOKit `IOBlockStorageDriver` byte counters or Linux `diskstats` 512-byte sectors. Ignore duplicate partitions/mapper devices on Linux. Windows has no byte-rate adapter.                                                                                                        |
| Network              | Bytes/s from cumulative default-interface counters; not a total of every adapter.                                                                                                                                                                                                                              |
| Battery              | Charge and health percentage; time remaining in minutes, voltage in volts, and energy in watt-hours when units permit conversion.                                                                                                                                                                              |
| Processes            | Resident memory bytes (not virtual address space), provider CPU percent, and OS start identity. Provider process CPU can exceed 100% when multiple cores are used.                                                                                                                                             |

Disk and network use actual monotonic elapsed time. Counter reset, reconnection, missing values and the first sample do not become zero rates. The UI uses decimal byte units; `df -h` on macOS displays binary units. Sensors and peripherals depend on hardware and OS permissions.

## Storage and Security

SQLite migrates in a transaction, preserving existing IDs, measurements, and alerts. Newly recorded rows contain fresh values and nullable gaps. Legacy disk operations/s are exported in separate CSV columns from current byte rates. Retention is enforced without recreating the database. A database error does not stop live collection.

Electron windows use a sandboxed preload, context isolation, blocked external navigation and permissions, and per-role IPC validation against the top-level document. Process termination uses native confirmation and rechecks identity immediately before signalling. The checks are not an atomic OS process handle. Diagnostic ZIPs filter direct identifiers, and still need review before sharing. Neither private launch agents nor any remote endpoint are added by Sentinel. See [Electron's security guidance](https://www.electronjs.org/docs/latest/tutorial/security) and [verification results](verification.md) for coverage and limits.

## Extension Boundary

The scheduler and observations are reusable independently of the desktop. The current OS adapters rely on `systeminformation` and in some cases OS command-line utilities. Electron, renderer libraries, and the desktop SQLite binding are not required for collection. A future least-privilege Agent could use the same collector interface with versioned samples and bounded local buffering. Enrollment, transport, authentication, and Hub storage are not part of the current desktop app.
