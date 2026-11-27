import { getNetworkConnections } from '../collectors/networkConnections'
import { handleTrustedIpc } from '../ipcSecurity'

export function registerNetworkConnectionsIpc(): void {
  handleTrustedIpc('get-network-connections', () => {
    return getNetworkConnections()
  })
}
