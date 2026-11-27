export const STORAGE_LIMITS = {
  entries: 120_000,
  depth: 48,
  pageSize: 50,
  mapNodes: 20,
  queryLength: 160,
  retentionMs: 30 * 60_000
} as const

export const STORAGE_CATEGORIES = [
  'applications',
  'images',
  'video',
  'audio',
  'documents',
  'caches',
  'backups',
  'development',
  'build',
  'appSupport',
  'archives',
  'system',
  'other',
  'unknown'
] as const
export type StorageCategory = (typeof STORAGE_CATEGORIES)[number]
export type StorageBasis = 'logical' | 'allocated'
export type StorageState =
  | 'ready'
  | 'scanning'
  | 'cancelling'
  | 'cancelled'
  | 'complete'
  | 'partial'
  | 'failed'
export type StorageIssue =
  | 'permission'
  | 'vanished'
  | 'links'
  | 'boundary'
  | 'special'
  | 'depth'
  | 'entryLimit'
  | 'changed'
  | 'io'

// Exact decimal strings cross the sandboxed bridge without losing integer precision.
export interface StorageTotals {
  logical: string
  uniqueLogical: string
  allocated: string | null
  allocatedUnknown: number
  files: number
  directories: number
  hardLinkAliases: number
}

export interface StorageScope {
  name: string
  location: string
}

export interface StorageSnapshot {
  id: string
  scope: StorageScope
  state: StorageState
  elapsedMs: number
  completedAt: number | null
  processed: number
  indexed: number
  peakOpenDirectories: number
  skipped: Record<StorageIssue, number>
  totals: StorageTotals | null
  volume: { total: string; available: string } | null
  failure: 'scope-changed' | 'unavailable' | null
}

export interface StorageItem extends StorageTotals {
  id: number
  parent: number | null
  name: string
  kind: 'file' | 'directory'
  category: StorageCategory
  evidence: string
  modifiedAt: number | null
  incomplete: boolean
  skipped: number
  parentShare: number | null
  scopeShare: number | null
}

export type StorageSort =
  | 'size'
  | 'logical'
  | 'allocated'
  | 'name'
  | 'percentage'
  | 'scopeShare'
  | 'count'
  | 'directories'
  | 'modified'
  | 'category'
  | 'kind'
export interface StorageQuery {
  folder: number
  selected: number | null
  view: 'folder' | 'search' | 'largest' | 'recursive'
  basis: StorageBasis
  kind: 'all' | 'file' | 'directory'
  category: StorageCategory | null
  text: string
  sort: StorageSort
  direction: 'asc' | 'desc'
  page: number
}

export interface StorageMapEntry {
  id: number | null
  name: string
  kind: 'file' | 'directory' | 'other'
  bytes: string
  count: number
  category?: StorageCategory
}

export interface StorageResult {
  folder: StorageItem
  mapFolder: StorageItem
  breadcrumbs: { id: number; name: string }[]
  rows: StorageItem[]
  page: number
  matches: number
  map: StorageMapEntry[]
  mapBranch: { parent: number; entries: StorageMapEntry[] } | null
  categories: { category: StorageCategory; totals: StorageTotals }[]
  selected: { item: StorageItem; location: string; parentName: string | null } | null
}
