# Sentinel

A local-first desktop system monitor built with Electron, React, and TypeScript.

Sentinel provides real-time system monitoring, process management, hardware information, startup application management, and historical metrics in a modern desktop interface.

> ⚠️ Sentinel is currently under active development and should be considered early-stage software.

## Preview

![Dashboard](docs/images/dashboard.png)

## Additional Screenshots

<p align="center">
  <img src="docs/images/processes.png" width="48%">
  <img src="docs/images/system.png" width="48%">
</p>

<p align="center">
  <img src="docs/images/settings.png" width="48%">
</p>

---

## Features

### System Monitoring

* Real-time CPU monitoring
* Memory usage tracking
* Disk usage statistics
* Network activity monitoring
* GPU monitoring
* Battery information
* Thermal monitoring

### Process Management

* View running processes
* Search and filter processes
* Sort by CPU, memory, PID, and name
* Process termination tools

### System Information

* Hardware details
* Operating system information
* Startup application management
* Machine specifications
* System health metrics

### Historical Data

* Metrics collection
* Historical usage charts
* Resource trend analysis

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
* npm

### Clone the Repository

```bash
git clone https://github.com/Drippyz1/sentinel.git
cd sentinel
```

### Install Dependencies

```bash
npm install
```

### Start Development

```bash
npm run dev
```

## Development Commands

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

## Roadmap

### Short-Term

* [ ] Additional dashboard customization
* [ ] Improved historical analytics
* [ ] Better startup application support
* [ ] Exportable reports
* [ ] Additional system widgets

### Long-Term

* [ ] Plugin architecture
* [ ] Alert and notification system
* [ ] Custom dashboards
* [ ] Cross-device synchronization
* [ ] Automated diagnostics

## Contributing

Contributions are welcome.

Please read CONTRIBUTING.md before opening a pull request.

Bug reports, feature requests, documentation improvements, and code contributions are appreciated.

## License

Distributed under the MIT License.
