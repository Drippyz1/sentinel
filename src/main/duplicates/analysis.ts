import { createHash } from 'node:crypto'
import { extname } from 'node:path'
import {
  DUPLICATE_LIMITS,
  type DuplicateGroup,
  type DuplicateMember,
  type DuplicateMode,
  type DuplicatePhase,
  type DuplicatePreview,
  type DuplicateQuery,
  type DuplicateReading,
  type DuplicateResult
} from '../../shared/contracts/duplicates'
import { scanStorage } from '../storageExplorer/traverse'
import type { AuthorizedScope } from '../storageExplorer/scope'
import {
  AnalysisStop,
  ContentIndex,
  ContentIssue,
  ContentReads,
  contentIssue,
  type ContentFile
} from './content'
import { imageInfo, type DecodedPhoto, type ImageInfo } from './imageFormat'
import { photoDistance, photoSignature, type PhotoSignature } from './similarity'

export type Decode = (
  bytes: Buffer,
  format: ImageInfo['format'],
  preview: boolean
) => Promise<DecodedPhoto | 'unavailable' | null>

interface Photo {
  image: ImageInfo
  signature: PhotoSignature
  digest: string
}
interface Member {
  file: ContentFile
  alias: boolean
  photo?: Photo
  distance: number | null
  byteEqual: boolean
}
type Group = { id: number; members: Member[] }

const unsupportedImages = new Set([
  '.heic',
  '.heif',
  '.avif',
  '.webp',
  '.gif',
  '.tiff',
  '.tif',
  '.bmp',
  '.svg',
  '.raw',
  '.dng',
  '.nef',
  '.cr2',
  '.cr3',
  '.arw',
  '.ico'
])

function format(file: ContentFile): ImageInfo['format'] | null {
  const extension = extname(file.name).toLowerCase()
  return extension === '.png'
    ? 'png'
    : extension === '.jpg' || extension === '.jpeg'
      ? 'jpeg'
      : null
}

export function duplicateReading(state: DuplicateReading['state'] = 'ready'): DuplicateReading {
  return {
    state,
    phase: state === 'ready' ? 'ready' : 'discovery',
    inspected: 0,
    eligible: 0,
    completed: 0,
    groups: 0,
    bytesRead: 0,
    elapsedMs: 0,
    phaseMs: {},
    skipped: {
      discovery: 0,
      changed: 0,
      unreadable: 0,
      unavailableData: 0,
      unsupportedFormat: 0,
      invalidImage: 0,
      imageLimit: 0,
      lowDetail: 0,
      decoderUnavailable: 0,
      resourceLimit: 0,
      identityUnavailable: 0
    }
  }
}

const identity = (f: ContentFile) => `${f.dev}:${f.ino}`
const lex = (a: string, b: string) => (a === b ? 0 : a < b ? -1 : 1)
const sum = (members: Member[]) => members.reduce((n, row) => n + row.file.size, 0n)

export class DuplicateAnalysis {
  private readonly started = performance.now()
  private phaseStarted = this.started
  private last = -Infinity
  private readonly groups: Group[] = []
  private readonly index: ContentIndex
  private readonly reads: ContentReads
  readonly reading = duplicateReading('running')

  constructor(
    private readonly scope: AuthorizedScope,
    readonly mode: DuplicateMode,
    private readonly cancelled: () => boolean,
    private readonly progress: (reading: DuplicateReading) => void,
    private readonly decode: Decode
  ) {
    this.index = new ContentIndex(
      scope.display.location,
      (reason) => this.reading.skipped[reason]++
    )
    this.reads = new ContentReads(this.index, this.check)
  }

  private check = (): void => {
    if (this.cancelled()) throw new AnalysisStop()
    if (performance.now() - this.started >= DUPLICATE_LIMITS.durationMs)
      throw new ContentIssue('resourceLimit')
  }

  private update(force = false): void {
    const now = performance.now()
    this.reading.bytesRead = this.reads.bytes
    this.reading.groups = this.groups.length
    this.reading.elapsedMs = Math.round(now - this.started)
    if (force || now - this.last >= 250) {
      this.last = now
      this.progress({
        ...this.reading,
        skipped: { ...this.reading.skipped },
        phaseMs: { ...this.reading.phaseMs }
      })
    }
  }

