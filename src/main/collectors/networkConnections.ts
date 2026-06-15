import si from 'systeminformation'
import { execFile } from 'child_process'
import { promisify } from 'util'
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
const execFileAsync = promisify(execFile)

function normalizedText(value: string | undefined): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function normalizedProtocol(value: string): NetworkConnectionProtocol | null {
  const protocol = value.trim().toUpperCase()
  if (protocol.startsWith('TCP')) return 'TCP'
  if (protocol.startsWith('UDP')) return 'UDP'
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

function splitEndpoint(value: string | undefined): {
  address: string
  port: string | null
} {
  const endpoint = normalizedText(value)
  if (!endpoint) return { address: '—', port: null }

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

async function getMacOsNetworkConnections(): Promise<NetworkConnection[]> {
  const { stdout } = await execFileAsync('/usr/sbin/lsof', ['-nP', '-iTCP', '-iUDP', '-FpcnPT'], {
    timeout: COLLECTION_TIMEOUT_MS,
    maxBuffer: 20 * 1024 * 1024
  })
  const connections: NetworkConnection[] = []
  let pid: number | null = null
  let processName: string | null = null
  let protocol: NetworkConnectionProtocol | null = null
  let connectionName: string | null = null
  let state: string | null = null

  function finishConnection(): void {
    if (!protocol || !connectionName) return
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

  return connections
}

export async function getNetworkConnections(): Promise<NetworkConnectionsResult> {
  const collectedAt = Date.now()
  if (!SUPPORTED_PLATFORMS.has(process.platform)) {
    return {
      connections: [],
      supported: false,
      limitation: `Network connection details are not supported on ${process.platform}.`,
      collectedAt
    }
  }

  const connections =
    process.platform === 'darwin'
      ? await getMacOsNetworkConnections()
      : (await withTimeout(si.networkConnections(), COLLECTION_TIMEOUT_MS)).reduce<
          NetworkConnection[]
        >((result, connection) => {
          const protocol = normalizedProtocol(connection.protocol)
          if (!protocol) return result

          result.push({
            processName: normalizedText(connection.process),
            pid: Number.isSafeInteger(connection.pid) && connection.pid > 0 ? connection.pid : null,
            protocol,
            localAddress: normalizedText(connection.localAddress) ?? '—',
            localPort: normalizedText(connection.localPort),
            remoteAddress: normalizedText(connection.peerAddress) ?? '—',
            remotePort: normalizedText(connection.peerPort),
            state: normalizedText(connection.state)?.toUpperCase() ?? null
          })
          return result
        }, [])

  return {
    connections,
    supported: true,
    limitation: null,
    collectedAt
  }
}
