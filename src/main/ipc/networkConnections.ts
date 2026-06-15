import { ipcMain } from 'electron'
import { getNetworkConnections } from '../collectors/networkConnections'
import { assertTrustedIpcSender } from '../ipcSecurity'

export function registerNetworkConnectionsIpc(): void {
  ipcMain.handle('get-network-connections', (event) => {
    assertTrustedIpcSender(event)
    return getNetworkConnections()
  })
}
