import si from 'systeminformation'
import type { ProcessInfo, ProcessMetrics } from '../../shared/contracts'

export async function getProcessMetrics(): Promise<ProcessMetrics> {
  const data = await si.processes()

  const list: ProcessInfo[] = data.list
    // Filter out kernel/system entries with no real name
    .filter((p) => p.name && p.name.trim().length > 0)
    .map((p) => ({
      pid: p.pid,
      name: p.name,
      cpuPercent: Math.round(p.cpu * 10) / 10, // 1 decimal place
      memoryBytes: p.memVsz * 1024, // convert KB → bytes
      memoryPercent: Math.round(p.mem * 10) / 10,
      status: p.state ?? 'unknown',
      started: p.started ?? ''
    }))
    // Sort by CPU usage descending by default
    .sort((a, b) => b.cpuPercent - a.cpuPercent)
    // Cap at 100 processes — beyond that it's noise and hurts performance
    .slice(0, 100)

  return { list, total: data.all }
}
