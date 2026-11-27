import type {
  StorageBasis,
  StorageCategory,
  StorageIssue,
  StorageSort,
  StorageTotals
} from '../../../../shared/contracts/storageExplorer'

export const COLUMNS: { id: StorageSort; label: string; title?: string; numeric?: boolean }[] = [
  { id: 'name', label: 'Name' },
  { id: 'logical', label: 'Logical', title: 'Logical size', numeric: true },
  { id: 'allocated', label: 'Allocated', title: 'Allocated size estimate', numeric: true },
  {
    id: 'percentage',
    label: 'Parent %',
    title: 'Share of the immediate parent in the selected size basis',
    numeric: true
  },
  { id: 'count', label: 'Files', title: 'Indexed descendant file count', numeric: true },
  {
    id: 'scopeShare',
    label: 'Scope %',
    title: 'Share of the entire indexed scope in the selected size basis',
    numeric: true
  },
  {
    id: 'directories',
    label: 'Folders',
    title: 'Indexed descendant directory count',
    numeric: true
  },
  { id: 'modified', label: 'Modified' },
  { id: 'category', label: 'Category' },
  { id: 'kind', label: 'Type' }
]
export const DEFAULT_COLUMNS: StorageSort[] = [
  'name',
  'logical',
  'allocated',
  'percentage',
  'count'
]

export const CATEGORY_LABELS: Record<StorageCategory, string> = {
  applications: 'Applications',
  images: 'Images',
  video: 'Video',
  audio: 'Audio',
  documents: 'Documents',
  caches: 'Caches',
  backups: 'Backups',
  development: 'Development',
  build: 'Build artifacts',
  appSupport: 'Application support',
  archives: 'Archives',
  system: 'System',
  other: 'Other',
  unknown: 'Unknown'
}

export const ISSUE_LABELS: Record<StorageIssue, string> = {
  permission: 'Access denied',
  vanished: 'Disappeared during scan',
  links: 'Links not followed',
  boundary: 'Mount or cloud boundary',
  special: 'Unsupported entry',
  depth: 'Directory depth limit',
  entryLimit: 'Scan entry limit',
  changed: 'Changed directory identity',
  io: 'Filesystem errors'
}

export function selectedBytes(totals: StorageTotals, basis: StorageBasis): string | null {
  return basis === 'logical' ? totals.logical : totals.allocated
}

export function displayShare(value: number | null): string {
  return value === null
    ? '—'
    : value > 0 && value < 0.01
      ? '<0.01%'
      : `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}%`
}

export function displayBytes(value: string | null): string {
  if (value === null) return 'Unavailable'
  const bytes = BigInt(value)
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
  let unit = 0,
    scale = 1n
  while (unit < units.length - 1 && bytes >= scale * 1000n) {
    scale *= 1000n
    unit++
  }
  if (unit === 0) return `${bytes.toLocaleString()} B`
  const tenths = (bytes * 10n + scale / 2n) / scale
  return `${(tenths / 10n).toLocaleString()}.${tenths % 10n} ${units[unit]}`
}
