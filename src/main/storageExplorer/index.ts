import { join } from 'node:path'
import {
  STORAGE_CATEGORIES,
  STORAGE_LIMITS,
  type StorageBasis,
  type StorageItem,
  type StorageMapEntry,
  type StorageQuery,
  type StorageResult,
  type StorageTotals
} from '../../shared/contracts/storageExplorer'
import type { Classification } from './classify'

interface Accounting {
  logical: bigint
  uniqueLogical: bigint
  allocated: bigint
  allocatedUnknown: number
  files: number
  directories: number
  hardLinkAliases: number
}
type NodeMetadata = Omit<
  StorageItem,
  keyof StorageTotals | 'id' | 'parentShare' | 'scopeShare' | 'skipped' | 'incomplete'
>
interface Entry extends NodeMetadata, Accounting {
  incomplete: boolean
  skipped: number
  children: number[] | null
  end: number
}
export const emptyAccounting = (): Accounting => ({
  logical: 0n,
  uniqueLogical: 0n,
  allocated: 0n,
  allocatedUnknown: 0,
  files: 0,
  directories: 0,
  hardLinkAliases: 0
})

function add(a: Accounting, b: Accounting): void {
  a.logical += b.logical
  a.uniqueLogical += b.uniqueLogical
  a.allocated += b.allocated
  a.allocatedUnknown += b.allocatedUnknown
  a.files += b.files
  a.directories += b.directories
  a.hardLinkAliases += b.hardLinkAliases
}

function allocated(a: Accounting): bigint | null {
  return a.files > 0 && a.files === a.allocatedUnknown ? null : a.allocated
}

function bytes(a: Accounting, basis: StorageBasis): bigint | null {
  return basis === 'logical' ? a.logical : allocated(a)
}

function serialize(a: Accounting): StorageTotals {
  return {
    logical: a.logical.toString(),
    uniqueLogical: a.uniqueLogical.toString(),
    allocated: allocated(a)?.toString() ?? null,
    allocatedUnknown: a.allocatedUnknown,
    files: a.files,
    directories: a.directories,
    hardLinkAliases: a.hardLinkAliases
  }
}

const alphabet = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

export class StorageIndex {
  private readonly entries: Entry[] = []
  private readonly categories = STORAGE_CATEGORIES.map((category) => ({
    category,
    totals: emptyAccounting()
  }))
  private resultCache: { key: string; ids: number[] } | null = null
  private mapCache: { key: string; nodes: StorageMapEntry[] } | null = null
  private branchCache: { key: string; nodes: StorageMapEntry[] } | null = null

  constructor(private readonly scope: string) {}

  get size(): number {
    return this.entries.length
  }

  addDirectory(
    parent: number | null,
    name: string,
    classification: Classification,
    modifiedAt: number | null
  ): number {
    return this.addEntry(
      { parent, name, ...classification, modifiedAt, kind: 'directory' },
      emptyAccounting()
    )
  }

  addFile(
    parent: number,
    name: string,
    classification: Classification,
    modifiedAt: number | null,
    logical: bigint,
    allocation: bigint | null,
    alias: boolean
  ): void {
    const totals = {
      logical,
      uniqueLogical: alias ? 0n : logical,
      allocated: allocation ?? 0n,
      allocatedUnknown: allocation === null ? 1 : 0,
      files: 1,
      directories: 0,
      hardLinkAliases: alias ? 1 : 0
    }
    this.addEntry({ parent, name, ...classification, modifiedAt, kind: 'file' }, totals)
    add(this.categories[STORAGE_CATEGORIES.indexOf(classification.category)].totals, totals)
  }

  private addEntry(meta: NodeMetadata, totals: Accounting): number {
    const id = this.entries.length
    this.entries.push({
      ...meta,
      ...totals,
      incomplete: false,
      skipped: 0,
      children: meta.kind === 'directory' ? [] : null,
      end: id + 1
    })
    if (meta.parent !== null) this.entries[meta.parent].children?.push(id)
    return id
  }

  markIncomplete(id: number, skipped = 0): void {
    this.entries[id].incomplete = true
    this.entries[id].skipped += skipped
  }

