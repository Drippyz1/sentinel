import { BrowserWindow, dialog, type IpcMainInvokeEvent } from 'electron'
import type { InvokeChannel } from '../../shared/contracts/ipcPolicy'
import { isStorageQuery, isStorageSessionId } from '../../shared/utils/storageExplorer'
import { assertTrustedIpcSender, handleTrustedIpc } from '../ipcSecurity'
import type { StorageSessions } from '../storageExplorer/session'

function storageWindow(event: IpcMainInvokeEvent, channel: InvokeChannel): BrowserWindow {
  assertTrustedIpcSender(event, channel)
  const window = BrowserWindow.fromWebContents(event.sender)
  if (
    !window?.isVisible() ||
    window.isMinimized() ||
    new URL(event.sender.getURL()).hash !== '#/storage'
  )
    throw new Error('Open Storage Explorer to use this operation')
  return window
}

function storageId(id: unknown): string {
  if (!isStorageSessionId(id)) throw new Error('Invalid storage session')
  return id
}

export function registerStorageIpc(sessions: StorageSessions, canStart: () => boolean): void {
  let changing = false
  async function exclusive<T>(action: () => Promise<T>): Promise<T> {
    if (changing) throw new Error('A storage action is already in progress')
    changing = true
    try {
      return await action()
    } finally {
      changing = false
    }
  }

  handleTrustedIpc('storage-session', (event) => {
    storageWindow(event, 'storage-session')
    return sessions.current(event.sender)
  })

  handleTrustedIpc('storage-choose', (event) =>
    exclusive(async () => {
      const window = storageWindow(event, 'storage-choose')
      const file = await dialog.showOpenDialog(window, {
        title: 'Choose a folder or local volume to scan',
        buttonLabel: 'Select Location',
        properties: ['openDirectory', 'noResolveAliases', 'dontAddToRecent']
      })
      if (file.canceled || file.filePaths.length !== 1) return null
      return sessions.select(event.sender, file.filePaths[0], () => {
        storageWindow(event, 'storage-choose')
      })
    })
  )

  handleTrustedIpc('storage-start', (event, _role, id) =>
    exclusive(async () => {
      const validate = () => {
        storageWindow(event, 'storage-start')
        if (!canStart()) throw new Error('Finish or cancel the duplicate analysis first')
      }
      validate()
      return sessions.start(event.sender, storageId(id), validate)
    })
  )

  handleTrustedIpc('storage-cancel', (event, _role, id) => {
    storageWindow(event, 'storage-cancel')
    return sessions.cancel(event.sender, storageId(id))
  })

  handleTrustedIpc('storage-drop', (event, _role, id) =>
    exclusive(async () => {
      storageWindow(event, 'storage-drop')
      await sessions.drop(event.sender, storageId(id))
    })
  )

  handleTrustedIpc('storage-query', async (event, _role, id, query) => {
    storageWindow(event, 'storage-query')
    if (!isStorageQuery(query)) throw new Error('Invalid storage query')
    const result = await sessions.query(event.sender, storageId(id), query)
    storageWindow(event, 'storage-query')
    return result
  })
}
