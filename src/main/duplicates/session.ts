import { app, type WebContents } from 'electron'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { Worker } from 'node:worker_threads'
import { STORAGE_LIMITS } from '../../shared/contracts/storageExplorer'
import type {
  DuplicateMode,
  DuplicatePreview,
  DuplicateQuery,
  DuplicateReading,
  DuplicateResult,
  DuplicateSnapshot
} from '../../shared/contracts/duplicates'
import { authorizeStorageScope, type AuthorizedScope } from '../storageExplorer/scope'
import { duplicateReading } from './analysis'
import { ImageDecoder } from './decoder'
import type { AnalysisConfiguration, AnalysisInput, AnalysisOutput } from './protocol'

type Result = DuplicateResult | DuplicatePreview | null
interface ScanSession {
  id: string
  owner: WebContents
  mode: DuplicateMode
  scope: AuthorizedScope
  reading: DuplicateReading
  worker: Worker | null
  signal: Int32Array | null
  pending: { sequence: number; resolve: (value: Result) => void } | null
  expiry: ReturnType<typeof setTimeout> | null
  decoder: ImageDecoder | null
  detach: () => void
}

export class DuplicateSessions {
  private session: ScanSession | null = null
  private disposing: Promise<void> | null = null
  private stopped = false
  private sequence = 0

  get supported(): boolean {
    return process.platform === 'darwin' || process.platform === 'linux'
  }

  get active(): boolean {
    return this.session?.reading.state === 'running' || this.session?.reading.state === 'cancelling'
  }

  private snapshot(session: ScanSession): DuplicateSnapshot {
    return { id: session.id, mode: session.mode, scope: session.scope.display, ...session.reading }
  }

  current(owner: WebContents): DuplicateSnapshot | null {
    return this.session?.owner === owner ? this.snapshot(this.session) : null
  }

  private require(owner: WebContents, id: string): ScanSession {
    const session = this.session
    if (this.stopped || !session || session.owner !== owner || session.id !== id)
      throw new Error('Duplicate analysis session is no longer available')
    return session
  }

  private touch(session: ScanSession): void {
    if (session.expiry) clearTimeout(session.expiry)
    session.expiry = setTimeout(() => {
      if (this.session === session) void this.dispose()
    }, STORAGE_LIMITS.retentionMs)
    session.expiry.unref()
  }

  async select(
    owner: WebContents,
    path: string,
    mode: DuplicateMode,
    authorizeOwner: () => void
  ): Promise<DuplicateSnapshot> {
    if (!this.supported) throw new Error('Content analysis is not available on this platform')
    if (this.stopped || this.active || (this.session && this.session.owner !== owner))
      throw new Error('A duplicate analysis is already active')
    const scope = await authorizeStorageScope(path)
    authorizeOwner()
    if (!scope || scope.ino <= 0n)
      throw new Error('Choose a local folder with reliable file identities')
    await this.dispose()
    authorizeOwner()
    if (this.stopped) throw new Error('Content analysis is unavailable')
    const expired = () => {
      if (this.session?.owner === owner) void this.dispose()
    }
    const navigated = (
      details: Electron.Event<Electron.WebContentsDidStartNavigationEventParams>
    ) => {
      if (details.isMainFrame && !details.isSameDocument) expired()
    }
    const detach = () => {
      owner.removeListener('destroyed', expired)
      owner.removeListener('render-process-gone', expired)
      owner.removeListener('did-start-navigation', navigated)
    }
    owner.on('destroyed', expired)
    owner.on('render-process-gone', expired)
    owner.on('did-start-navigation', navigated)
    const session: ScanSession = {
      id: randomUUID(),
      owner,
      mode,
      scope,
      reading: duplicateReading(),
      worker: null,
      decoder: null,
      signal: null,
      pending: null,
      expiry: null,
      detach
    }
    this.session = session
    this.touch(session)
    return this.snapshot(session)
  }