  finish(): StorageTotals {
    for (let id = this.entries.length - 1; id > 0; id--) {
      const entry = this.entries[id]
      const parent = this.entries[entry.parent!]
      add(parent, entry)
      if (entry.kind === 'directory') parent.directories++
      parent.end = Math.max(parent.end, entry.end)
      parent.incomplete ||= entry.incomplete
      parent.skipped += entry.skipped
    }
    return serialize(this.entries[0])
  }

  private parentShare(entry: Entry, basis: StorageBasis): number | null {
    return entry.parent === null ? null : this.share(entry, this.entries[entry.parent], basis)
  }

  private share(entry: Entry, reference: Entry, basis: StorageBasis): number | null {
    const value = bytes(entry, basis)
    const total = bytes(reference, basis)
    return value === null || total === null || total === 0n
      ? null
      : (Number(value) / Number(total)) * 100
  }

  private item(id: number, basis: StorageBasis): StorageItem {
    const entry = this.entries[id]
    const { parent, name, category, evidence, modifiedAt, kind, incomplete, skipped } = entry
    return {
      id,
      parent,
      name,
      category,
      evidence,
      modifiedAt,
      kind,
      incomplete,
      skipped,
      ...serialize(entry),
      parentShare: this.parentShare(entry, basis),
      scopeShare: this.share(entry, this.entries[0], basis)
    }
  }

  private breadcrumbs(id: number): { id: number; name: string }[] {
    const names: { id: number; name: string }[] = []
    for (let current: number | null = id; current !== null; current = this.entries[current].parent)
      names.push({ id: current, name: this.entries[current].name })
    return names.reverse()
  }

  query(q: StorageQuery): StorageResult | null {
    const folder = this.entries[q.folder]
    if (!folder?.children || (q.selected !== null && !this.entries[q.selected])) return null
    const { folder: folderId, selected, page, ...filter } = q
    const key = JSON.stringify([folderId, filter])
    const mapId =
      q.view === 'folder' || selected === null
        ? folderId
        : (this.entries[selected].parent ?? folderId)
    if (this.resultCache?.key !== key) this.resultCache = { key, ids: this.filter(q, folder) }
    const ids = this.resultCache.ids
    const matching = ids.length
    const effectivePage = Math.min(
      page,
      Math.max(0, Math.ceil(matching / STORAGE_LIMITS.pageSize) - 1)
    )
    const start = effectivePage * STORAGE_LIMITS.pageSize
    const mapKey = `${mapId}:${q.basis}`
    if (this.mapCache?.key !== mapKey)
      this.mapCache = { key: mapKey, nodes: this.map(this.entries[mapId].children ?? [], q.basis) }
    const selection = selected === null ? null : this.entries[selected]
    const branch =
      selection?.parent === mapId && selection.children ? selected : (selection?.parent ?? null)
    const branchNode = this.mapCache.nodes.find(
      (node) => node.id !== null && node.id === branch && node.kind === 'directory'
    )
    let mapBranch: StorageResult['mapBranch'] = null
    if (branchNode?.id != null) {
      const parent = branchNode.id
      const branchKey = `${parent}:${q.basis}`
      if (this.branchCache?.key !== branchKey)
        this.branchCache = {
          key: branchKey,
          nodes: this.map(this.entries[parent].children ?? [], q.basis)
        }
      mapBranch = { parent, entries: this.branchCache.nodes }
    }
    return {
      folder: this.item(folderId, q.basis),
      mapFolder: this.item(mapId, q.basis),
      breadcrumbs: this.breadcrumbs(folderId),
      rows: ids.slice(start, start + STORAGE_LIMITS.pageSize).map((id) => this.item(id, q.basis)),
      page: effectivePage,
      matches: matching,
      map: this.mapCache.nodes,
      mapBranch,
      categories: this.categories.map(({ category, totals }) => ({
        category,
        totals: serialize(totals)
      })),
      selected:
        selected === null
          ? null
          : {
              item: this.item(selected, q.basis),
              parentName:
                this.entries[selected].parent === null
                  ? null
                  : this.entries[this.entries[selected].parent!].name,
              location: join(
                this.scope,
                ...this.breadcrumbs(selected)
                  .slice(1)
                  .map(({ name }) => name)
              )
            }
    }
  }

