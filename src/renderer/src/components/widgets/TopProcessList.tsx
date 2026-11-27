import { Link } from 'react-router-dom'
import { useState } from 'react'
import { useMetricsStore } from '../../store/metricsStore'
import { formatBytes, formatPercent, formatTime } from '../../utils/format'
import { MetricMessage } from './MetricMessage'

export function TopProcessList() {
  const rows = useMetricsStore((state) => state.topProcesses)
  const timestamp = useMetricsStore((state) => state.statuses?.processes.sampledAt)
  const [selection, setSelection] = useState<number | null>(null)
  const selected = rows?.find(({ pid }) => pid === selection) ?? rows?.[0]
  return (
    <section className="overview-processes" aria-label="Top processes">
      <div className="overview-process-table">
        <header>
          <h3>Top processes</h3>
          <span>Highest observed CPU utilization</span>
        </header>
        {rows?.length ? (
          <table>
            <caption className="sr-only">Top five observed processes by CPU utilization</caption>
            <thead>
              <tr>
                <th scope="col">Process</th>
                <th scope="col">PID</th>
                <th scope="col">CPU</th>
                <th scope="col">Resident memory</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ pid, name, cpuPercent, memoryBytes }) => (
                <tr key={pid} data-selected={pid === selected?.pid}>
                  <th scope="row">
                    <button
                      type="button"
                      aria-pressed={pid === selected?.pid}
                      onClick={() => setSelection(pid)}
                    >
                      <bdi>{name}</bdi>
                    </button>
                  </th>
                  <td>{pid}</td>
                  <td>{formatPercent(cpuPercent)}</td>
                  <td>{formatBytes(memoryBytes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : rows ? (
          <p className="instrument-note">No processes in the last captured sample.</p>
        ) : (
          <MetricMessage group="processes" name="process readings" />
        )}
      </div>
      <aside className="overview-process-details" aria-label="Process sample inspector">
        <h3>Process inspector</h3>
        {selected ? (
          <>
            <strong>
              <bdi>{selected.name}</bdi>
            </strong>
            <dl>
              <dt>Process ID</dt>
              <dd>{selected.pid}</dd>
              <dt>CPU</dt>
              <dd>{formatPercent(selected.cpuPercent)}</dd>
              <dt>Resident memory</dt>
              <dd>{formatBytes(selected.memoryBytes)}</dd>
              <dt>Observed</dt>
              <dd>{timestamp == null ? 'Unavailable' : formatTime(new Date(timestamp))}</dd>
            </dl>
          </>
        ) : (
          <p className="instrument-note">No process sample to inspect.</p>
        )}
        <Link to="/processes">Open Processes</Link>
      </aside>
    </section>
  )
}
