import { useEffect, useMemo, useRef, useState } from 'react'
import type { StorageMapEntry } from '../../../../shared/contracts/storageExplorer'
import { storageTreemap } from '../../../../shared/utils/storageExplorer'
import { displayBytes, displayShare } from './presentation'

export function StorageMap({
  entries,
  selected,
  select,
  open
}: {
  entries: StorageMapEntry[]
  selected: number | null
  select: (id: number) => void
  open: (id: number) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 640, height: 160 })
  useEffect(() => {
    const box = ref.current
    if (!box) return
    const observer = new ResizeObserver(([{ contentRect }]) => {
      const { width, height } = contentRect
      setSize((prior) =>
        prior.width === width && prior.height === height ? prior : { width, height }
      )
    })
    observer.observe(box)
    return () => observer.disconnect()
  }, [])
  const layout = useMemo(
    () =>
      storageTreemap(
        entries.map((node) => node.bytes),
        size.width,
        size.height
      ),
    [entries, size]
  )
  const total = entries.reduce((sum, node) => sum + BigInt(node.bytes), 0n)
  return (
    <div ref={ref} className="storage-map" role="group" aria-label="Proportional storage map">
      {!entries.length && (
        <p className="storage-empty">No positive measured sizes in this folder.</p>
      )}
      {layout.map(({ index, x, y, width, height }) => {
        const node = entries[index]
        const percent = displayShare((Number(BigInt(node.bytes)) / Number(total)) * 100)
        const title = `${node.kind === 'other' ? `${node.count} grouped entries` : node.name}: ${displayBytes(node.bytes)}, ${percent} of measured folder`
        const style = {
          left: `${(x / size.width) * 100}%`,
          top: `${(y / size.height) * 100}%`,
          width: `${(width / size.width) * 100}%`,
          height: `${(height / size.height) * 100}%`
        }
        const content = width >= 52 && height >= 24 && (
          <span>
            <strong>
              <bdi>{node.kind === 'other' ? `Other · ${node.count}` : node.name}</bdi>
            </strong>
            {height >= 42 && width >= 72 && (
              <small>
                {displayBytes(node.bytes)} · {percent}
              </small>
            )}
          </span>
        )
        const id = node.id
        if (id === null)
          return (
            <div
              key="other"
              className="storage-tile"
              data-kind="other"
              role="img"
              aria-label={title}
              title={title}
              style={style}
            >
              {content}
            </div>
          )
        return (
          <button
            key={id}
            className="storage-tile"
            type="button"
            data-kind={node.kind}
            aria-pressed={selected === id}
            aria-label={`${title}, ${node.kind === 'directory' ? 'folder' : 'file'}`}
            title={title}
            style={style}
            onClick={() => select(id)}
            onDoubleClick={node.kind === 'directory' ? () => open(id) : undefined}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && node.kind === 'directory') {
                event.preventDefault()
                open(id)
              }
            }}
          >
            {content}
          </button>
        )
      })}
    </div>
  )
}