  private phase(next: DuplicatePhase): void {
    const current = this.reading.phase
    this.reading.phaseMs[current] =
      (this.reading.phaseMs[current] ?? 0) + Math.round(performance.now() - this.phaseStarted)
    this.phaseStarted = performance.now()
    this.reading.phase = next
    this.update(true)
  }

  private record(error: unknown): void {
    if (
      error instanceof AnalysisStop ||
      (error instanceof ContentIssue && error.reason === 'resourceLimit')
    )
      throw error
    this.reading.skipped[contentIssue(error)]++
  }

  async run(): Promise<DuplicateReading> {
    try {
      const { reading } = await scanStorage(this.scope, {
        cancelled: () =>
          this.cancelled() || performance.now() - this.started >= DUPLICATE_LIMITS.durationMs,
        progress: (progress) => {
          this.reading.inspected = progress.processed
          this.update()
        },
        maxEntries: DUPLICATE_LIMITS.entries,
        observe: (id, parent, name, s) => this.index.observe(id, parent, name, s)
      })
      this.reading.skipped.discovery = Object.values(reading.skipped).reduce((a, b) => a + b, 0)
      if (reading.state === 'failed') {
        this.reading.state = 'failed'
      } else {
        this.check()
        this.index.files.sort(
          (a, b) => lex(a.name, b.name) || lex(this.index.location(a), this.index.location(b))
        )
        if (this.mode === 'exact') await this.exact()
        else await this.photos()
        this.reading.state = Object.values(this.reading.skipped).some(Boolean)
          ? 'partial'
          : 'complete'
      }
    } catch (error) {
      if (error instanceof AnalysisStop) this.reading.state = 'cancelled'
      else if (error instanceof ContentIssue) {
        this.reading.skipped[error.reason]++
        this.reading.state = 'partial'
      } else this.reading.state = 'failed'
    }
    this.phase('ready')
    return this.reading
  }

  private async exact(): Promise<void> {
    const sizes = new Map<bigint, Map<string, ContentFile[]>>()
    for (const file of this.index.files) {
      let copies = sizes.get(file.size)
      if (!copies) sizes.set(file.size, (copies = new Map()))
      const key = identity(file)
      const aliases = copies.get(key)
      if (aliases) aliases.push(file)
      else copies.set(key, [file])
    }
    const candidates = [...sizes.values()].filter((copies) => copies.size > 1)
    this.reading.eligible = candidates.reduce((n, copies) => n + copies.size, 0)
    this.phase('hashing')
    const digests = new Map<string, ContentFile[][]>()
    hashing: for (const copies of candidates)
      for (const paths of copies.values()) {
        this.check()
        if (this.reading.completed >= DUPLICATE_LIMITS.exactCandidates) {
          this.reading.skipped.resourceLimit += this.reading.eligible - this.reading.completed
          break hashing
        }
        const file = paths[0]
        this.reading.completed++
        if (file.size > BigInt(DUPLICATE_LIMITS.fileBytes)) {
          this.reading.skipped.resourceLimit++
          continue
        }
        // Each successful hash may require two copies' worth of verification reads.
        if (this.reads.bytes + Number(file.size) > Math.floor(DUPLICATE_LIMITS.totalBytes / 3)) {
          this.reading.skipped.resourceLimit += this.reading.eligible - this.reading.completed + 1
          this.reading.completed--
          break hashing
        }
        try {
          const key = `${file.size}:${await this.reads.digest(file)}`
          const group = digests.get(key)
          if (group) group.push(paths)
          else digests.set(key, [paths])
        } catch (error) {
          this.record(error)
        } finally {
          this.update()
        }
      }
    this.phase('verification')
    for (const distinct of digests.values()) {
      if (distinct.length < 2) continue
      this.check()
      const verified = [distinct[0]]
      for (const paths of distinct.slice(1)) {
        try {
          if (await this.reads.equal(verified[0][0], paths[0])) verified.push(paths)
        } catch (error) {
          this.record(error)
        }
        this.update()
      }
      if (verified.length < 2) continue
      const members: Member[] = []
      for (const paths of verified) {
        try {
          await this.index.withFile(paths[0], async () => {}, this.check)
        } catch (error) {
          // Without the reference all previous comparisons lose their witness.
          this.record(error)
          if (paths === verified[0]) {
            members.length = 0
            break
          }
          continue
        }
        members.push({ file: paths[0], alias: false, distance: null, byteEqual: true })
        for (const alias of paths.slice(1)) {
          try {
            await this.index.withFile(alias, async () => {}, this.check)
            members.push({ file: alias, alias: true, distance: null, byteEqual: true })
          } catch (error) {
            this.record(error)
          }
        }
        this.update()
      }
      if (members.filter((m) => !m.alias).length >= 2) this.addGroup(members)
    }
  }

