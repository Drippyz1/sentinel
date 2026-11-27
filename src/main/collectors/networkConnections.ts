import si from 'systeminformation'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { isIP } from 'node:net'
import { cachedProbe } from '../../monitoring/probe'
import type {
  NetworkConnection,
  NetworkConnectionProtocol,
  NetworkConnectionsResult
} from '../../shared/contracts'

const SUPPORTED_PLATFORMS = new Set<NodeJS.Platform>([
  'darwin',
  'win32',
  'linux',
  'freebsd',
  'openbsd',
  'netbsd'
])
const COLLECTION_TIMEOUT_MS = 10_000
const CONNECTION_LIMIT = 2048
const execFileAsync = promisify(execFile)

function normalizedText(value: string | undefined): string | null {
  const normalized = typeof value === 'string' ? value.trim() : ''
  return normalized ? normalized : null
}

function normalizedProtocol(value: string): NetworkConnectionProtocol | null {
  const protocol = value.trim().toUpperCase()
  if (/^TCP[46]?$/.test(protocol)) return 'TCP'
  if (/^UDP[46]?$/.test(protocol)) return 'UDP'
  return null
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: NodeJS.Timeout | undefined
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(
      () => reject(new Error('Network connection collection timed out')),
      timeoutMs
    )
  })

  try {
    return await Promise.race([operation, timeoutPromise])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

export function splitEndpoint(value: string | undefined): {
  address: string
  port: string | null
} {
  const endpoint = normalizedText(value)
  if (!endpoint) return { address: '—', port: null }
  if (isIP(endpoint)) return { address: endpoint, port: null }

  if (endpoint.startsWith('[')) {
    const bracketEnd = endpoint.lastIndexOf(']')
    return {
      address: bracketEnd > 0 ? endpoint.slice(1, bracketEnd) : endpoint,
      port:
        bracketEnd > 0 && endpoint[bracketEnd + 1] === ':'
          ? normalizedText(endpoint.slice(bracketEnd + 2))
          : null
    }
  }

  const portSeparator = endpoint.lastIndexOf(':')
  if (portSeparator < 0) return { address: endpoint, port: null }
  return {
    address: endpoint.slice(0, portSeparator) || '—',
    port: normalizedText(endpoint.slice(portSeparator + 1))
  }
}

async function getMacOsNetworkConnections(): Promise<{
  connections: NetworkConnection[]
  limited: boolean
}> {
  let stdout: string
  let limited = false
  try {
    const result = await execFileAsync('/usr/sbin/lsof', ['-nP', '-iTCP', '-iUDP', '-FpcnPT'], {
      timeout: COLLECTION_TIMEOUT_MS,
      maxBuffer: 4 * 1024 * 1024
    })
    stdout = result.stdout
    limited = Boolean(result.stderr.trim())
  } catch (error) {
    // lsof returns 1 for an empty selection. Do not mistake permission warnings for an empty list.
    if (
      !error ||
      typeof error !== 'object' ||
      !('code' in error) ||
      error.code !== 1 ||
      !('stdout' in error) ||
      typeof error.stdout !== 'string' ||
      !('stderr' in error) ||
      typeof error.stderr !== 'string'
    )
      throw error
    stdout = error.stdout
    limited = Boolean(error.stderr.trim())
  }
  const connections: NetworkConnection[] = []
  let pid: number | null = null
  let processName: string | null = null
  let protocol: NetworkConnectionProtocol | null = null
  let connectionName: string | null = null
  let state: string | null = null

  function finishConnection(): void {
    if (!protocol || !connectionName || connections.length > CONNECTION_LIMIT) return
    const [localName, remoteName] = connectionName.split('->', 2)
    const local = splitEndpoint(localName)
    const remote = splitEndpoint(remoteName)
    connections.push({
      processName,
      pid,
      protocol,
      localAddress: local.address,
      localPort: local.port,
      remoteAddress: remote.address,
      remotePort: remote.port,
      state
    })
  }

  for (const line of stdout.split('\n')) {
    if (!line) continue
    const field = line[0]
    const value = line.slice(1)

    if (field === 'p') {
      finishConnection()
      pid = Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null
      processName = null
      protocol = null
      connectionName = null
      state = null
    } else if (field === 'c') {
      processName = normalizedText(value)
    } else if (field === 'f') {
      finishConnection()
      protocol = null
      connectionName = null
      state = null
    } else if (field === 'P') {
      protocol = normalizedProtocol(value)
    } else if (field === 'n') {
      connectionName = normalizedText(value)
    } else if (line.startsWith('TST=')) {
      state = normalizedText(line.slice(4))?.toUpperCase() ?? null
    }
  }
  finishConnection()

  return { connections, limited }
}

export function getNetworkConnections(): Promise<NetworkConnectionsResult> {
  return withTimeout(readNetworkConnections(), COLLECTION_TIMEOUT_MS + 500)
}

const readNetworkConnections = cachedProbe(async (): Promise<NetworkConnectionsResult> => {
  if (!SUPPORTED_PLATFORMS.has(process.platform)) {
    return {
      connections: [],
      supported: false,
      limitation: `Network connection details are not supported on ${process.platform}.`,
      collectedAt: Date.now()
    }
  }

  const collected =
    process.platform === 'darwin'
      ? await getMacOsNetworkConnections()
      : {
          limited: false,
          connections: (await si.networkConnections()).reduce<NetworkConnection[]>(
            (result, connection) => {
              if (result.length > CONNECTION_LIMIT) return result
              const protocol = normalizedProtocol(connection.protocol)
              if (!protocol) return result

              result.push({
                processName:
                  Number.isSafeInteger(connection.pid) && connection.pid > 0
                    ? normalizedText(connection.process)
                    : null,
                pid:
                  Number.isSafeInteger(connection.pid) && connection.pid > 0
                    ? connection.pid
                    : null,
                protocol,
                localAddress: normalizedText(connection.localAddress) ?? '—',
                localPort: normalizedText(connection.localPort),
                remoteAddress: normalizedText(connection.peerAddress) ?? '—',
                remotePort: normalizedText(connection.peerPort),
                state: normalizedText(connection.state)?.toUpperCase() ?? null
              })
              return result
            },
            []
          )
        }

  return {
    connections: collected.connections.slice(0, CONNECTION_LIMIT),
    supported: true,
    limitation:
      collected.connections.length > CONNECTION_LIMIT
        ? `Showing at most ${CONNECTION_LIMIT} connections. Search covers this snapshot only.`
        : collected.limited
          ? 'The OS reported a limited view. Some connections or owners may not be visible.'
          : 'This local snapshot includes only connections and owners visible to the current user.',
    collectedAt: Date.now()
  }
}, 1000)
