export const DUPLICATE_LIMITS = {
  entries: 30_000,
  exactCandidates: 12_000,
  photos: 512,
  groups: 1000,
  groupPage: 30,
  memberPage: 30,
  search: 160,
  chunk: 256 * 1024,
  fileBytes: 256 * 1024 ** 2,
  totalBytes: 2 * 1024 ** 3,
  durationMs: 5 * 60_000,
  photoBytes: 4 * 1024 ** 2,
  photoPixels: 12_000_000,
  photoDimension: 4096,
  thumbnail: 192,
  distance: 10
} as const

export type DuplicateMode = 'exact' | 'photos'
export type DuplicateState =
  | 'ready'
  | 'running'
  | 'cancelling'
  | 'cancelled'
  | 'complete'
  | 'partial'
  | 'failed'
export type DuplicatePhase =
  | 'discovery'
  | 'hashing'
  | 'verification'
  | 'decoding'
  | 'matching'
  | 'ready'
export type DuplicateIssue =
  | 'discovery'
  | 'changed'
  | 'unreadable'
  | 'unavailableData'
  | 'unsupportedFormat'
  | 'invalidImage'
  | 'imageLimit'
  | 'lowDetail'
  | 'decoderUnavailable'
  | 'resourceLimit'
  | 'identityUnavailable'

export interface DuplicateReading {
  state: DuplicateState
  phase: DuplicatePhase
  inspected: number
  eligible: number
  completed: number
  groups: number
  bytesRead: number
  elapsedMs: number
  phaseMs: Partial<Record<DuplicatePhase, number>>
  skipped: Record<DuplicateIssue, number>
}

export interface DuplicateSnapshot extends DuplicateReading {
  id: string
  mode: DuplicateMode
  scope: { name: string; location: string }
}

export interface DuplicateQuery {
  text: string
  sort: 'bytes' | 'copies' | 'name' | 'distance'
  threshold: number
  page: number
  group: number | null
  memberPage: number
  hideEmpty: boolean
}

export interface DuplicateGroup {
  id: number
  label: string
  paths: number
  copies: number
  each: string | null
  logical: string
  redundant: string | null
  allocated: string | null
  bestDistance: number | null
  reference: number
}

export interface DuplicateMember {
  id: number
  name: string
  location: string
  logical: string
  allocated: string | null
  modifiedAt: number
  hardLinkAlias: boolean
  image: { width: number; height: number; format: 'jpeg' | 'png' } | null
  distance: number | null
  byteEqual: boolean
}

export interface DuplicateResult {
  groups: DuplicateGroup[]
  matches: number
  page: number
  selected: DuplicateGroup | null
  referenceFile: DuplicateMember | null
  members: DuplicateMember[]
  memberPage: number
}

export interface DuplicatePreview {
  reference: string | null
  member: string | null
}
