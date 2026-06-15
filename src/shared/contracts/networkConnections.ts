export type NetworkConnectionProtocol = 'TCP' | 'UDP'

export interface NetworkConnection {
  processName: string | null
  pid: number | null
  protocol: NetworkConnectionProtocol
  localAddress: string
  localPort: string | null
  remoteAddress: string
  remotePort: string | null
  state: string | null
}

export interface NetworkConnectionsResult {
  connections: NetworkConnection[]
  supported: boolean
  limitation: string | null
  collectedAt: number
}
