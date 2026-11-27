interface VisibilitySource extends EventTarget {
  readonly hidden: boolean
}

export function scheduleVisibleRefresh(
  visibility: VisibilitySource,
  delayMs: number,
  refresh: () => Promise<void>
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  let running = false
  let disposed = false
  const schedule = (delay: number): void => {
    clearTimeout(timer)
    if (!disposed && !visibility.hidden && !running) timer = setTimeout(() => void run(), delay)
  }

  const run = async (): Promise<void> => {
    if (disposed || visibility.hidden || running) return
    running = true
    try {
      await refresh()
    } finally {
      running = false
      schedule(delayMs)
    }
  }
  const onVisibility = (): void => schedule(0)
  visibility.addEventListener('visibilitychange', onVisibility)
  schedule(0)
  return () => {
    disposed = true
    clearTimeout(timer)
    visibility.removeEventListener('visibilitychange', onVisibility)
  }
}
