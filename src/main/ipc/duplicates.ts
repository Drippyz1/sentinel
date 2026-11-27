import { BrowserWindow, dialog, type IpcMainInvokeEvent } from 'electron'
import { DUPLICATE_LIMITS } from '../../shared/contracts/duplicates'
import type { InvokeChannel } from '../../shared/contracts/ipcPolicy'
import { duplicateEntryId, isDuplicateQuery } from '../../shared/utils/duplicates'
import { isStorageSessionId } from '../../shared/utils/storageExplorer'
import type { DuplicateSessions } from '../duplicates/session'
import { assertTrustedIpcSender, handleTrustedIpc } from '../ipcSecurity'

function analyzerWindow(event: IpcMainInvokeEvent, channel: InvokeChannel): BrowserWindow {
  assertTrustedIpcSender(event, channel)
  const window = BrowserWindow.fromWebContents(event.sender)
  if (
    !window?.isVisible() ||
    window.isMinimized() ||
    new URL(event.sender.getURL()).hash !== '#/duplicates'
  )
    throw new Error('Open Duplicate Files to use this operation')
  return window
}

function sessionId(id: unknown): string {
  if (!isStorageSessionId(id)) throw new Error('Invalid analysis session')
  return id
}

export function registerDuplicateIpc(sessions: DuplicateSessions, canStart: () => boolean): void {
  let changing = false
  async function exclusive<T>(action: () => Promise<T>): Promise<T> {
    if (changing) throw new Error('An analyzer action is already in progress')
    changing = true
    try {
      return await action()
    } finally {
      changing = false
    }
  }

  handleTrustedIpc('duplicate-session', (event) => {
    analyzerWindow(event, 'duplicate-session')
    return { supported: sessions.supported, snapshot: sessions.current(event.sender) }
  })
  handleTrustedIpc('duplicate-choose', (event, _role, mode) =>
    exclusive(async () => {
      const parent = analyzerWindow(event, 'duplicate-choose')
      if (mode !== 'exact' && mode !== 'photos') throw new Error('Invalid analysis mode')
      if (!sessions.supported) throw new Error('Content analysis is not available on this platform')
      if (sessions.active)
        throw new Error('Cancel the current analysis before choosing another folder')
      const selection = await dialog.showOpenDialog(parent, {
        title:
          mode === 'exact'
            ? 'Authorize exact duplicate analysis'
            : 'Authorize similar photo analysis',
        message:
          'Sentinel will read files inside the selected local folder after you start analysis.',
        buttonLabel: 'Authorize Folder',
        properties: ['openDirectory', 'noResolveAliases', 'dontAddToRecent']
      })
      if (selection.canceled || selection.filePaths.length !== 1) return null
      return sessions.select(event.sender, selection.filePaths[0], mode, () => {
        analyzerWindow(event, 'duplicate-choose')
      })
    })
  )
  handleTrustedIpc('duplicate-start', (event, _role, id) =>
    exclusive(async () => {
      const validate = () => {
        analyzerWindow(event, 'duplicate-start')
        if (!canStart()) throw new Error('Finish or cancel the Storage Explorer scan first')
      }
      validate()
      return sessions.start(event.sender, sessionId(id), validate)
    })
  )
  handleTrustedIpc('duplicate-cancel', (event, _role, id) => {
    analyzerWindow(event, 'duplicate-cancel')
    return sessions.cancel(event.sender, sessionId(id))
  })
  handleTrustedIpc('duplicate-drop', (event, _role, id) =>
    exclusive(async () => {
      analyzerWindow(event, 'duplicate-drop')
      await sessions.drop(event.sender, sessionId(id))
    })
  )
  handleTrustedIpc('duplicate-query', async (event, _role, id, query) => {
    analyzerWindow(event, 'duplicate-query')
    if (!isDuplicateQuery(query)) throw new Error('Invalid analysis query')
    const result = await sessions.query(event.sender, sessionId(id), query)
    analyzerWindow(event, 'duplicate-query')
    return result
  })
  handleTrustedIpc('duplicate-preview', async (event, _role, id, group, entry) => {
    analyzerWindow(event, 'duplicate-preview')
    if (!duplicateEntryId(group) || group >= DUPLICATE_LIMITS.groups || !duplicateEntryId(entry))
      throw new Error('Invalid preview selection')
    const result = await sessions.preview(event.sender, sessionId(id), group, entry)
    analyzerWindow(event, 'duplicate-preview')
    return result
  })
}
