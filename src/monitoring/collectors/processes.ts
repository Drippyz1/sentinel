import si from 'systeminformation'
import { basename, join } from 'path'
import type {
  MetricCollectionResult,
  ProcessDetails,
  ProcessIdentity,
  ProcessInfo,
  ProcessMetrics
} from '../../shared/contracts'
import { cachedProbe, nonNegative, observed, percent, unavailable } from '../probe'

let processDetails = new Map<number, ProcessDetails>()
const readProcesses = cachedProbe(() => si.processes(), 0)

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

export async function getProcessMetrics(): Promise<MetricCollectionResult<ProcessMetrics>> {
  const data = await readProcesses()
  if (!data.list.length || data.all < 1) {
    processDetails.clear()
    return unavailable('no-data')
  }

  const collected = data.list
    .filter((p) => Number.isSafeInteger(p.pid) && p.pid > 0 && p.name?.trim())
    .sort((a, b) => (nonNegative(b.cpu) ?? 0) - (nonNegative(a.cpu) ?? 0))
    .slice(0, 100)
    .map((processData) => {
      const cpu = nonNegative(processData.cpu)
      const memory = nonNegative(processData.memRss)
      const usage = percent(processData.mem)
      const summary: ProcessInfo = {
        pid: processData.pid,
        name: processData.name,
        cpuPercent: cpu === null ? null : Math.round(cpu * 10) / 10,
        memoryBytes: memory === null ? null : memory * 1024,
        memoryPercent: usage === null ? null : Math.round(usage * 10) / 10,
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
        architecture: null,
        platform: process.platform
      }
      return { summary, details }
    })

  processDetails = new Map(collected.map(({ details }) => [details.pid, details]))
  const list = collected.map(({ summary }) => summary)
  return observed({ list, total: data.all })
}

export function getProcessDetails(pid: number): ProcessDetails | null {
  return processDetails.get(pid) ?? null
}

export function matchesProcessIdentity(
  expected: ProcessIdentity,
  observed: ProcessIdentity | null | undefined
): boolean {
  return (
    Boolean(expected.started.trim()) &&
    observed?.pid === expected.pid &&
    observed.name === expected.name &&
    observed.started === expected.started
  )
}

export async function verifyProcessIdentity(identity: ProcessIdentity): Promise<boolean> {
  if (!matchesProcessIdentity(identity, processDetails.get(identity.pid))) return false
  const { list } = await readProcesses()
  return matchesProcessIdentity(
    identity,
    list.find((item) => item.pid === identity.pid)
  )
}
