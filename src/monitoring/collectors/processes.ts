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
import { LIVE_PROCESS_LIMIT, PROCESS_LIMIT, pageProcesses } from '../../shared/utils/processPage'
import type { ProcessPage, ProcessPageRequest } from '../../shared/contracts'

type ProviderProcess = Awaited<ReturnType<typeof si.processes>>['list'][number]
let processDetails = new Map<number, { summary: ProcessInfo; source: ProviderProcess }>()
let inventory: {
  rows: ProcessInfo[]
  collectedAt: number
  reported: number
  truncated: boolean
} | null = null
const readProcesses = cachedProbe(() => si.processes(), 0)

function optionalText(value: string | undefined): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function executablePath(pathValue: string | undefined, command: string | undefined): string | null {
  const path = optionalText(pathValue)
  if (!path || path.length > 4096 || path.includes('\0')) return null

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
  const data = await readProcesses().catch((error) => {
    clearProcessInventory()
    throw error
  })
  if (!data.list.length || data.all < 1) {
    clearProcessInventory()
    return unavailable('no-data')
  }

  const unique = new Map(
    data.list
      .filter(
        (p) =>
          Number.isSafeInteger(p.pid) &&
          p.pid > 0 &&
          p.pid <= 2147483647 &&
          p.name?.trim() &&
          p.name.length <= 1024
      )
      .map((p) => [p.pid, p])
  )
  const collected = [...unique.values()]
    .sort((a, b) => (nonNegative(b.cpu) ?? -1) - (nonNegative(a.cpu) ?? -1) || a.pid - b.pid)
    .slice(0, PROCESS_LIMIT)
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
        started: (processData.started ?? '').slice(0, 128)
      }
      return { summary, source: processData }
    })

  processDetails = new Map(collected.map((row) => [row.summary.pid, row]))
  const list = collected.map(({ summary }) => summary)
  inventory = {
    rows: list,
    collectedAt: Date.now(),
    reported: Math.max(data.all, list.length),
    truncated: unique.size > PROCESS_LIMIT
  }
  return observed({ list: list.slice(0, LIVE_PROCESS_LIMIT), total: inventory.reported })
}

export function clearProcessInventory(): void {
  processDetails.clear()
  inventory = null
}

export function getProcessPage(request: ProcessPageRequest, sampledAt: number): ProcessPage | null {
  if (
    !inventory ||
    inventory.collectedAt > sampledAt ||
    Math.abs(Date.now() - inventory.collectedAt) > 45_000
  )
    return null
  const { rows, collectedAt, reported, truncated } = inventory
  return pageProcesses(rows, request, { collectedAt, reported, truncated })
}

export function getProcessDetails(pid: number): ProcessDetails | null {
  if (!inventory || Math.abs(Date.now() - inventory.collectedAt) > 45_000) return null
  const entry = processDetails.get(pid)
  if (!entry) return null
  const { source, summary } = entry
  const command = optionalText(source.command)
  return {
    ...summary,
    parentPid: source.parentPid > 0 ? source.parentPid : null,
    threads: null,
    user: optionalText(source.user)?.slice(0, 256) ?? null,
    path: executablePath(source.path, source.command),
    commandLine: command
      ? [command, optionalText(source.params)].filter(Boolean).join(' ').slice(0, 8192)
      : null,
    uptimeSeconds: uptimeSeconds(source.started),
    architecture: null,
    platform: process.platform
  }
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
  if (!matchesProcessIdentity(identity, processDetails.get(identity.pid)?.summary)) return false
  const { list } = await readProcesses()
  return matchesProcessIdentity(
    identity,
    list.find((item) => item.pid === identity.pid)
  )
}
