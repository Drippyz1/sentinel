import assert from 'node:assert/strict'
import {
  link,
  lstat,
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  truncate,
  writeFile,
  chmod
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, type TestContext } from 'node:test'
import { STORAGE_LIMITS, type StorageQuery } from '../src/shared/contracts/storageExplorer'
import { StorageIndex } from '../src/main/storageExplorer/index'
import {
  INITIAL_STORAGE_NAV,
  stepStorageFolder,
  visitStorageFolder
} from '../src/shared/utils/storageNavigation'
import {
  isStorageQuery,
  isStorageSessionId,
  storageTreemap
} from '../src/shared/utils/storageExplorer'
import { classify } from '../src/main/storageExplorer/classify'
import { scanStorage } from '../src/main/storageExplorer/traverse'
import {
  authorizeStorageScope,
  containsPath,
  parseLinuxMounts,
  parseMacMounts,
  type AuthorizedScope
} from '../src/main/storageExplorer/scope'

const query: StorageQuery = {
  folder: 0,
  selected: null,
  basis: 'logical',
  view: 'folder',
  kind: 'all',
  category: null,
  text: '',
  sort: 'size',
  direction: 'desc',
  page: 0
}
const actualPosix = process.platform === 'darwin' || process.platform === 'linux'

test('storage navigation branches after Back, does not duplicate folders, and bounds history', () => {
  const a = visitStorageFolder(INITIAL_STORAGE_NAV, 1)
  const b = visitStorageFolder(a, 2)
  assert.deepEqual(stepStorageFolder(b, -1), { folders: [0, 1, 2], index: 1 })
  assert.deepEqual(visitStorageFolder(stepStorageFolder(b, -1), 4), {
    folders: [0, 1, 4],
    index: 2
  })
  assert.equal(visitStorageFolder(a, 1), a)
  let nav = INITIAL_STORAGE_NAV
  for (let i = 1; i <= 100; i++) nav = visitStorageFolder(nav, i)
  assert.equal(nav.folders.length, 64)
  assert.equal(nav.folders[nav.index], 100)
  assert.equal(stepStorageFolder(nav, 1), nav)
})

test('storage uses immediate parent and whole scope denominators and follows search selection into the map', () => {
  const index = new StorageIndex('/Synthetic')
  const meta = { category: 'unknown', evidence: 'test' } as const
  index.addDirectory(null, 'Synthetic', meta, null)
  const a = index.addDirectory(0, 'A', meta, null)
  index.addFile(a, 'leaf.dat', meta, null, 250n, null, false)
  index.addFile(a, 'peer.dat', meta, null, 250n, null, false)
  const b = index.addDirectory(0, 'B', meta, null)
  index.addFile(b, 'other.dat', meta, null, 500n, 1024n, false)
  index.markIncomplete(a, 1)
  index.finish()
  const search = index.query({ ...query, view: 'search', text: 'leaf', selected: a + 1 })!
  assert.equal(search.rows[0].parentShare, 50)
  assert.equal(search.rows[0].scopeShare, 25)
  assert.equal(search.selected?.parentName, 'A')
  assert.equal(search.mapFolder.id, a)
  assert.equal(search.mapFolder.skipped, 1)
  assert.equal(search.folder.skipped, 1)
  assert.equal(
    search.map.some(({ id }) => id === search.selected?.item.id),
    true
  )
  const allocation = index.query({
    ...query,
    view: 'search',
    text: 'leaf',
    basis: 'allocated',
    selected: a + 1
  })!
  assert.equal(allocation.rows[0].allocated, null)
  assert.equal(allocation.rows[0].scopeShare, null)
  assert.equal(allocation.rows[0].parentShare, null)
  const ranked = index.query({ ...query, view: 'recursive', kind: 'directory' })!
  assert.deepEqual(
    ranked.rows.map(({ name }) => name),
    ['A', 'B']
  )
})

