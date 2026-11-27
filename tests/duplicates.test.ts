import assert from 'node:assert/strict'
import {
  chmod,
  link,
  lstat,
  mkdir,
  mkdtemp,
  realpath,
  rename,
  rm,
  symlink,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, type TestContext } from 'node:test'
import { DuplicateAnalysis } from '../src/main/duplicates/analysis'
import {
  AnalysisStop,
  ContentIndex,
  ContentReads,
  contentIssue
} from '../src/main/duplicates/content'
import { imageInfo, type DecodedPhoto } from '../src/main/duplicates/imageFormat'
import { hamming, photoDistance, photoSignature } from '../src/main/duplicates/similarity'
import { authorizeStorageScope } from '../src/main/storageExplorer/scope'
import { DUPLICATE_LIMITS, type DuplicateQuery } from '../src/shared/contracts/duplicates'
import { isDuplicateQuery } from '../src/shared/utils/duplicates'

const posix = process.platform === 'darwin' || process.platform === 'linux'
const defaults: DuplicateQuery = {
  text: '',
  sort: 'bytes',
  threshold: 10,
  page: 0,
  group: null,
  memberPage: 0,
  hideEmpty: true
}
async function fixture(t: TestContext): Promise<string> {
  const folder = await realpath(await mkdtemp(join(tmpdir(), 'sentinel-duplicates-')))
  t.after(() => rm(folder, { recursive: true, force: true }))
  return folder
}
async function exact(folder: string, cancelled = () => false): Promise<DuplicateAnalysis> {
  const scope = await authorizeStorageScope(folder)
  assert.ok(scope)
  return new DuplicateAnalysis(
    scope,
    'exact',
    cancelled,
    () => {},
    async () => null
  )
}
const readError = (error: unknown): boolean => contentIssue(error) === 'changed'

test(
  'exact analysis narrows by size, streams and compares bytes, and counts hard links once',
  { skip: !posix },
  async (t) => {
    const folder = await fixture(t)
    const blank = Buffer.alloc(0)
    const content = Buffer.alloc(DUPLICATE_LIMITS.chunk * 3 + 19, 126)
    const sameSize = Buffer.from(content)
    sameSize[sameSize.length - 1]++
    for (const [file, bytes] of [
      ['a-reference', content],
      ['b-copy', content],
      ['c-different', sameSize],
      ['d-unique', Buffer.from('unique')],
      ['e-empty', blank],
      ['f-empty', blank]
    ] as const)
      await writeFile(join(folder, file), bytes)
    await link(join(folder, 'a-reference'), join(folder, 'z-alias'))
    await link(join(folder, 'd-unique'), join(folder, 'z-unique-alias'))
    const analysis = await exact(folder)
    const result = await analysis.run()
    assert.equal(result.state, 'complete')
    assert.equal(result.eligible, 5)
    assert.equal(result.bytesRead, 5 * content.length)
    assert.equal(analysis.query(defaults).matches, 1)
    const { groups, members } = analysis.query({
      ...defaults,
      hideEmpty: false,
      group: analysis.query(defaults).groups[0].id
    })
    assert.equal(groups.length, 2)
    assert.deepEqual(
      [groups[0].paths, groups[0].copies, groups[0].logical, groups[0].redundant],
      [3, 2, String(content.length * 3), String(content.length)]
    )
    assert.equal(groups[1].redundant, '0')
    assert.ok(members.every((m) => m.byteEqual))
    assert.deepEqual(
      members.filter((m) => m.hardLinkAlias).map((m) => [m.name, m.allocated]),
      [['z-alias', null]]
    )
    assert.equal(analysis.query({ ...defaults, text: 'z-alias', page: 1 }).page, 0)
    assert.equal(analysis.query({ ...defaults, text: 'c-different' }).matches, 0)
  }
)

