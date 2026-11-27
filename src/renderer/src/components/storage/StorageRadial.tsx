import { useMemo, useState } from 'react'
import type { StorageMapEntry, StorageResult } from '../../../../shared/contracts/storageExplorer'
import { annularSector, radialStorage } from '../../../../shared/utils/storageRadial'
import { CATEGORY_LABELS, displayBytes, displayShare } from './presentation'

const PALETTE = {
  applications: 'gpu',
  images: 'memory',
  video: 'storage',
  audio: 'network',
  documents: 'cpu',
  caches: 'neutral',
  backups: 'storage',
  development: 'battery',
  build: 'battery',
  appSupport: 'gpu',
  archives: 'storage',
  system: 'neutral',
  other: 'neutral',
  unknown: 'neutral'
} as const

export function StorageRadial({
  entries,
  branch,
  folder,
  basis,
  selected,
  select,
  open
}: {
  entries: StorageMapEntry[]
  branch: StorageResult['mapBranch']
  folder: string
  basis: 'logical' | 'allocated'
  selected: number | null
  select: (id: number) => void
  open: (id: number) => void
}) {
  const { inner, outer } = useMemo(() => radialStorage(entries, branch), [entries, branch])
  const [inspection, setInspection] = useState<{ key: string; ring: 'inner' | 'outer' } | null>(
    null
  )
  const key = (node: StorageMapEntry) => String(node.id ?? 'other')
  const active =
    inspection &&
    (inspection.ring === 'inner' ? inner : outer).find(({ node }) => key(node) === inspection.key)
  const selectedSector = [...inner, ...outer].find(
    ({ node }) => node.id !== null && node.id === selected
  )
  const current = active || selectedSector
  const sum = inner.reduce((total, { node }) => total + BigInt(node.bytes), 0n)
  const sector = (
    { node, start, end, fraction }: (typeof inner)[number],
    ring: 'inner' | 'outer'
  ) => {
    const outerRing = ring === 'outer'
    const label = node.id === null ? `${node.count} grouped entries` : node.name
    const title = `${label}: ${displayBytes(node.bytes)}, ${displayShare(fraction * 100)} of measured ${outerRing ? 'parent' : 'folder'}`
    const inspect = () => setInspection({ key: key(node), ring })
    return (
      <path
        key={`${ring}:${key(node)}`}
        className="radial-sector"
        data-ring={ring}
        data-ink={node.category ? PALETTE[node.category] : 'neutral'}
        data-branch={!outerRing && node.id != null && node.id === branch?.parent}
        d={annularSector(start, end, outerRing ? 101 : 66, outerRing ? 134 : 98)}
        role={node.id === null ? 'img' : 'button'}
        tabIndex={0}
        aria-label={title}
        aria-pressed={node.id !== null ? node.id === selected : undefined}
        onMouseEnter={inspect}
        onMouseLeave={() => setInspection(null)}
        onFocus={inspect}
        onBlur={() => setInspection(null)}
        onClick={() => {
          if (node.id !== null) select(node.id)
          else inspect()
        }}
        onDoubleClick={() => {
          if (node.kind === 'directory' && node.id !== null) open(node.id)
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          if (node.id === null) inspect()
          else if (event.key === 'Enter' && node.kind === 'directory' && node.id === selected)
            open(node.id)
          else select(node.id)
        }}
      >
        <title>{title}</title>
      </path>
    )
  }
  if (!inner.length)
    return <p className="storage-empty">No positive measured sizes in this folder.</p>
  return (
    <figure className="storage-radial" aria-label="Radial storage map">
      <div className="radial-graphic">
        <svg viewBox="0 0 280 280" role="group" aria-label="Proportional directory sectors">
          <circle className="radial-track" cx="140" cy="140" r="82" fill="none" strokeWidth="32" />
          {inner.map((node) => sector(node, 'inner'))}
          {outer.map((node) => sector(node, 'outer'))}
        </svg>
        <div className="radial-center" aria-hidden="true">
          <strong>{displayBytes(sum.toString())}</strong>
          <span>{basis === 'allocated' ? 'Known allocation' : 'Logical size'}</span>
        </div>
      </div>
      <figcaption className="radial-reading">
        <strong>
          <bdi>{current?.node.name ?? folder}</bdi>
        </strong>
        {current ? (
          <>
            <span>
              {displayBytes(current.node.bytes)} · {displayShare(current.fraction * 100)} of
              measured {outer.includes(current) ? 'parent' : 'folder'}
            </span>
            <span>
              {current.node.category
                ? CATEGORY_LABELS[current.node.category]
                : `${current.node.count} grouped entries`}
            </span>
          </>
        ) : (
          <span>
            {inner.length} sectors ·{' '}
            {outer.length ? 'Includes selected folder contents' : 'Immediate entries'}
          </span>
        )}
      </figcaption>
    </figure>
  )
}