  private filter(q: StorageQuery, folder: Entry): number[] {
    const searchText = q.text.trim().toLocaleLowerCase()
    const matches = (id: number) => {
      const entry = this.entries[id]
      return (
        (q.kind === 'all' || q.kind === entry.kind) &&
        (q.category === null || q.category === entry.category) &&
        (!searchText || entry.name.toLocaleLowerCase().includes(searchText))
      )
    }
    const result: number[] = []
    if (q.view === 'folder' || (q.view === 'largest' && q.kind !== 'file')) {
      for (const id of folder.children ?? []) if (matches(id)) result.push(id)
    } else {
      const from = q.view === 'search' ? 1 : q.folder + 1
      const end = q.view === 'search' ? this.entries.length : folder.end
      for (let id = from; id < end; id++) if (matches(id)) result.push(id)
    }
    const direction = q.direction === 'asc' ? 1 : -1
    const shares = q.sort === 'percentage' ? new Float64Array(this.entries.length) : null
    if (shares)
      for (const id of result) shares[id] = this.parentShare(this.entries[id], q.basis) ?? -1
    function compare(
      x: bigint | number | null,
      y: bigint | number | null,
      a: number,
      b: number
    ): number {
      if (x === null || y === null) return x === y ? a - b : x === null ? 1 : -1
      return (x === y ? 0 : x < y ? -1 : 1) * direction || a - b
    }
    return result.sort((a, b) => {
      const left = this.entries[a],
        right = this.entries[b]
      let compared: number
      if (q.sort === 'name') compared = alphabet.compare(left.name, right.name)
      else if (q.sort === 'count') compared = left.files - right.files
      else if (q.sort === 'directories') compared = left.directories - right.directories
      else if (q.sort === 'category') compared = alphabet.compare(left.category, right.category)
      else if (q.sort === 'kind') compared = alphabet.compare(left.kind, right.kind)
      else if (q.sort === 'modified') return compare(left.modifiedAt, right.modifiedAt, a, b)
      else if (shares)
        return compare(shares[a] < 0 ? null : shares[a], shares[b] < 0 ? null : shares[b], a, b)
      else {
        const basis = q.sort === 'logical' || q.sort === 'allocated' ? q.sort : q.basis
        return compare(bytes(left, basis), bytes(right, basis), a, b)
      }
      return compared * direction || a - b
    })
  }

  private map(ids: readonly number[], basis: StorageBasis): StorageMapEntry[] {
    let total = 0n
    let peak = 0n
    let positive = 0
    for (const id of ids) {
      const value = bytes(this.entries[id], basis)
      if (value === null || value <= 0n) continue
      total += value
      if (value > peak) peak = value
      positive++
    }
    const visible: { id: number; value: bigint }[] = []
    if (peak > 0n && peak * 250n >= total) {
      // At most 250 entries can reach the 0.4% floor; only retain the largest displayable nodes.
      for (const id of ids) {
        const value = bytes(this.entries[id], basis)
        if (value === null || value <= 0n || value * 250n < total) continue
        const at = visible.findIndex(
          (row) => value > row.value || (value === row.value && id < row.id)
        )
        if (at >= 0) visible.splice(at, 0, { id, value })
        else if (visible.length < STORAGE_LIMITS.mapNodes - 1) visible.push({ id, value })
        if (visible.length >= STORAGE_LIMITS.mapNodes) visible.pop()
      }
    }
    const nodes: StorageMapEntry[] = visible.map(({ id, value }) => ({
      id,
      name: this.entries[id].name,
      kind: this.entries[id].kind,
      category: this.entries[id].category,
      bytes: value.toString(),
      count: 1
    }))
    if (visible.length < positive) {
      const remainder = total - visible.reduce((sum, row) => sum + row.value, 0n)
      nodes.push({
        id: null,
        name: 'Other entries',
        kind: 'other',
        bytes: remainder.toString(),
        count: positive - visible.length
      })
    }
    return nodes
  }
}