test(
  'content reads reject changed, missing and substituted paths and enforce read limits',
  { skip: !posix },
  async (t) => {
    const folder = await fixture(t)
    const dir = join(folder, 'data')
    await mkdir(dir)
    for (const name of ['changed', 'removed', 'symlink', 'stable'])
      await writeFile(join(dir, name), 'same length')
    const index = new ContentIndex(folder, () => {})
    index.observe(0, null, 'root', await lstat(folder, { bigint: true }))
    index.observe(1, 0, 'data', await lstat(dir, { bigint: true }))
    for (const [i, file] of ['changed', 'removed', 'symlink', 'stable'].entries())
      index.observe(i + 2, 1, file, await lstat(join(dir, file), { bigint: true }))
    await writeFile(join(dir, 'changed'), 'new content')
    await rm(join(dir, 'removed'))
    await rm(join(dir, 'symlink'))
    await symlink(join(dir, 'stable'), join(dir, 'symlink'))
    const reads = new ContentReads(index, () => {}, 10)
    for (const item of index.files.slice(0, 3)) await assert.rejects(reads.digest(item), readError)
    await assert.rejects(reads.digest(index.files[3]), /resourceLimit/)
    assert.equal(reads.bytes, 0)
    await rename(dir, join(folder, 'moved'))
    await symlink(join(folder, 'moved'), dir)
    await assert.rejects(reads.digest(index.files[3]), readError)
  }
)

test(
  'analysis excludes unreadable candidates and cancels during a streamed read',
  { skip: !posix || process.getuid?.() === 0 },
  async (t) => {
    const folder = await fixture(t)
    for (const name of ['blocked', 'readable']) await writeFile(join(folder, name), 'test')
    await chmod(join(folder, 'blocked'), 0)
    const analysis = await exact(folder)
    const result = await analysis.run()
    assert.equal(result.state, 'partial')
    assert.equal(result.skipped.unreadable, 1)
    assert.equal(result.groups, 0)
    const file = join(folder, 'large')
    await writeFile(file, Buffer.alloc(4 * DUPLICATE_LIMITS.chunk, 66))
    const index = new ContentIndex(folder, () => {})
    index.observe(0, null, 'root', await lstat(folder, { bigint: true }))
    index.observe(1, 0, 'large', await lstat(file, { bigint: true }))
    const reads: ContentReads = new ContentReads(index, () => {
      if (reads.bytes > 0) throw new AnalysisStop()
    })
    await assert.rejects(reads.digest(index.files[0]), AnalysisStop)
    assert.equal(reads.bytes, DUPLICATE_LIMITS.chunk)
    const cancelled = await exact(folder, () => true)
    assert.equal((await cancelled.run()).state, 'cancelled')
    assert.equal(cancelled.query(defaults).matches, 0)
  }
)

function pngHeader(width: number, height: number, ...additional: string[]): Buffer {
  const chunk = (type: string, value: Buffer = Buffer.alloc(0)): Buffer => {
    const data = Buffer.alloc(12 + value.length)
    data.writeUInt32BE(value.length)
    data.write(type, 4, 'ascii')
    value.copy(data, 8)
    return data
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', header),
    ...additional.map((name) => chunk(name)),
    chunk('IDAT', Buffer.from([0])),
    chunk('IEND')
  ])
}

test('image headers bound decoded pixels and reject APNG, malformed and disguised images', () => {
  const safe: Buffer[] = []
  assert.deepEqual(imageInfo(pngHeader(200, 100, 'iCCP', 'eXIf', 'zTXt'), 'png', safe), {
    width: 200,
    height: 100,
    format: 'png'
  })
  assert.equal(Buffer.concat(safe).includes('iCCP'), false)
  assert.throws(() => imageInfo(pngHeader(4096, 4096), 'png'), /imageLimit/)
  assert.throws(() => imageInfo(pngHeader(5000, 10), 'png'), /imageLimit/)
  assert.throws(() => imageInfo(pngHeader(10, 10, 'acTL'), 'png'), /unsupportedFormat/)
  assert.throws(() => imageInfo(pngHeader(10, 10).subarray(0, 45), 'png'), /invalidImage/)
  assert.throws(() => imageInfo(Buffer.from('<svg onload="fail"></svg>'), 'png'), /invalidImage/)
  assert.throws(
    () => imageInfo(Buffer.alloc(DUPLICATE_LIMITS.photoBytes + 1), 'jpeg'),
    /imageLimit/
  )
})

