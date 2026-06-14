import si from 'systeminformation'
import { basename, join } from 'path'
import type { ProcessDetails, ProcessInfo, ProcessMetrics } from '../../shared/contracts'

let processDetails = new Map<number, ProcessDetails>()

function optionalText(value: string | undefined): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function executablePath(pathValue: string | undefined, command: string | undefined): string | null {
  const path = optionalText(pathValue)
  if (!path) return null

  const commandName = optionalText(command)
  if (!commandName || basename(path) === commandName || process.platform === 'win32') return path
  return join(path, commandName)
}

function uptimeSeconds(started: string | undefined): number | null {
  const normalized = optionalText(started)
  if (!normalized) return null

  const startedAt = Date.parse(normalized.replace(' ', 'T'))
  if (!Number.isFinite(startedAt) || startedAt > Date.now()) return null
  return Math.floor((Date.now() - startedAt) / 1000)
}

export async function getProcessMetrics(): Promise<ProcessMetrics> {
  const data = await si.processes()

  const collected = data.list
    // Filter out kernel/system entries with no real name
    .filter((p) => p.name && p.name.trim().length > 0)
    .map((processData) => {
      const summary: ProcessInfo = {
        pid: processData.pid,
        name: processData.name,
        cpuPercent: Math.round(processData.cpu * 10) / 10,
        memoryBytes: processData.memVsz * 1024,
        memoryPercent: Math.round(processData.mem * 10) / 10,
        status: processData.state ?? 'unknown',
        started: processData.started ?? ''
      }
      const command = optionalText(processData.command)
      const params = optionalText(processData.params)
      const details: ProcessDetails = {
        ...summary,
        parentPid: processData.parentPid > 0 ? processData.parentPid : null,
        threads: null,
        user: optionalText(processData.user),
        path: executablePath(processData.path, processData.command),
        commandLine: command ? [command, params].filter(Boolean).join(' ') : null,
        uptimeSeconds: uptimeSeconds(processData.started),
        architecture: process.arch,
        platform: process.platform
      }
      return { summary, details }
    })
    // Sort by CPU usage descending by default
    .sort((a, b) => b.summary.cpuPercent - a.summary.cpuPercent)
    // Cap at 100 processes — beyond that it's noise and hurts performance
    .slice(0, 100)

  processDetails = new Map(collected.map(({ details }) => [details.pid, details]))
  const list = collected.map(({ summary }) => summary)
  return { list, total: data.all }
}

export function getProcessDetails(pid: number): ProcessDetails | null {
  return processDetails.get(pid) ?? null
}
