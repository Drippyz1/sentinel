import { useEffect, useRef, useState } from 'react'
import type {
  StorageQuery,
  StorageResult,
  StorageSnapshot
} from '../../../../shared/contracts/storageExplorer'

export function isWorking(snapshot: StorageSnapshot | null): boolean {
  return snapshot?.state === 'scanning' || snapshot?.state === 'cancelling'
}

export function useStorageSession() {
  const [snapshot, setSnapshot] = useState<StorageSnapshot | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [action, setAction] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expired, setExpired] = useState(false)
  const revision = useRef(0)
  const working = isWorking(snapshot)
  const sessionId = snapshot?.id ?? null

  useEffect(() => {
    let disposed = false
    let next: ReturnType<typeof setTimeout> | undefined
    let fetching = false
    async function read() {
      if (disposed || fetching || action || document.hidden) return
      const previous = revision.current
      fetching = true
      try {
        const current = await window.electronAPI.getStorageSession()
        if (disposed || previous !== revision.current) return
        if (!current && sessionId) setExpired(true)
        setSnapshot(current)
        setLoaded(true)
        if (current) next = setTimeout(() => void read(), isWorking(current) ? 550 : 30_000)
      } catch {
        if (!disposed && previous === revision.current && !document.hidden) {
          setLoaded(true)
          setError('Scan status is unavailable. Reopen Storage Explorer to retry.')
        }
      } finally {
        fetching = false
      }
    }
    void read()
    const visibility = () => {
      clearTimeout(next)
      if (!document.hidden) void read()
    }
    document.addEventListener('visibilitychange', visibility)
    return () => {
      disposed = true
      clearTimeout(next)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [sessionId, working, action])

  async function invoke(
    label: string,
    callback: () => Promise<StorageSnapshot | null>,
    message: string,
    keepExisting = false
  ): Promise<boolean> {
    revision.current++
    setAction(label)
    setError(null)
    try {
      const next = await callback()
      if (next || !keepExisting) {
        setSnapshot(next)
        setExpired(false)
      }
      return Boolean(next)
    } catch {
      setError(message)
      return false
    } finally {
      setAction(null)
    }
  }

  return {
    snapshot,
    loaded,
    working,
    action,
    error,
    expired,
    choose: () =>
      invoke(
        'Selecting',
        window.electronAPI.chooseStorageScope,
        'Choose a supported local folder or volume. Aliases, network mounts, and known cloud locations are not scanned.',
        true
      ),
    start: (id: string) =>
      invoke(
        'Starting',
        () => window.electronAPI.startStorageScan(id),
        'The scan could not be started.'
      ),
    cancel: (id: string) =>
      invoke(
        'Cancelling',
        () => window.electronAPI.cancelStorageScan(id),
        'The scan could not be cancelled.'
      ),
    drop: (id: string) =>
      invoke(
        'Discarding',
        async () => {
          await window.electronAPI.dropStorageScan(id)
          return null
        },
        'The scan could not be discarded.'
      )
  }
}

export function useStorageResult(id: string, query: StorageQuery) {
  const [result, setResult] = useState<{ query: StorageQuery; value: StorageResult | null } | null>(
    null
  )
  const queue = useRef<Promise<void> | null>(null)
  useEffect(() => {
    let disposed = false
    let timer: ReturnType<typeof setTimeout>
    const request = () => {
      clearTimeout(timer)
      if (document.hidden) return
      timer = setTimeout(
        () => {
          const next = async () => {
            if (disposed || document.hidden) return
            const value = await window.electronAPI.queryStorageScan(id, query).catch(() => null)
            if (!disposed) setResult({ query, value })
          }
          queue.current = (queue.current ?? Promise.resolve()).then(next)
        },
        query.view === 'search' ? 125 : 0
      )
    }
    request()
    document.addEventListener('visibilitychange', request)
    return () => {
      disposed = true
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', request)
    }
  }, [id, query])

  return {
    result: result?.value ?? null,
    displayQuery: result?.query ?? query,
    pending: result?.query !== query,
    failed: result?.query === query && !result.value
  }
}
