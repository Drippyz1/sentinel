<p align="center">
  <img src="docs/images/icon.svg" width="140" alt="Sentinel Logo">
</p>

<h1 align="center">Sentinel</h1>

<p align="center">
  Local-first desktop system monitor built with Electron, React, and TypeScript.
</p>

---

Sentinel is a desktop system monitoring app that provides a clean local dashboard for monitoring system performance, running processes, hardware information, startup applications, and overall system health.

> Sentinel is currently in active development.

## Download

Prebuilt packages are available from the [latest GitHub release](https://github.com/Drippyz1/sentinel/releases/latest).

## Features

### Monitoring Dashboard

* Real-time CPU usage
* Memory monitoring
* Disk usage tracking
* Network activity monitoring
* GPU statistics
* Battery information
* Pause and resume live dashboard updates
* Customizable, reorderable dashboard widgets
* Compact, comfortable, and detailed dashboard density modes
* Recent-trend mini charts for key metrics
* Historical metric charts and tables
* CSV history export
* Local anomaly detection and system notifications

### Network Connections

* View active TCP and UDP connections
* Inspect local and remote addresses, ports, connection state, process, and PID when available
* Search by process, endpoint, port, or state
* Filter by protocol and connection state
* Group connections by process
* Copy local endpoints, remote endpoints, or complete connection details
* Manual refresh with no additional background polling

### Process Management

* View running processes
* Search processes
* Sort by CPU, memory, PID, and name
* Quick filters and compact/comfortable table density
* Process Details drawer with path, command line, parent PID, user, start time, and uptime
* Process termination with confirmation prompts

### System Information

* Hardware information
* Operating system details
* Thermal monitoring
* Startup application management
* Machine specifications
* Simple and advanced system views
* JSON and human-readable TXT system report exports
* Privacy-filtered diagnostic ZIP bundles for bug reports and troubleshooting

### Alerts and History

* Configurable CPU, memory, disk, and low-battery alerts
* Native notifications with cooldown protection
* Persistent alert history with unread state
* Alert analytics for recent activity, type, and severity
* Historical alert markers on related metric charts

### Desktop Experience

* Compact tray popover with essential live metrics and monitoring controls
* Floating Mini Monitor with optional always-on-top behavior
* Persistent Mini Monitor visibility and position

### Local Preferences

* Persistent dashboard, history, process, and system view preferences
* Configurable polling interval, temperature unit, retention, and anomaly sensitivity

### Privacy

* Metrics, network connections, history, alerts, and settings stay on the local device
* Sentinel does not resolve remote addresses through external DNS services
* Diagnostic exports remove recognized private paths, serial numbers, credentials, and secrets
* Reports and diagnostic bundles should still be reviewed before public sharing because hostnames,
  local IP addresses, volume labels, startup application names, and settings may identify a device
  or local network

### Platform Limitations

* On some Apple Silicon Macs, macOS does not expose CPU or GPU temperature sensors without
  elevated permissions. Sentinel reports these readings as unavailable and does not request
  elevated permissions or install privileged helpers.
* Process names, PIDs, and some network connections may be hidden when the operating system does
  not expose them to the current user. Sentinel does not request administrator privileges.

## Screenshots

<p align="center">
  <img src="docs/images/dashboard.png" width="48%" alt="Dashboard">
  <img src="docs/images/processes.png" width="48%" alt="Process Explorer">
</p>

<p align="center">
  <img src="docs/images/system.png" width="48%" alt="System Information">
  <img src="docs/images/settings.png" width="48%" alt="Settings">
</p>

<p align="center">
  <img src="docs/images/history.png" width="72%" alt="History charts and controls">
</p>

## Tech Stack

* Electron
* React
* TypeScript
* Tailwind CSS
* Zustand
* Recharts
* better-sqlite3
* systeminformation

## Installation

### Prerequisites

* Node.js 20+
* npm 10+

### Clone the Repository

```bash
git clone https://github.com/Drippyz1/sentinel.git
cd sentinel
```

### Install Dependencies

```bash
npm ci
```

## Development

Start the development environment:

```bash
npm run dev
```

## Quality Checks

### Type Checking

```bash
npm run typecheck
```

### Linting

```bash
npm run lint
```

### Formatting

```bash
npm run format
```

## Building

### Windows

```bash
npm run build:win
```

### macOS

```bash
npm run build:mac
```

### Linux

```bash
npm run build:linux
```

Platform packages are written to `dist/`. Build each target on its native operating system because Sentinel includes the native `better-sqlite3` module.

> Startup item management and detailed thermal information currently use macOS system services. Other monitoring features use cross-platform collectors where supported by the host.

## Roadmap

### Near-Term Goals

* [ ] Add demo GIFs
* [ ] Improve cross-platform startup item support
* [ ] Expand automated testing

### Long-Term Goals

* [ ] Plugin architecture
* [ ] Broader automatic update coverage
* [ ] First stable release

## Contributing

Contributions are welcome.

Please read [CONTRIBUTING.md](.github/CONTRIBUTING.md) before opening a pull request.

Bug reports, feature requests, documentation improvements, and code contributions are appreciated.

## Project Status

Sentinel is currently an early-stage project and should be considered experimental. Features, APIs, and internal architecture may change between releases.

## License

Distributed under the MIT License.
