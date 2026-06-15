import { useEffect } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { useMetricsStatus, useMetricsSubscription } from './hooks/useMetrics'
import { AppLayout } from './components/layout/AppLayout'
import { AlertsPage } from './pages/AlertsPage'
import { DashboardPage } from './pages/DashboardPage'
import { ProcessesPage } from './pages/ProcessesPage'
import { HistoryPage } from './pages/HistoryPage'
import { NetworkConnectionsPage } from './pages/NetworkConnectionsPage'
import { SettingsPage } from './pages/SettingsPage'
import { SystemPage } from './pages/SystemPage'
import { useUiSettingsStore } from './store/uiSettingsStore'

function AppContent() {
  const initializeUiSettings = useUiSettingsStore((state) => state.initialize)
  const uiSettingsInitialized = useUiSettingsStore((state) => state.initialized)
  const pollingPaused = useUiSettingsStore((state) => state.dashboardPollingPaused)

  useEffect(() => {
    void initializeUiSettings()
  }, [initializeUiSettings])

  useMetricsSubscription()
  const { isLoading, lastUpdated } = useMetricsStatus()

  if (!uiSettingsInitialized || (!pollingPaused && isLoading && !lastUpdated)) {
    return (
      <div
        className="h-screen flex items-center justify-center"
        style={{ backgroundColor: 'var(--bg-base)' }}
      >
        <div className="text-center">
          <div className="text-2xl font-bold mb-2">Sentinel</div>
          <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Reading system metrics...
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