function sample(rows: number, width = 120, height = 80): DecodedPhoto {
  return {
    width,
    height,
    preview: null,
    sample: Array.from({ length: 72 }, (_, i) =>
      ((i % 9) % 2 === 0) !== Math.floor(i / 9) < rows ? 70 : 180
    )
  }
}

test('perceptual distance is bounded, skips flat images and does not imply equivalence', () => {
  const a = photoSignature(sample(0))!
  const b = photoSignature(sample(1))!
  const c = photoSignature(sample(2))!
  assert.equal(photoDistance(a, b), 8)
  assert.equal(photoDistance(b, c), 8)
  assert.equal(photoDistance(a, c), 16)
  assert.equal(hamming(0n, (1n << 64n) - 1n), 64)
  assert.equal(photoDistance(a, photoSignature(sample(0, 240, 160))!), 0)
  assert.equal(photoDistance(a, photoSignature(sample(0, 80, 120))!), null)
  assert.equal(photoSignature({ ...sample(0), sample: Array(72).fill(42) }), null)
  // Inherent dHash blind spot: differing lightness within the plausibility bound can have the same ordering.
  assert.equal(
    photoDistance(
      a,
      photoSignature({ ...sample(0), sample: sample(0).sample.map((v) => v + 30) })!
    ),
    0
  )
})

test(
  'photo groups compare to a fixed reference, threshold filters members, previews are scoped',
  { skip: !posix },
  async (t) => {
    const folder = await fixture(t)
    for (const [name, width] of [
      ['a.png', 120],
      ['b.png', 121],
      ['c.png', 122],
      ['d.png', 120]
    ] as const)
      await writeFile(join(folder, name), pngHeader(width, 80))
    await writeFile(join(folder, 'not-supported.heic'), 'fixture')
    const scope = await authorizeStorageScope(folder)
    assert.ok(scope)
    const analysis = new DuplicateAnalysis(
      scope,
      'photos',
      () => false,
      () => {},
      async (bytes, _format, preview) => {
        const width = bytes.readUInt32BE(16)
        return { ...sample(width - 120, width), preview: preview ? 'test-only' : null }
      }
    )
    const reading = await analysis.run()
    assert.equal(reading.state, 'partial')
    assert.equal(reading.skipped.unsupportedFormat, 1)
    const { groups, members } = analysis.query({ ...defaults, group: 0 })
    assert.equal(groups.length, 1)
    assert.deepEqual(
      members.map((m) => [m.name, m.distance, m.byteEqual]),
      [
        ['a.png', null, false],
        ['b.png', 8, false],
        ['d.png', 0, true]
      ]
    )
    assert.deepEqual(
      analysis.query({ ...defaults, group: 0, threshold: 7 }).members.map((m) => m.name),
      ['a.png', 'd.png']
    )
    assert.deepEqual(await analysis.preview(0, members[1].id), {
      reference: 'test-only',
      member: 'test-only'
    })
    assert.equal(await analysis.preview(100, members[1].id), null)
    assert.equal(await analysis.preview(0, DUPLICATE_LIMITS.entries - 1), null)
  }
)

test('duplicate query accepts only bounded typed keys and opaque numeric selections', () => {
  assert.equal(isDuplicateQuery(defaults), true)
  for (const value of [
    { ...defaults, path: '/private' },
    { ...defaults, group: '/private' },
    { ...defaults, sort: 'mtime' },
    { ...defaults, threshold: 11 },
    { ...defaults, page: Number.MAX_SAFE_INTEGER },
    { ...defaults, memberPage: 1200 },
    { ...defaults, text: 'a'.repeat(161) },
    { ...defaults, group: NaN },
    { ...defaults, hideEmpty: 0 },
    null
  ])
    assert.equal(isDuplicateQuery(value), false)
})
