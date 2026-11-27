import type {
  StorageQuery,
  StorageResult,
  StorageSnapshot
} from '../../shared/contracts/storageExplorer'
import type { AuthorizedScope } from './scope'

export type ScanReading = Omit<StorageSnapshot, 'id' | 'scope'>
export type WorkerInput = { token: number; query: StorageQuery }
export type WorkerOutput =
  | { type: 'progress' | 'finished'; reading: ScanReading }
  | { type: 'result'; token: number; result: StorageResult | null }
export interface ScanConfiguration {
  scope: AuthorizedScope
  cancellation: SharedArrayBuffer
}

export function initialScanReading(): ScanReading {
  return {
    state: 'ready',
    elapsedMs: 0,
    completedAt: null,
    processed: 0,
    indexed: 0,
    peakOpenDirectories: 0,
    skipped: {
      permission: 0,
      vanished: 0,
      links: 0,
      boundary: 0,
      special: 0,
      depth: 0,
      entryLimit: 0,
      changed: 0,
      io: 0
    },
    totals: null,
    volume: null,
    failure: null
  }
}

export function isCloudPath(path: string): boolean {
  const normalized = process.platform === 'win32' ? path.replaceAll('\\', '/') : path
  return process.platform === 'darwin'
    ? /\/Library\/(CloudStorage|Mobile Documents)(?:\/|$)/i.test(normalized)
    : process.platform === 'win32' && /\/OneDrive(?: - [^/]+)?(?:\/|$)/i.test(normalized)
}