async function fixture(t: TestContext): Promise<AuthorizedScope> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'sentinel-storage-test-')))
  t.after(() => rm(root, { recursive: true, force: true }))
  const stats = await lstat(root, { bigint: true })
  return {
    display: { name: 'Fixture', location: root },
    dev: stats.dev,
    ino: stats.ino,
    boundaries: []
  }
}

const scan = (scope: AuthorizedScope) =>
  scanStorage(scope, { cancelled: () => false, progress: () => {} })

test(
  'storage exact totals include nested, zero-byte, empty, and Unicode entries without following links',
  { skip: !actualPosix },
  async (t) => {
    const scope = await fixture(t)
    const root = scope.display.location
    await mkdir(join(root, 'Media'))
    await mkdir(join(root, 'Empty'))
    await writeFile(join(root, 'Media', 'résumé 📄.pdf'), 'abcd')
    await writeFile(join(root, 'zero'), '')
    await symlink(root, join(root, 'Media', 'cycle'))
    await symlink('/dev/null', join(root, 'outside'))
    const { index, reading } = await scan(scope)
    assert.equal(reading.state, 'partial')
    assert.equal(reading.skipped.links, 2)
    assert.equal(reading.totals?.logical, '4')
    assert.equal(reading.totals?.files, 2)
    assert.equal(reading.totals?.directories, 2)
    const top = index.query(query)!
    assert.equal(top.rows.length, 3)
    assert.equal(top.map[0].bytes, '4')
    assert.equal(top.rows.find(({ name }) => name === 'Empty')?.logical, '0')
    const folders = index.query({ ...query, view: 'largest', kind: 'directory' })!
    assert.deepEqual(
      folders.rows.map(({ name }) => name),
      ['Media', 'Empty']
    )
    const { rows } = index.query({ ...query, view: 'search', text: 'résumé' })!
    assert.equal(rows[0].category, 'documents')
    const detail = index.query({ ...query, selected: rows[0].id })!.selected!
    assert.equal(detail.location, join(root, 'Media', 'résumé 📄.pdf'))
    assert.equal(index.query({ ...query, folder: rows[0].id }), null)
    assert.equal(index.query({ ...query, selected: 99 }), null)
  }
)

test(
  'storage recognizes hard links once for allocation and preserves sparse logical size',
  { skip: !actualPosix },
  async (t) => {
    const scope = await fixture(t)
    const root = scope.display.location
    const sparse = join(root, 'sparse.bin')
    await writeFile(sparse, '')
    await truncate(sparse, 8 * 1024 * 1024)
    await mkdir(join(root, 'Nested'))
    await link(sparse, join(root, 'Nested', 'alias.pdf'))
    const stats = await lstat(sparse, { bigint: true })
    const { index, reading } = await scan(scope)
    assert.equal(reading.state, 'complete')
    assert.equal(reading.totals?.logical, (stats.size * 2n).toString())
    assert.equal(reading.totals?.uniqueLogical, stats.size.toString())
    assert.equal(reading.totals?.allocated, (stats.blocks * 512n).toString())
    assert.equal(reading.totals?.hardLinkAliases, 1)
    const all = index.query({ ...query, view: 'largest', kind: 'file' })!
    assert.equal(all.rows.length, 2)
    assert.equal(
      all.rows.reduce((sum, row) => sum + BigInt(row.allocated ?? 0), 0n),
      stats.blocks * 512n
    )
    assert.equal(
      all.categories.reduce((sum, row) => sum + BigInt(row.totals.uniqueLogical), 0n),
      stats.size
    )
  }
)

