import {
  STORAGE_LIMITS,
  type StorageMapEntry,
  type StorageResult
} from '../contracts/storageExplorer'

export const FULL_TURN = 2 * Math.PI

interface RadialSector {
  node: StorageMapEntry
  start: number
  end: number
  fraction: number
}

function sectors(entries: StorageMapEntry[], start: number, end: number): RadialSector[] {
  const visible = entries.slice(0, STORAGE_LIMITS.mapNodes).flatMap((node) => {
    if (!/^\d+$/.test(node.bytes)) return []
    const bytes = BigInt(node.bytes)
    return bytes > 0n ? [{ node, bytes }] : []
  })
  const total = visible.reduce((sum, { bytes }) => sum + bytes, 0n)
  const angle = end - start
  let cumulative = 0n
  return visible.map(({ node, bytes }, index) => {
    const first = start + (Number(cumulative) / Number(total)) * angle
    cumulative += bytes
    return {
      node,
      start: first,
      end:
        index === visible.length - 1 ? end : start + (Number(cumulative) / Number(total)) * angle,
      fraction: Number(bytes) / Number(total)
    }
  })
}

export function radialStorage(entries: StorageMapEntry[], branch: StorageResult['mapBranch']) {
  const inner = sectors(entries, 0, FULL_TURN)
  const parent =
    branch && inner.find(({ node }) => node.id === branch.parent && node.kind === 'directory')
  const outer = parent && branch ? sectors(branch.entries, parent.start, parent.end) : []
  // Do not fill a parent wedge with a mismatched projection (for example, after switching bases).
  const matches =
    parent &&
    outer.reduce((total, { node }) => total + BigInt(node.bytes), 0n) === BigInt(parent.node.bytes)
  return { inner, outer: matches ? outer : [] }
}

export function annularSector(
  start: number,
  end: number,
  inner: number,
  outer: number,
  center = 140
): string {
  const span = end - start
  if (!(span > 0)) return ''
  const point = (radius: number, angle: number) =>
    `${(center + radius * Math.sin(angle)).toFixed(4)} ${(center - radius * Math.cos(angle)).toFixed(4)}`
  const arc = (radius: number, to: number, direction: 0 | 1, width: number) =>
    `A${radius} ${radius} 0 ${width > Math.PI ? 1 : 0} ${direction} ${point(radius, to)}`
  if (span >= FULL_TURN - 1e-9) {
    const middle = start + Math.PI
    return `M${point(outer, start)}${arc(outer, middle, 1, Math.PI)}${arc(outer, end, 1, Math.PI)}L${point(inner, end)}${arc(inner, middle, 0, Math.PI)}${arc(inner, start, 0, Math.PI)}Z`
  }
  return `M${point(outer, start)}${arc(outer, end, 1, span)}L${point(inner, end)}${arc(inner, start, 0, span)}Z`
}