  async start(
    owner: WebContents,
    id: string,
    authorizeOwner: () => void
  ): Promise<DuplicateSnapshot> {
    const session = this.require(owner, id)
    if (this.active) throw new Error('A duplicate analysis is already active')
    const scope = await authorizeStorageScope(session.scope.display.location)
    authorizeOwner()
    this.require(owner, id)
    await this.stopWorker(session)
    authorizeOwner()
    this.require(owner, id)
    session.id = randomUUID()
    session.reading = duplicateReading('running')
    this.touch(session)
    if (!scope || scope.dev !== session.scope.dev || scope.ino !== session.scope.ino) {
      session.reading.state = 'failed'
      session.reading.skipped.changed++
      return this.snapshot(session)
    }
    session.scope = scope
    const cancellation = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)
    session.signal = new Int32Array(cancellation)
    try {
      const base = app.isPackaged
        ? join(process.resourcesPath, 'app.asar.unpacked', 'out', 'main')
        : __dirname
      const worker = new Worker(join(base, 'duplicate-scan.js'), {
        workerData: { scope, mode: session.mode, cancellation } satisfies AnalysisConfiguration,
        resourceLimits: {
          maxOldGenerationSizeMb: 128,
          maxYoungGenerationSizeMb: 24,
          stackSizeMb: 4
        },
        execArgv: [],
        env: {}
      })
      session.worker = worker
      if (session.mode === 'photos') session.decoder = new ImageDecoder()
      worker.on('message', (message: AnalysisOutput) => this.onMessage(session, worker, message))
      worker.on('exit', () => this.ended(session, worker))
      worker.on('error', () => this.ended(session, worker))
    } catch {
      session.reading.state = 'failed'
    }
    return this.snapshot(session)
  }

  private onMessage(session: ScanSession, worker: Worker, message: AnalysisOutput): void {
    if (this.session !== session || session.worker !== worker) return
    if (message.type === 'decode') {
      const response =
        session.reading.state === 'cancelling'
          ? null
          : session.decoder?.decode(message.data, message.format, message.preview)
      void Promise.resolve(response)
        .then((result) => {
          if (session.worker === worker)
            worker.postMessage({
              type: 'decoded',
              sequence: message.sequence,
              result: result ?? null
            } satisfies AnalysisInput)
        })
        .catch(() => {})
    } else if (message.type === 'result') {
      if (session.pending?.sequence === message.sequence) {
        const current = session.pending
        session.pending = null
        current.resolve(message.result)
        // No idle decoder renderer is retained between preview requests.
        if (!this.active) session.decoder?.close()
      }
    } else {
      if (session.reading.state === 'cancelling')
        message.reading.state = message.type === 'finished' ? 'cancelled' : 'cancelling'
      session.reading = message.reading
      if (message.type === 'finished') session.decoder?.close()
    }
  }

  private ended(session: ScanSession, worker: Worker): void {
    if (session.worker !== worker) return
    session.worker = null
    session.decoder?.close()
    session.pending?.resolve(null)
    session.pending = null
    session.reading = { ...session.reading, state: 'failed', groups: 0 }
  }

  cancel(owner: WebContents, id: string): DuplicateSnapshot {
    const session = this.require(owner, id)
    if (session.reading.state === 'running' && session.signal) {
      Atomics.store(session.signal, 0, 1)
      session.reading = { ...session.reading, state: 'cancelling' }
      session.decoder?.close()
      this.touch(session)
    }
    return this.snapshot(session)
  }

  private request(
    owner: WebContents,
    id: string,
    make: (sequence: number) => AnalysisInput
  ): Promise<Result> {
    const session = this.require(owner, id)
    if (!session.worker || this.active || session.pending || !session.reading.groups)
      return Promise.resolve(null)
    const worker = session.worker
    this.touch(session)
    return new Promise((resolve) => {
      const sequence = ++this.sequence
      session.pending = { sequence, resolve }
      try {
        worker.postMessage(make(sequence))
      } catch {
        session.pending = null
        resolve(null)
      }
    })
  }

  async query(
    owner: WebContents,
    id: string,
    query: DuplicateQuery
  ): Promise<DuplicateResult | null> {
    const value = await this.request(owner, id, (sequence) => ({ type: 'query', sequence, query }))
    return value && 'groups' in value ? value : null
  }

  async preview(
    owner: WebContents,
    id: string,
    group: number,
    entry: number
  ): Promise<DuplicatePreview | null> {
    const value = await this.request(owner, id, (sequence) => ({
      type: 'preview',
      sequence,
      group,
      entry
    }))
    return value && 'reference' in value ? value : null
  }

  async drop(owner: WebContents, id: string): Promise<void> {
    this.require(owner, id)
    await this.dispose()
  }

  private async stopWorker(session: ScanSession): Promise<void> {
    if (session.signal) Atomics.store(session.signal, 0, 1)
    const worker = session.worker
    session.worker = null
    session.signal = null
    session.pending?.resolve(null)
    session.pending = null
    session.decoder?.close()
    session.decoder = null
    await worker?.terminate().catch(() => {})
  }

  private dispose(): Promise<void> {
    const session = this.session
    if (!session) return this.disposing ?? Promise.resolve()
    this.session = null
    session.detach()
    if (session.expiry) clearTimeout(session.expiry)
    this.disposing = this.stopWorker(session).finally(() => {
      this.disposing = null
    })
    return this.disposing
  }

  async shutdown(): Promise<void> {
    this.stopped = true
    await this.dispose()
  }
}
