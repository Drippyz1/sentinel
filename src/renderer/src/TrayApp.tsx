import { useEffect, useState } from 'react'
import { useMetricsPolling } from './hooks/useMetrics'
import { useCpuMetrics, useMemoryMetrics,
         useNetworkMetrics, useBatteryMetrics } from './hooks/useMetrics'
import { formatSpeed, formatBytes } from './utils/format'
import { UsageBar } from './components/ui/UsageBar'

function TrayContent() {
  useMetricsPolling()

  const cpu     = useCpuMetrics()
  const memory  = useMemoryMetrics()
  const network = useNetworkMetrics()
  const battery = useBatteryMetrics()

  if (!cpu || !memory) {
    return (
      <div className="flex items-center justify-center h-full"
           style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
        Loading...
      </div>
    )
  }

  return (
    <div style={{
      padding: '12px',
      backgroundColor: 'var(--bg-base)',
      color: 'var(--text-primary)',
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
      fontSize: '12px',
      height: '100%',
      overflow: 'hidden'
    }}>

      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '10px',
        paddingBottom: '8px',
        borderBottom: '1px solid var(--border)'
      }}>
        <span style={{ fontWeight: 600, fontSize: '13px' }}>Sentinel</span>
        <button
          onClick={() => window.electronAPI.openMainWindow()}
          style={{
            fontSize: '11px',
            color: 'var(--accent-blue)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0
          }}
        >
          Open →
        </button>
      </div>

      {/* CPU */}
      <div style={{ marginBottom: '8px' }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: '3px'
        }}>
          <span style={{ color: 'var(--text-muted)' }}>CPU</span>
          <span style={{ fontFamily: 'monospace', fontWeight: 600,
                         color: 'var(--accent-blue)' }}>
            {cpu.usagePercent}%
          </span>
        </div>
        <UsageBar percent={cpu.usagePercent} height={3} />
      </div>

      {/* Memory */}
      <div style={{ marginBottom: '8px' }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: '3px'
        }}>
          <span style={{ color: 'var(--text-muted)' }}>Memory</span>
          <span style={{ fontFamily: 'monospace', fontWeight: 600,
                         color: 'var(--accent-purple)' }}>
            {memory.usagePercent}%
          </span>
        </div>
        <UsageBar percent={memory.usagePercent} accent="purple" height={3} />
      </div>

      {/* Network */}
      {network && (
        <div style={{ marginBottom: '8px' }}>
          <div style={{ color: 'var(--text-muted)', marginBottom: '3px' }}>
            Network
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--accent-green)', fontFamily: 'monospace' }}>
              ↓ {formatSpeed(network.totalDownloadBytesPerSec)}
            </span>
            <span style={{ color: 'var(--accent-blue)', fontFamily: 'monospace' }}>
              ↑ {formatSpeed(network.totalUploadBytesPerSec)}
            </span>
          </div>
        </div>
      )}

      {/* Battery */}
      {battery?.hasBattery && (
        <div style={{
          paddingTop: '8px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span style={{ color: 'var(--text-muted)' }}>Battery</span>
          <span style={{ fontFamily: 'monospace', fontWeight: 600,
                         color: battery.isCharging
                           ? 'var(--accent-green)'
                           : battery.chargePercent < 20
                             ? 'var(--accent-red)'
                             : 'var(--text-primary)' }}>
            {battery.chargePercent}%
            {battery.isCharging ? ' ⚡' : ''}
          </span>
        </div>
      )}

    </div>
  )
}

export function TrayApp() {
  return <TrayContent />
}