test(
  'storage reports observed permission failures, depth limits and known mount boundaries',
  { skip: !actualPosix },
  async (t) => {
    const scope = await fixture(t)
    const root = scope.display.location
    const excluded = join(root, 'local-mount-fixture')
    await mkdir(excluded)
    await writeFile(join(excluded, 'not-indexed'), 'ignore')
    scope.boundaries = [excluded]
    const denied = join(root, 'denied')
    await mkdir(denied)
    await writeFile(join(denied, 'outside-coverage'), 'unknown')
    await chmod(denied, 0)
    let deep = root
    for (let i = 0; i < STORAGE_LIMITS.depth + 4; i++) {
      deep = join(deep, 'd')
      await mkdir(deep)
    }
    try {
      const { reading } = await scan(scope)
      assert.equal(reading.state, 'partial')
      assert.equal(reading.skipped.boundary, 1)
      assert.equal(reading.skipped.depth, 1)
      assert.equal(reading.peakOpenDirectories, STORAGE_LIMITS.depth)
      if (process.getuid?.() === 0)
        t.diagnostic('Permission-denial assertion skipped: container runs as root.')
      else assert.equal(reading.skipped.permission, 1)
    } finally {
      await chmod(denied, 0o700)
    }
  }
)

test(
  'storage honors the index/page limits and cancellation and can rescan independently',
  { skip: !actualPosix },
  async (t) => {
    const scope = await fixture(t)
    for (let i = 0; i < 220; i++)
      await writeFile(join(scope.display.location, `test-${i}.txt`), 'x')
    const limited = await scanStorage(scope, {
      cancelled: () => false,
      progress: () => {},
      maxEntries: 60
    })
    assert.equal(limited.reading.state, 'partial')
    assert.equal(limited.reading.indexed, 60)
    assert.equal(limited.reading.skipped.entryLimit, 1)
    let cancel = false
    const cancelled = await scanStorage(scope, {
      cancelled: () => cancel,
      progress: ({ state }) => {
        if (state === 'scanning') cancel = true
      }
    })
    assert.equal(cancelled.reading.state, 'cancelled')
    assert.ok(cancelled.reading.processed < 220)
    const { index, reading } = await scan(scope)
    assert.equal(reading.state, 'complete')
    const result = index.query({ ...query, view: 'search', text: 'test-', page: 999 })!
    assert.equal(result.matches, 220)
    assert.equal(result.page, 4)
    assert.equal(result.rows.length, 20)
    assert.equal(result.map.length, 20)
    assert.equal(
      result.map.reduce((sum, node) => sum + BigInt(node.bytes), 0n),
      220n
    )
    assert.equal(result.map.find(({ id }) => id === null)?.count, 201)
  }
)

test(
  'storage authorization rejects symlink roots and the worker refuses replacement of a previously selected scope',
  { skip: !actualPosix },
  async (t) => {
    const scope = await fixture(t)
    const root = scope.display.location
    const folder = join(root, 'foo')
    await mkdir(folder)
    const selected = await authorizeStorageScope(folder)
    assert.ok(selected)
    const outside = join(root, 'other')
    await mkdir(outside)
    await rm(folder, { recursive: true })
    await symlink(outside, folder)
    assert.equal(await authorizeStorageScope(folder), null)
    await mkdir(join(outside, 'nested'))
    assert.equal(await authorizeStorageScope(join(folder, 'nested')), null)
    const { reading } = await scan(selected)
    assert.equal(reading.state, 'failed')
    assert.equal(reading.failure, 'scope-changed')
    assert.equal(reading.totals, null)
  }
)

test(
  'storage reports a selected directory disappearing before the worker opens it',
  { skip: !actualPosix },
  async (t) => {
    const scope = await fixture(t)
    await rm(scope.display.location, { recursive: true })
    const { reading } = await scan(scope)
    assert.equal(reading.state, 'failed')
    assert.equal(reading.skipped.vanished, 1)
    assert.equal(reading.totals, null)
  }
)

test(
  'storage recognizes an ordinary Windows junction without traversing its target',
  { skip: process.platform !== 'win32' },
  async (t) => {
    const scope = await fixture(t)
    const root = scope.display.location
    const outside = join(root, 'other')
    await mkdir(outside)
    await writeFile(join(outside, 'target.bin'), '123456')
    await symlink(outside, join(root, 'junction'), 'junction')
    const { reading } = await scan(scope)
    assert.equal(reading.skipped.links, 1)
    assert.equal(reading.totals?.logical, '6')
    assert.equal(reading.totals?.allocated, null)
  }
)

