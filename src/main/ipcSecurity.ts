import {
  BrowserWindow,
  ipcMain,
  session,
  type IpcMainInvokeEvent,
  type WebContents
} from 'electron'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { is } from '@electron-toolkit/utils'
import { isTrustedDocument } from '../shared/utils/rendererTrust'
import {
  EVENT_ROLES,
  INVOKE_POLICY,
  type EventChannel,
  type InvokeChannel,
  type WindowRole
} from '../shared/contracts/ipcPolicy'

const HISTORY_RANGES = new Set([30, 60, 180, 360, 1440])
const roles = new WeakMap<WebContents, WindowRole>()
let shuttingDown = false

export function beginIpcShutdown(): void {
  shuttingDown = true
}

export function getWindowRole(contents: WebContents): WindowRole | undefined {
  return roles.get(contents)
}

export function lockDownRendererPermissions(): void {
  const appSession = session.defaultSession
  appSession.setPermissionCheckHandler(() => false)
  appSession.setPermissionRequestHandler((_contents, _permission, respond) => respond(false))
}

function trustedRendererUrl(): string {
  return (
    (is.dev && process.env.ELECTRON_RENDERER_URL) ||
    pathToFileURL(join(__dirname, '../renderer/index.html')).href
  )
}

export function trustedWebPreferences(): Electron.WebPreferences {
  return {
    preload: join(__dirname, '../preload/index.js'),
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    webviewTag: false
  }
}

export function configureTrustedWindow(window: BrowserWindow, role: WindowRole): void {
  const contents = window.webContents
  roles.set(contents, role)
  const blockUntrustedNavigation = (
    event: Electron.Event<{ url: string; isMainFrame: boolean }>
  ) => {
    if (!event.isMainFrame || !isTrustedDocument(event.url, trustedRendererUrl()))
      event.preventDefault()
  }
  contents.on('will-frame-navigate', blockUntrustedNavigation)
  contents.on('will-navigate', blockUntrustedNavigation)
  contents.on('will-redirect', blockUntrustedNavigation)
  contents.on('did-navigate', (_event, url) => {
    if (!isTrustedDocument(url, trustedRendererUrl())) {
      roles.delete(contents)
      window.destroy()
    }
  })
  contents.on('will-attach-webview', (event) => event.preventDefault())
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
}

export function sendToTrustedWindow(
  window: BrowserWindow,
  channel: EventChannel,
  value: unknown
): void {
  if (shuttingDown || window.isDestroyed()) return
  const contents = window.webContents
  const role = roles.get(contents)
  if (
    !contents.isDestroyed() &&
    role &&
    (EVENT_ROLES[channel] as readonly WindowRole[]).includes(role) &&
    isTrustedDocument(contents.getURL(), trustedRendererUrl())
  ) {
    contents.send(channel, value)
  }
}

export function broadcastToTrustedWindows(channel: EventChannel, value: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    sendToTrustedWindow(window, channel, value)
  }
}

export function assertTrustedIpcSender(
  event: IpcMainInvokeEvent,
  channel: InvokeChannel
): WindowRole {
  const senderRole = roles.get(event.sender)
  if (
    shuttingDown ||
    event.sender.isDestroyed() ||
    !senderRole ||
    !(INVOKE_POLICY[channel][0] as readonly WindowRole[]).includes(senderRole) ||
    !event.senderFrame ||
    event.senderFrame !== event.sender.mainFrame ||
    !isTrustedDocument(event.senderFrame.url, trustedRendererUrl())
  ) {
    throw new Error('Rejected IPC request from an untrusted sender')
  }
  return senderRole
}

export function handleTrustedIpc(
  channel: InvokeChannel,
  listener: (event: IpcMainInvokeEvent, role: WindowRole, ...args: unknown[]) => unknown
): void {
  ipcMain.handle(channel, (event, ...args: unknown[]) => {
    const role = assertTrustedIpcSender(event, channel)
    if (args.length !== INVOKE_POLICY[channel][1]) throw new Error('Unexpected IPC arguments')
    return listener(event, role, ...args)
  })
}

export function isValidHistoryRange(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && HISTORY_RANGES.has(value)
}

export function isValidPid(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value > 1 &&
    value <= 2_147_483_647 &&
    value !== process.pid
  )
}
