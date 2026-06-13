import { HashRouter, Routes, Route } from 'react-router-dom'
import { useMetricsPolling, useMetricsStatus } from './hooks/useMetrics'
import { AppLayout } from './components/layout/AppLayout'
import { DashboardPage } from './pages/DashboardPage'
import { ProcessesPage } from './pages/ProcessesPage'
import { HistoryPage } from './pages/HistoryPage'
import { SettingsPage } from './pages/SettingsPage'
import { SystemPage } from './pages/SystemPage'

function AppContent() {
  useMetricsPolling()
  const { isLoading, lastUpdated } = useMetricsStatus()

  if (isLoading && !lastUpdated) {
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
        <Route path="processes" element={<ProcessesPage />} />
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