test('storage mount and classification rules are conservative and do not inspect contents', () => {
  assert.deepEqual(
    parseLinuxMounts(
      '24 1 8:1 / /run/user/My\\040Disk rw - ext4 source rw\n25 1 0:1 / /net rw - nfs server rw'
    ),
    [
      { path: '/run/user/My Disk', local: true },
      { path: '/net', local: false }
    ]
  )
  assert.deepEqual(
    parseMacMounts(
      '/dev/one on /Volumes/My Disk (apfs, local, read-only)\nnode on /Shares (smbfs, mounted by tester)'
    ),
    [
      { path: '/Volumes/My Disk', local: true },
      { path: '/Shares', local: false }
    ]
  )
  assert.ok(containsPath(join(tmpdir(), 'one'), join(tmpdir(), 'one', 'child')))
  assert.ok(!containsPath(join(tmpdir(), 'one'), join(tmpdir(), 'one-other')))
  assert.ok(containsPath(join(tmpdir(), 'Share'), join(tmpdir(), 'share', 'folder'), true))
  assert.equal(
    classify('/folder/Library/Caches/PDF.pdf', 'PDF.pdf', false, 'darwin').category,
    'caches'
  )
  assert.equal(
    classify('/folder/Audio.app/clip.mp3', 'clip.mp3', false, 'darwin').category,
    'applications'
  )
  assert.equal(classify('/folder/.git/example', 'example', false).category, 'development')
  assert.equal(classify('/example/System/file', 'file', false, 'darwin').category, 'unknown')
  assert.equal(
    classify('/example/extension.constructor', 'extension.constructor', false).category,
    'other'
  )
})

test('storage rejects path-shaped IPC data and malformed operation parameters', () => {
  assert.ok(isStorageQuery(query))
  for (const invalid of [
    { ...query, path: '/' },
    { ...query, folder: '/tmp' },
    { ...query, selected: -1 },
    { ...query, text: 'x'.repeat(161) },
    { ...query, category: 'anything' },
    { ...query, view: 'largest', kind: 'all' },
    { ...query, page: Infinity },
    { ...query, limit: 1000 },
    { ...query, sort: 'arbitrary' }
  ])
    assert.equal(isStorageQuery(invalid), false)
  assert.ok(isStorageSessionId('e81d3349-e8ad-4edf-8c97-d6014115d28d'))
  assert.equal(isStorageSessionId('/tmp/not-an-id'), false)
})

test('storage map preserves area ratios and does not draw invalid or zero observations', () => {
  const rects = storageTreemap(['600', '300', '100', 'NaN', '0', '-20'], 500, 240)
  assert.equal(rects.length, 3)
  for (const { index, width, height } of rects) {
    assert.ok(Math.abs((width * height) / (500 * 240) - [0.6, 0.3, 0.1][index]) < 1e-10)
  }
  for (const a of rects)
    for (const b of rects) {
      if (a.index === b.index) continue
      const overlap =
        Math.min(a.x + a.width, b.x + b.width) > Math.max(a.x, b.x) + 1e-8 &&
        Math.min(a.y + a.height, b.y + b.height) > Math.max(a.y, b.y) + 1e-8
      assert.ok(!overlap)
    }
})

test('a wide map groups only positive known bytes and keeps stable tie ordering', () => {
  const index = new StorageIndex('/Synthetic')
  const meta = { category: 'unknown', evidence: 'test' } as const
  index.addDirectory(null, 'Synthetic', meta, null)
  for (let id = 1; id <= 300; id++) {
    const bytes = id <= 2 ? 50_000n : id === 300 ? null : 4n
    index.addFile(0, `item-${id}`, meta, null, 100n, bytes, false)
  }
  index.finish()
  const result = index.query({ ...query, basis: 'allocated' })!
  assert.deepEqual(
    result.map.map(({ id }) => id),
    [1, 2, null]
  )
  assert.equal(result.map[2].count, 297)
  assert.equal(result.map[2].bytes, '1188')
  assert.equal(result.folder.allocatedUnknown, 1)
})