  private addGroup(members: Member[]): void {
    if (this.groups.length >= DUPLICATE_LIMITS.groups) throw new ContentIssue('resourceLimit')
    this.groups.push({ id: this.groups.length, members })
  }

  private async photos(): Promise<void> {
    this.phase('decoding')
    const photos: Member[] = []
    const seen = new Set<string>()
    const files = this.index.files.filter((file) => {
      const key = identity(file)
      if (seen.has(key)) return false
      if (!format(file)) {
        if (unsupportedImages.has(extname(file.name).toLowerCase()))
          this.reading.skipped.unsupportedFormat++
        return false
      }
      seen.add(key)
      return true
    })
    this.reading.eligible = files.length
    this.reading.skipped.resourceLimit += Math.max(0, files.length - DUPLICATE_LIMITS.photos)
    for (const file of files.slice(0, DUPLICATE_LIMITS.photos)) {
      this.check()
      this.reading.completed++
      try {
        const encoding = format(file)!
        const data = await this.reads.loadPhoto(file)
        imageInfo(data, encoding)
        const decoded = await this.decode(data, encoding, false)
        this.check()
        if (decoded === 'unavailable') {
          this.reading.skipped.decoderUnavailable++
          continue
        }
        if (!decoded) {
          this.reading.skipped.invalidImage++
          continue
        }
        const signature = photoSignature(decoded)
        if (!signature) {
          this.reading.skipped.lowDetail++
          continue
        }
        photos.push({
          file,
          alias: false,
          distance: null,
          byteEqual: false,
          photo: {
            image: { width: decoded.width, height: decoded.height, format: encoding },
            signature,
            digest: createHash('sha256').update(data).digest('hex')
          }
        })
      } catch (error) {
        this.record(error)
      } finally {
        this.update()
      }
    }
    this.phase('matching')
    const anchors: { members: Member[]; id: number | null }[] = []
    // Only compare with anchors. The 512-photo input cap also bounds comparisons to 130,816.
    for (const item of photos) {
      this.check()
      let nearest: (typeof anchors)[number] | null = null
      let score: number = DUPLICATE_LIMITS.distance + 1
      for (const anchor of anchors) {
        const distance = photoDistance(item.photo!.signature, anchor.members[0].photo!.signature)
        if (distance !== null && distance < score) {
          score = distance
          nearest = anchor
        }
      }
      if (!nearest) {
        anchors.push({ members: [item], id: null })
        continue
      }
      item.distance = score
      const reference = nearest.members[0]
      try {
        // Do not publish changed images, even when only perceptually matched.
        await this.index.withFile(reference.file, async () => {}, this.check)
        await this.index.withFile(item.file, async () => {}, this.check)
        if (reference.photo!.digest === item.photo!.digest)
          item.byteEqual = await this.reads.equal(reference.file, item.file)
      } catch (error) {
        this.record(error)
        continue
      }
      nearest.members.push(item)
      if (nearest.id === null) {
        this.addGroup(nearest.members)
        nearest.id = this.groups.length - 1
      }
      this.update()
    }
  }

  private members(group: Group, threshold: number): Member[] {
    return this.mode === 'exact'
      ? group.members
      : group.members.filter((m) => m.distance === null || m.distance <= threshold)
  }

