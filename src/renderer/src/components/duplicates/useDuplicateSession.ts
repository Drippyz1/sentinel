import { useEffect, useRef, useState } from 'react'
import type { DuplicateMode, DuplicateSnapshot } from '../../../../shared/contracts/duplicates'
import { scheduleVisibleRefresh } from '../../utils/visibleRefresh'

export const analyzing = (scan: DuplicateSnapshot | null): boolean =>
  scan?.state === 'running' || scan?.state === 'cancelling'

export function useDuplicateSession(initialMode: DuplicateMode = 'exact') {
  const [snapshot, setSnapshot] = useState<DuplicateSnapshot | null>(null)
  const [supported, setSupported] = useState<boolean | null>(null)
  const [modeChoice, setMode] = useState<DuplicateMode | null>(null)
  const mode = snapshot?.mode ?? modeChoice ?? initialMode
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const version = useRef(0)
  const busy = useRef(false)
  const running = analyzing(snapshot)
  const api = window.electronAPI

  useEffect(() => {
    let current = true
    const dispose = scheduleVisibleRefresh(document, running ? 450 : 30_000, async () => {
      const key = version.current
      if (busy.current) return
      try {
        const reading = await api.getDuplicateSession()
        if (!current || key !== version.current) return
        setSupported(reading.supported)
        setSnapshot(reading.snapshot)
      } catch {
        if (current && key === version.current && !document.hidden)
          setError('Analyzer session is unavailable. Return to this page or try again.')
      }
    })
    return () => {
      current = false
      dispose()
    }
  }, [api, running])

  const act = async (operation: () => Promise<DuplicateSnapshot | null>, keepOnNull = false) => {
    if (busy.current) return
    busy.current = true
    version.current++
    setError('')
    setPending(true)
    try {
      const next = await operation()
      if (next || !keepOnNull) setSnapshot(next)
    } catch (reason) {
      const message = reason instanceof Error ? reason.message.replace(/^.*?Error: /, '') : ''
      setError(message || 'The analyzer action could not be completed.')
    } finally {
      busy.current = false
      setPending(false)
    }
  }
  return {
    snapshot,
    supported,
    mode,
    pending,
    running,
    error,
    choose: () => act(() => api.chooseDuplicateScope(mode), true),
    start: (id: string) => act(() => api.startDuplicateScan(id)),
    cancel: (id: string) => act(() => api.cancelDuplicateScan(id)),
    discard: (id: string) =>
      act(async () => {
        await api.dropDuplicateScan(id)
        return null
      }),
    switchMode: (next: DuplicateMode) => {
      if (next === mode || running || busy.current) return
      if (!snapshot) {
        setMode(next)
        return
      }
      return act(async () => {
        await api.dropDuplicateScan(snapshot.id)
        setMode(next)
        return null
      })
    }
  }
}
