import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { Worker } from 'node:worker_threads'
import { app, type WebContents } from 'electron'
import {
  STORAGE_LIMITS,
  type StorageQuery,
  type StorageResult,
  type StorageSnapshot
} from '../../shared/contracts/storageExplorer'
import { authorizeStorageScope, type AuthorizedScope } from './scope'
import {
  initialScanReading,
  type ScanConfiguration,
  type ScanReading,
  type WorkerInput,
  type WorkerOutput
} from './protocol'

interface Session {
  id: string
  owner: WebContents
  scope: AuthorizedScope
  reading: ScanReading
  worker: Worker | null
  signal: Int32Array | null
  pending: { token: number; resolve: (value: StorageResult | null) => void } | null
  expiry: ReturnType<typeof setTimeout> | null
  detach: () => void
}

export class StorageSessions {
  private session: Session | null = null
  private disposing: Promise<void> | null = null
  private stopped = false
  private token = 0

  get active(): boolean {
    return (
      this.session?.reading.state === 'scanning' || this.session?.reading.state === 'cancelling'
    )
  }

  current(owner: WebContents): StorageSnapshot | null {
    return this.session?.owner === owner ? this.snapshot(this.session) : null
  }

  private snapshot(session: Session): StorageSnapshot {
    return { id: session.id, scope: session.scope.display, ...session.reading }
  }

  private requireSession(owner: WebContents, id: string): Session {
    const session = this.session
    if (this.stopped || !session || session.owner !== owner || session.id !== id)
      throw new Error('Storage scan session is no longer available')
    return session
  }

  private touch(session: Session): void {
    if (session.expiry) clearTimeout(session.expiry)
    session.expiry = setTimeout(() => {
      if (this.session === session) void this.dispose()
    }, STORAGE_LIMITS.retentionMs)
    session.expiry.unref()
  }

  async select(
    owner: WebContents,
    path: string,
    validateOwner: () => void
  ): Promise<StorageSnapshot> {
    if (this.stopped || (this.session && this.session.owner !== owner))
      throw new Error('Storage selection is unavailable')
    const scope = await authorizeStorageScope(path)
    validateOwner()
    if (!scope)
      throw new Error(
        'Choose a local directory without aliases, cloud placeholders, or unsupported mounts'
      )
    await this.dispose()
    validateOwner()
    if (this.stopped) throw new Error('Storage selection is unavailable')
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
    const session: Session = {
      id: randomUUID(),
      owner,
      scope,
      reading: initialScanReading(),
      worker: null,
      signal: null,
      pending: null,
      expiry: null,
      detach
    }
    this.session = session
    this.touch(session)
    return this.snapshot(session)
  }

  async start(owner: WebContents, id: string, validateOwner: () => void): Promise<StorageSnapshot> {
    const session = this.requireSession(owner, id)
    if (session.reading.state === 'scanning' || session.reading.state === 'cancelling')
      throw new Error('A storage scan is already active')
    const scope = await authorizeStorageScope(session.scope.display.location)
    validateOwner()
    this.requireSession(owner, id)
    await this.stopWorker(session)
    validateOwner()
    this.requireSession(owner, id)
    session.id = randomUUID()
    session.reading = initialScanReading()
    this.touch(session)
    if (!scope || scope.dev !== session.scope.dev || scope.ino !== session.scope.ino) {
      session.reading = { ...session.reading, state: 'failed', failure: 'scope-changed' }
      return this.snapshot(session)
    }
    session.scope = scope
    const cancellation = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)
    session.signal = new Int32Array(cancellation)
    session.reading.state = 'scanning'
    try {
      const build = app.isPackaged
        ? join(process.resourcesPath, 'app.asar.unpacked', 'out', 'main')
        : __dirname
      const worker = new Worker(join(build, 'storage-scan.js'), {
        workerData: { scope, cancellation } satisfies ScanConfiguration,
        env: {},
        execArgv: [],
        resourceLimits: {
          maxOldGenerationSizeMb: 192,
          maxYoungGenerationSizeMb: 24,
          stackSizeMb: 4
        }
      })
      session.worker = worker
      worker.on('message', (message: WorkerOutput) => {
        if (this.session !== session || session.worker !== worker) return
        if (message.type === 'result') {
          if (session.pending?.token === message.token) {
            const { resolve } = session.pending
            session.pending = null
            resolve(message.result)
          }
          return
        }
        const reading = message.reading
        if (session.reading.state === 'cancelling') {
          reading.state = message.type === 'progress' ? 'cancelling' : 'cancelled'
        }
        session.reading = reading
      })
      worker.on('error', () => this.workerEnded(session, worker))
      worker.on('exit', () => this.workerEnded(session, worker))
    } catch {
      session.reading = { ...session.reading, state: 'failed', failure: 'unavailable' }
    }
    return this.snapshot(session)
  }

  private workerEnded(session: Session, worker: Worker): void {
    if (session.worker !== worker) return
    session.worker = null
    session.signal = null
    session.pending?.resolve(null)
    session.pending = null
    if (session.reading.totals || ['scanning', 'cancelling'].includes(session.reading.state))
      session.reading = {
        ...session.reading,
        totals: null,
        state: 'failed',
        failure: 'unavailable'
      }
  }

  cancel(owner: WebContents, id: string): StorageSnapshot {
    const session = this.requireSession(owner, id)
    if (session.reading.state === 'scanning' && session.signal) {
      Atomics.store(session.signal, 0, 1)
      session.reading = { ...session.reading, state: 'cancelling' }
      this.touch(session)
    }
    return this.snapshot(session)
  }

  query(owner: WebContents, id: string, query: StorageQuery): Promise<StorageResult | null> {
    const session = this.requireSession(owner, id)
    if (!session.worker || !session.reading.totals || session.pending) return Promise.resolve(null)
    const worker = session.worker
    this.touch(session)
    return new Promise((resolve) => {
      const token = ++this.token
      session.pending = { token, resolve }
      try {
        worker.postMessage({ token, query } satisfies WorkerInput)
      } catch {
        session.pending = null
        resolve(null)
      }
    })
  }

  drop(owner: WebContents, id: string): Promise<void> {
    this.requireSession(owner, id)
    return this.dispose()
  }

  private async stopWorker(session: Session): Promise<void> {
    if (session.signal) Atomics.store(session.signal, 0, 1)
    const worker = session.worker
    session.worker = null
    session.signal = null
    session.pending?.resolve(null)
    session.pending = null
    await worker?.terminate().catch(() => {})
  }

  private dispose(): Promise<void> {
    if (!this.session) return this.disposing ?? Promise.resolve()
    const session = this.session
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