  private summary(group: Group, members: Member[]): DuplicateGroup {
    const first = members[0].file
    const independent = members.filter((member) => !member.alias)
    const exact = this.mode === 'exact'
    return {
      id: group.id,
      label: first.name,
      paths: members.length,
      copies: independent.length,
      each: exact ? first.size.toString() : null,
      logical: sum(members).toString(),
      redundant: exact ? (first.size * BigInt(independent.length - 1)).toString() : null,
      allocated: independent.some((m) => m.file.allocated === null)
        ? null
        : independent.reduce((n, m) => n + m.file.allocated!, 0n).toString(),
      bestDistance: exact ? null : Math.min(...members.slice(1).map((m) => m.distance!)),
      reference: first.id
    }
  }

  private describe(member: Member): DuplicateMember {
    const { file } = member
    return {
      id: file.id,
      name: file.name,
      location: this.index.location(file),
      logical: file.size.toString(),
      allocated: member.alias ? null : (file.allocated?.toString() ?? null),
      modifiedAt: file.modifiedAt,
      hardLinkAlias: member.alias,
      image: member.photo?.image ?? null,
      distance: member.distance,
      byteEqual: member.byteEqual
    }
  }

  query(q: DuplicateQuery): DuplicateResult {
    const search = q.text.trim().toLowerCase()
    const all = this.groups.flatMap((group) => {
      const members = this.members(group, q.threshold)
      if (
        members.length < 2 ||
        (q.hideEmpty && this.mode === 'exact' && !members[0].file.size) ||
        (search && !members.some(({ file }) => file.name.toLowerCase().includes(search)))
      )
        return []
      return [this.summary(group, members)]
    })
    all.sort((a, b) => {
      if (q.sort === 'copies') return b.copies - a.copies || a.id - b.id
      if (q.sort === 'distance') return (a.bestDistance ?? 0) - (b.bestDistance ?? 0) || a.id - b.id
      if (q.sort === 'name') return lex(a.label, b.label) || a.id - b.id
      const x = BigInt(a.redundant ?? a.logical),
        y = BigInt(b.redundant ?? b.logical)
      return x === y ? a.id - b.id : x > y ? -1 : 1
    })
    const selected = q.group === null ? null : (all.find((group) => group.id === q.group) ?? null)
    const page = Math.min(
      q.page,
      Math.max(0, Math.ceil(all.length / DUPLICATE_LIMITS.groupPage) - 1)
    )
    const first = page * DUPLICATE_LIMITS.groupPage
    const members = selected ? this.members(this.groups[selected.id], q.threshold) : []
    const memberPage = Math.min(
      q.memberPage,
      Math.max(0, Math.ceil(members.length / DUPLICATE_LIMITS.memberPage) - 1)
    )
    const offset = memberPage * DUPLICATE_LIMITS.memberPage
    return {
      groups: all.slice(first, first + DUPLICATE_LIMITS.groupPage),
      matches: all.length,
      page,
      selected,
      referenceFile: members.length ? this.describe(members[0]) : null,
      memberPage,
      members: members
        .slice(offset, offset + DUPLICATE_LIMITS.memberPage)
        .map((row) => this.describe(row))
    }
  }

  async preview(groupId: number, entryId: number): Promise<DuplicatePreview | null> {
    if (this.mode !== 'photos') return null
    const group = this.groups[groupId]
    const member = group?.members.find((m) => m.file.id === entryId)
    if (!member) return null
    // Preview work has its own pair budget; the analysis deadline no longer applies.
    const reads = new ContentReads(
      this.index,
      () => {
        if (this.cancelled()) throw new AnalysisStop()
      },
      2 * DUPLICATE_LIMITS.photoBytes
    )
    const raster = async (target: Member): Promise<string | null> => {
      const encoding = target.photo?.image.format
      if (!encoding) return null
      try {
        const data = await reads.loadPhoto(target.file)
        const decoded = await this.decode(data, encoding, true)
        return decoded && decoded !== 'unavailable' ? decoded.preview : null
      } catch {
        return null
      }
    }
    const reference = await raster(group.members[0])
    return {
      reference,
      member: entryId === group.members[0].file.id ? reference : await raster(member)
    }
  }
}
