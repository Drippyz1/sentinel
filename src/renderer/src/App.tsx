import { lazy, useEffect } from 'react'
import { HashRouter, Routes, Route, useLocation } from 'react-router-dom'
import { useMetricsSubscription } from './hooks/useMetrics'
import { AppLayout } from './components/layout/AppLayout'
import { DashboardPage } from './pages/DashboardPage'
import { useUiSettingsStore } from './store/uiSettingsStore'

const AlertsPage = lazy(() =>
  import('./pages/AlertsPage').then((module) => ({ default: module.AlertsPage }))
)
const ProcessesPage = lazy(() =>
  import('./pages/ProcessesPage').then((module) => ({ default: module.ProcessesPage }))
)
const HistoryPage = lazy(() =>
  import('./pages/HistoryPage').then((module) => ({ default: module.HistoryPage }))
)
const NetworkConnectionsPage = lazy(() =>
  import('./pages/NetworkConnectionsPage').then((module) => ({
    default: module.NetworkConnectionsPage
  }))
)
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((module) => ({ default: module.SettingsPage }))
)
const SystemPage = lazy(() =>
  import('./pages/SystemPage').then((module) => ({ default: module.SystemPage }))
)
const StorageExplorerPage = lazy(() =>
  import('./pages/StorageExplorerPage').then((module) => ({ default: module.StorageExplorerPage }))
)
const DuplicateExplorerPage = lazy(() =>
  import('./pages/DuplicateExplorerPage').then((module) => ({
    default: module.DuplicateExplorerPage
  }))
)

function AppContent() {
  const initializeUiSettings = useUiSettingsStore((state) => state.initialize)
  const uiSettingsInitialized = useUiSettingsStore((state) => state.initialized)
  const { pathname } = useLocation()

  useEffect(() => {
    void initializeUiSettings()
  }, [initializeUiSettings])

  useMetricsSubscription(pathname)

  if (!uiSettingsInitialized) {
    return (
      <div
        className="h-screen flex items-center justify-center"
        style={{ backgroundColor: 'var(--bg-base)' }}
      >
        <div className="text-center">
          <div className="text-2xl font-bold mb-2">Sentinel</div>
          <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Loading settings...
          </div>
        </div>
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/" element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="alerts" element={<AlertsPage />} />
        <Route path="processes" element={<ProcessesPage />} />
        <Route path="network" element={<NetworkConnectionsPage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="system" element={<SystemPage />} />
        <Route path="storage" element={<StorageExplorerPage />} />
        <Route path="duplicates" element={<DuplicateExplorerPage />} />
      </Route>
    </Routes>
  )
}

function App() {
  return (
    <HashRouter>
      <AppContent />
    </HashRouter>
  )
}

export default App
