import { STORAGE_CATEGORIES, STORAGE_LIMITS, type StorageQuery } from '../contracts/storageExplorer'

function entryId(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value < STORAGE_LIMITS.entries
  )
}

export function isStorageSessionId(value: unknown): value is string {
  return typeof value === 'string' && /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/.test(value)
}

const queryFields = [
  'folder',
  'selected',
  'view',
  'basis',
  'kind',
  'category',
  'text',
  'sort',
  'direction',
  'page'
] as const satisfies readonly (keyof StorageQuery)[]

export function isStorageQuery(value: unknown): value is StorageQuery {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== queryFields.length ||
    !queryFields.every((field) => Object.hasOwn(value, field))
  )
    return false
  const q = value as Partial<StorageQuery>
  return (
    entryId(q.folder) &&
    (q.selected === null || entryId(q.selected)) &&
    (q.view === 'folder' ||
      q.view === 'search' ||
      q.view === 'largest' ||
      q.view === 'recursive') &&
    (q.basis === 'logical' || q.basis === 'allocated') &&
    (q.kind === 'all' || q.kind === 'file' || q.kind === 'directory') &&
    (q.view !== 'largest' || q.kind !== 'all') &&
    (q.view !== 'recursive' || q.kind === 'directory') &&
    (q.category === null ||
      (q.category !== undefined && STORAGE_CATEGORIES.includes(q.category))) &&
    typeof q.text === 'string' &&
    q.text.length <= STORAGE_LIMITS.queryLength &&
    (q.sort === 'size' ||
      q.sort === 'logical' ||
      q.sort === 'allocated' ||
      q.sort === 'name' ||
      q.sort === 'percentage' ||
      q.sort === 'scopeShare' ||
      q.sort === 'count' ||
      q.sort === 'directories' ||
      q.sort === 'modified' ||
      q.sort === 'category' ||
      q.sort === 'kind') &&
    (q.direction === 'asc' || q.direction === 'desc') &&
    typeof q.page === 'number' &&
    Number.isInteger(q.page) &&
    q.page >= 0 &&
    q.page < Math.ceil(STORAGE_LIMITS.entries / STORAGE_LIMITS.pageSize)
  )
}

export function storageShare(value: bigint, total: bigint): number {
  return total > 0n && value >= 0n ? Number((value * 10_000n) / total) / 100 : 0
}

export interface StorageRect {
  index: number
  x: number
  y: number
  width: number
  height: number
}

export function storageTreemap(
  values: readonly string[],
  width: number,
  height: number
): StorageRect[] {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return []
  const nodes = values.slice(0, STORAGE_LIMITS.mapNodes).flatMap((value, index) => {
    if (!/^\d{1,32}$/.test(value) || BigInt(value) <= 0n) return []
    return [{ index, weight: Number(value) }]
  })
  const rects: StorageRect[] = []
  function split(start: number, end: number, x: number, y: number, w: number, h: number): void {
    if (end - start === 1) {
      rects.push({ index: nodes[start].index, x, y, width: w, height: h })
      return
    }
    const total = nodes.slice(start, end).reduce((sum, node) => sum + node.weight, 0)
    let weight = nodes[start].weight
    let mid = start + 1
    while (mid < end - 1 && weight + nodes[mid].weight / 2 < total / 2)
      weight += nodes[mid++].weight
    const ratio = weight / total
    if (w >= h) {
      const first = w * ratio
      split(start, mid, x, y, first, h)
      split(mid, end, x + first, y, w - first, h)
    } else {
      const first = h * ratio
      split(start, mid, x, y, w, first)
      split(mid, end, x, y + first, w, h - first)
    }
  }
  if (nodes.length) split(0, nodes.length, 0, 0, width, height)
  return rects
}
