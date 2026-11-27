import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { StorageMapEntry, StorageQuery } from '../src/shared/contracts/storageExplorer'
import { FULL_TURN, annularSector, radialStorage } from '../src/shared/utils/storageRadial'
import { StorageIndex } from '../src/main/storageExplorer/index'
import { nextWorkspaceItem } from '../src/renderer/src/components/layout/workspaceMenuKeys'

const node = (
  id: number | null,
  bytes: string,
  kind: StorageMapEntry['kind'] = 'file'
): StorageMapEntry => ({ id, bytes, kind, name: String(id), count: id === null ? 7 : 1 })
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-10)

test('radial map reserves exact angles for measured entries and the grouped remainder', () => {
  const result = radialStorage(
    [
      node(1, '60', 'directory'),
      node(2, '30'),
      node(null, '10', 'other'),
      node(3, '0'),
      node(4, 'unavailable')
    ],
    null
  )
  assert.deepEqual(
    result.inner.map(({ node }) => node.id),
    [1, 2, null]
  )
  close(result.inner[0].end, FULL_TURN * 0.6)
  close(result.inner[1].end - result.inner[1].start, FULL_TURN * 0.3)
  close(result.inner[2].end - result.inner[2].start, FULL_TURN * 0.1)
  assert.equal(result.inner[2].node.count, 7)
  assert.equal(annularSector(0, FULL_TURN, 60, 130).split('A').length, 5)
})

test('a selected folder branch partitions only its parent wedge and rejects mismatched totals', () => {
  const entries = [node(1, '60', 'directory'), node(2, '40', 'directory')]
  const ring = radialStorage(entries, {
    parent: 2,
    entries: [node(3, '30'), node(null, '10', 'other')]
  })
  close(ring.outer[0].start, FULL_TURN * 0.6)
  close(ring.outer[0].end, FULL_TURN * 0.9)
  close(ring.outer.at(-1)!.end, FULL_TURN)
  assert.equal(radialStorage(entries, { parent: 2, entries: [node(3, '30')] }).outer.length, 0)
})

test('radial detail survives selection of a direct descendant and excludes unknown allocations', () => {
  const index = new StorageIndex('/synthetic')
  const evidence = { category: 'images', evidence: 'fixture' } as const
  index.addDirectory(null, 'scope', evidence, null)
  const branch = index.addDirectory(0, 'branch', evidence, null)
  const child = index.size
  index.addFile(branch, 'known', evidence, null, 20n, 10n, false)
  index.addFile(branch, 'unknown', evidence, null, 20n, null, false)
  index.finish()
  const query: StorageQuery = {
    folder: 0,
    selected: branch,
    view: 'folder',
    basis: 'allocated',
    kind: 'all',
    category: null,
    text: '',
    sort: 'size',
    direction: 'desc',
    page: 0
  }
  const folder = index.query(query)!
  const file = index.query({ ...query, selected: child })!
  assert.equal(folder.mapFolder.allocatedUnknown, 1)
  assert.deepEqual(folder.mapBranch, file.mapBranch)
  assert.equal(file.selected?.item.id, child)
  assert.deepEqual(
    file.mapBranch?.entries.map(({ bytes }) => bytes),
    ['10']
  )
  assert.deepEqual(
    index.query({ ...query, basis: 'logical' })?.mapBranch?.entries.map(({ bytes }) => bytes),
    ['20', '20']
  )
})

test('workspace popup cycles and provides first and last keyboard shortcuts', () => {
  assert.equal(nextWorkspaceItem('ArrowDown', 2, 3), 0)
  assert.equal(nextWorkspaceItem('ArrowUp', 0, 3), 2)
  assert.equal(nextWorkspaceItem('ArrowUp', -1, 3), 2)
  assert.equal(nextWorkspaceItem('Home', 2, 3), 0)
  assert.equal(nextWorkspaceItem('End', 0, 3), 2)
  assert.equal(nextWorkspaceItem('Tab', 0, 3), null)
  assert.equal(nextWorkspaceItem('ArrowDown', 0, 0), null)
})
