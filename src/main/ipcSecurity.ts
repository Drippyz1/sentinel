import { IpcMainInvokeEvent } from 'electron'
import { fileURLToPath } from 'url'
import { join, normalize } from 'path'
import { is } from '@electron-toolkit/utils'

const HISTORY_RANGES = new Set([30, 60, 180, 360, 1440])

export function isTrustedIpcSender(event: IpcMainInvokeEvent): boolean {
  const senderUrl = event.senderFrame?.url
  if (!senderUrl) return false

  try {
    const url = new URL(senderUrl)

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      const rendererUrl = new URL(process.env['ELECTRON_RENDERER_URL'])
      return url.origin === rendererUrl.origin
    }

    if (url.protocol !== 'file:') return false
    const expectedPath = normalize(join(__dirname, '../renderer/index.html'))
    return normalize(fileURLToPath(url)) === expectedPath
  } catch {
    return false
  }
}

export function assertTrustedIpcSender(event: IpcMainInvokeEvent): void {
  if (!isTrustedIpcSender(event)) {
    throw new Error('Rejected IPC request from an untrusted sender')
  }
}

export function isValidHistoryRange(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && HISTORY_RANGES.has(value)
}

export function isValidPid(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value !== process.pid
  )
}

export function isSafeExternalUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol
    return protocol === 'https:' || protocol === 'http:'
  } catch {
    return false
  }
}
