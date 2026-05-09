import { Card } from '../components/ui/Card'

export function SettingsPage() {
  return (
    <div>
      <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
        Settings
      </h2>
      <Card title="Coming Soon">
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Polling interval, data retention, theme, and alert thresholds — on the way.
        </p>
      </Card>
    </div>
  )
}