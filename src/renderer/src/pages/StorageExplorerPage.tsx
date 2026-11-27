import { useMemo, useRef, useState, type ReactNode } from 'react'
import {
  STORAGE_CATEGORIES,
  STORAGE_LIMITS,
  type StorageBasis,
  type StorageQuery,
  type StorageSnapshot,
  type StorageSort
} from '../../../shared/contracts/storageExplorer'
import {
  INITIAL_STORAGE_NAV,
  stepStorageFolder,
  visitStorageFolder
} from '../../../shared/utils/storageNavigation'
import {
  CATEGORY_LABELS,
  COLUMNS,
  DEFAULT_COLUMNS,
  ISSUE_LABELS,
  displayBytes,
  selectedBytes
} from '../components/storage/presentation'
import { StorageMap } from '../components/storage/StorageMap'
import { StorageRadial } from '../components/storage/StorageRadial'
import {
  StorageCategories,
  StorageColumns,
  StorageDetails,
  StorageGlyph,
  StorageTable
} from '../components/storage/StorageResults'
import { useStorageResult, useStorageSession } from '../components/storage/useStorageExplorer'
import { useWorkspaceActivity } from '../components/layout/useWorkspaceActivity'
import '../assets/storageExplorer.css'

const DEFAULT_QUERY: StorageQuery = {
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
const STATES: Record<StorageSnapshot['state'], string> = {
  ready: 'Ready',
  scanning: 'Scanning',
  cancelling: 'Cancelling',
  cancelled: 'Cancelled · partial data',
  complete: 'Complete',
  partial: 'Partial results',
  failed: 'Scan unavailable'
}
const COLUMN_KEY = 'sentinel.storage.columns.v1'

function readColumns(): StorageSort[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(COLUMN_KEY) ?? 'null')
    if (Array.isArray(saved) && saved.length <= COLUMNS.length)
      return COLUMNS.filter(({ id }) => id === 'name' || saved.includes(id)).map(({ id }) => id)
  } catch {
    /* Unavailable browser preferences do not affect scan state. */
  }
  return DEFAULT_COLUMNS
}

function elapsed(ms: number): string {
  return ms < 1000
    ? `${ms} ms`
    : ms < 60_000
      ? `${(ms / 1000).toFixed(1)} s`
      : `${Math.floor(ms / 60_000)}m ${Math.floor(ms / 1000) % 60}s`
}

function AccountingHelp(): ReactNode {
  return (
    <details className="storage-accounting">
      <summary>How space is counted</summary>
      <dl>
        <dt>Logical size</dt>
        <dd>Apparent file length. A directory aggregate sums indexed descendants.</dd>
        <dt>Allocated estimate</dt>
        <dd>
          Filesystem-reported blocks. Sparse files can allocate less. APFS clones and copy-on-write
          files may share blocks.
        </dd>
        <dt>Hard link</dt>
        <dd>
          Multiple names for the same underlying file. Unique logical size and known blocks are
          attributed once where identity is reliable.
        </dd>
        <dt>Immediately free</dt>
        <dd>
          Available filesystem blocks, separate from indexed sizes. macOS Dashboard Available may
          also include estimated purgeable space.
        </dd>
        <dt>Unaccounted storage</dt>
        <dd>
          Can include snapshots, filesystem metadata, inaccessible paths, filesystem boundaries or
          files outside this scope. It is not a cleanup estimate.
        </dd>
      </dl>
    </details>
  )
}

function Status({
  scan,
  expired,
  action
}: {
  scan: StorageSnapshot | null
  expired: boolean
  action: string | null
}) {
  const skips = scan ? Object.entries(scan.skipped).filter(([, count]) => count) : []
  const skipCount = skips.reduce((n, [, count]) => n + count, 0)
  const totals = scan?.totals
  return (
    <footer className="storage-status">
      <span className="storage-state" data-state={scan?.state} role="status">
        {action
          ? `${action}…`
          : scan
            ? STATES[scan.state]
            : expired
              ? 'Session expired'
              : 'No scan selected'}
      </span>
      {scan && scan.state !== 'ready' && (
        <>
          <span>
            {scan.processed.toLocaleString()} inspected · {scan.indexed.toLocaleString()} indexed
          </span>
          <span>{elapsed(scan.elapsedMs)}</span>
          {scan.completedAt !== null && (
            <time
              title={new Date(scan.completedAt).toLocaleString()}
              dateTime={new Date(scan.completedAt).toISOString()}
            >
              Ended{' '}
              {new Date(scan.completedAt).toLocaleTimeString(undefined, {
                hour: 'numeric',
                minute: '2-digit'
              })}
            </time>
          )}
        </>
      )}
      {!!skips.length && (
        <details className="storage-coverage">
          <summary>
            {skipCount.toLocaleString()} {skipCount === 1 ? 'skip / limit' : 'skips / limits'}
          </summary>
          <ul>
            {skips.map(([issue, count]) => (
              <li key={issue}>
                {ISSUE_LABELS[issue as keyof typeof ISSUE_LABELS]}: {count.toLocaleString()}
              </li>
            ))}
          </ul>
        </details>
      )}
      {totals && totals.allocatedUnknown > 0 && (
        <span title="Unknown file allocations are not included in the estimate">
          {totals.allocatedUnknown.toLocaleString()} allocations unavailable
        </span>
      )}
    </footer>
  )
}

function Workspace({
  scan,
  controls,
  action
}: {
  scan: StorageSnapshot
  controls: ReactNode
  action: string | null
}) {
  const [nav, setNav] = useState(INITIAL_STORAGE_NAV)
  const [filter, setFilter] = useState(DEFAULT_QUERY)
  const [columns, setColumns] = useState(readColumns)
  const [mode, setMode] = useState<'browse' | 'search' | 'ranked' | 'categories'>('browse')
  const [mapSize, setMapSize] = useState('balanced')
  const [mapKind, setMapKind] = useState<'radial' | 'tree'>('radial')
  const [inspector, showInspector] = useState(true)
  const [compactPane, setCompactPane] = useState<'map' | 'inspector'>('map')
  const browseTitle = useRef<HTMLHeadingElement>(null)
  const query = useMemo(() => ({ ...filter, folder: nav.folders[nav.index] }), [filter, nav])
  const { result, displayQuery, pending, failed } = useStorageResult(scan.id, query)
  const activeSelection =
    result?.selected?.item.id === query.selected ? (result?.selected ?? null) : null
  const update = (patch: Partial<StorageQuery>) =>
    setFilter((current) => ({ ...current, ...patch }))
  const open = (folder: number) => {
    setNav((current) => visitStorageFolder(current, folder))
    setMode('browse')
    setFilter((current) => ({ ...DEFAULT_QUERY, basis: current.basis }))
    browseTitle.current?.focus({ preventScroll: true })
  }
  const move = (step: -1 | 1) => {
    setNav((current) => stepStorageFolder(current, step))
    setMode('browse')
    setFilter((current) => ({ ...DEFAULT_QUERY, basis: current.basis }))
    browseTitle.current?.focus({ preventScroll: true })
  }
  const select = (selected: number) => {
    update({ selected })
    setCompactPane('inspector')
    showInspector(true)
  }
  const changeColumns = (value: StorageSort[]) => {
    setColumns(value)
    try {
      localStorage.setItem(COLUMN_KEY, JSON.stringify(value))
    } catch {
      /* Presentation can remain session-only. */
    }
  }
  const changeView = (view: typeof mode) => {
    setMode(view)
    update({
      view: view === 'ranked' ? 'largest' : view === 'browse' ? 'folder' : 'search',
      kind: view === 'ranked' ? 'file' : 'all',
      text: '',
      category: null,
      page: 0,
      sort: 'size',
      direction: 'desc'
    })
    if (view === 'categories') {
      setCompactPane('inspector')
      showInspector(true)
    }
  }
  const category = (value: StorageQuery['category']) => {
    setMode('categories')
    update({ category: value, view: 'search', kind: 'all', text: '', page: 0 })
  }
  const totals = scan.totals!
  const mapFolder = result?.mapFolder
  const inMap = Boolean(
    query.selected !== null &&
    (result?.map.some(({ id }) => id === query.selected) ||
      (mapKind === 'radial' && result?.mapBranch?.entries.some(({ id }) => id === query.selected)))
  )
  return (
    <>
      <header className="storage-toolbar">
        <h2 className="sr-only">Storage Explorer</h2>
        <div className="storage-actions">{controls}</div>
        <label className="storage-basis">
          Size basis
          <select
            value={query.basis}
            onChange={(event) => update({ basis: event.target.value as StorageBasis, page: 0 })}
          >
            <option value="logical">Logical</option>
            <option value="allocated">Allocated estimate</option>
          </select>
        </label>
        <button
          className="storage-icon-button storage-inspector-toggle"
          title="Toggle inspector"
          aria-label="Toggle inspector"
          aria-pressed={inspector}
          type="button"
          onClick={() => showInspector(!inspector)}
        >
          <StorageGlyph icon="inspector" />
        </button>
      </header>
      <div className="storage-location-bar">
        <div className="storage-actions" role="group" aria-label="Folder navigation">
          <button
            className="storage-icon-button"
            title="Back"
            aria-label="Back"
            type="button"
            disabled={!nav.index}
            onClick={() => move(-1)}
          >
            <StorageGlyph icon="back" />
          </button>
          <button
            className="storage-icon-button"
            title="Forward"
            aria-label="Forward"
            type="button"
            disabled={nav.index === nav.folders.length - 1}
            onClick={() => move(1)}
          >
            <StorageGlyph icon="forward" />
          </button>
          <button
            className="storage-icon-button"
            title="Parent folder"
            aria-label="Parent folder"
            type="button"
            disabled={result?.folder.parent == null || result.folder.id !== query.folder}
            onClick={() => open(result!.folder.parent!)}
          >
            <StorageGlyph icon="up" />
          </button>
        </div>
        <nav className="storage-crumbs" aria-label="Indexed path" title={scan.scope.location}>
          {(result?.breadcrumbs ?? [{ id: 0, name: scan.scope.name }]).map(
            ({ id, name }, index) => (
              <span key={id}>
                {index > 0 && <span aria-hidden="true">/</span>}
                <button
                  type="button"
                  className="storage-link"
                  title={name}
                  aria-current={id === query.folder ? 'location' : undefined}
                  onClick={() => open(id)}
                >
                  <bdi>{name}</bdi>
                </button>
              </span>
            )
          )}
        </nav>
        <label className="storage-search">
          <StorageGlyph icon="search" />
          <span className="sr-only">Search indexed names</span>
          <input
            type="search"
            placeholder="Search indexed names"
            maxLength={STORAGE_LIMITS.queryLength}
            value={query.text}
            onChange={(event) => {
              setMode('search')
              update({
                view: 'search',
                kind: 'all',
                category: null,
                text: event.target.value,
                page: 0
              })
            }}
          />
        </label>
      </div>
      <div className="storage-scan-strip">
        <span title={scan.scope.location}>
          <strong>Indexed scope</strong>
        </span>
        <span>
          {totals.files.toLocaleString()} files · {totals.directories.toLocaleString()} folders
        </span>
        <span title="Logical apparent size">
          Logical <strong>{displayBytes(totals.logical)}</strong>
        </span>
        <span title="Filesystem-reported allocation; known allocations only">
          Allocated <strong>{displayBytes(totals.allocated)}</strong>
          {totals.allocatedUnknown > 0 && totals.allocated !== null ? ' + unknown' : ''}
        </span>
        {scan.volume && (
          <span
            className="storage-volume"
            title={`Filesystem available blocks out of ${displayBytes(scan.volume.total)} total capacity; not a scan measurement`}
          >
            Volume free <strong>{displayBytes(scan.volume.available)}</strong>
          </span>
        )}
      </div>
      <div
        className="storage-body"
        data-visualization={mapKind}
        data-map-size={mapSize}
        data-inspector={inspector}
        data-compact-pane={compactPane}
      >
        <section className="storage-browser" aria-label="Directory browser">
          <header className="storage-pane-head">
            <h3 ref={browseTitle} tabIndex={-1}>
              Entries
            </h3>
            <div className="storage-views" role="group" aria-label="Result view">
              {(
                [
                  ['browse', 'Folder'],
                  ['search', 'Search'],
                  ['ranked', 'Largest'],
                  ['categories', 'Categories']
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={mode === id}
                  onClick={() => changeView(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <StorageColumns columns={columns} change={changeColumns} />
          </header>
          {(mode === 'ranked' || mode === 'categories' || mode === 'search') && (
            <div className="storage-filter-bar">
              {mode === 'ranked' ? (
                <>
                  <label>
                    <span className="sr-only">Ranking</span>
                    <select
                      value={query.view === 'recursive' ? 'recursive' : query.kind}
                      onChange={(event) =>
                        update({
                          view: event.target.value === 'recursive' ? 'recursive' : 'largest',
                          kind: event.target.value === 'file' ? 'file' : 'directory',
                          sort: 'size',
                          direction: 'desc',
                          page: 0
                        })
                      }
                    >
                      <option value="file">Files in subtree</option>
                      <option value="directory">Immediate child folders</option>
                      <option value="recursive">Recursive folder aggregates</option>
                    </select>
                  </label>
                  <span className="storage-muted">
                    {query.view === 'recursive'
                      ? 'Parent and descendant aggregates overlap.'
                      : 'Ranked within the current folder.'}
                  </span>
                </>
              ) : mode === 'categories' ? (
                <label>
                  Category{' '}
                  <select
                    value={query.category ?? ''}
                    onChange={(event) =>
                      category((event.target.value || null) as StorageQuery['category'])
                    }
                  >
                    <option value="">All categories</option>
                    {STORAGE_CATEGORIES.map((id) => (
                      <option key={id} value={id}>
                        {CATEGORY_LABELS[id]}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label>
                  Type{' '}
                  <select
                    value={query.kind}
                    onChange={(event) =>
                      update({ kind: event.target.value as StorageQuery['kind'], page: 0 })
                    }
                  >
                    <option value="all">All</option>
                    <option value="directory">Folders</option>
                    <option value="file">Files</option>
                  </select>{' '}
                  <span className="storage-muted">Across the indexed scope</span>
                </label>
              )}
            </div>
          )}
          {failed ? (
            <p className="storage-empty" role="alert">
              Indexed results are unavailable. Choose a location or rescan.
            </p>
          ) : (
            <StorageTable
              result={result}
              query={displayQuery}
              pending={pending}
              columns={columns}
              selected={query.selected}
              update={update}
              open={open}
              select={select}
            />
          )}
        </section>
        <div className="storage-compact-panes" role="group" aria-label="Supporting panes">
          <button
            type="button"
            aria-pressed={compactPane === 'map'}
            onClick={() => setCompactPane('map')}
          >
            Map
          </button>
          <button
            type="button"
            aria-pressed={compactPane === 'inspector'}
            onClick={() => setCompactPane('inspector')}
          >
            Inspector
          </button>
        </div>
        <section className="storage-map-pane" aria-label="Storage map">
          <header className="storage-pane-head">
            <h3>Disk map</h3>
            <span className="storage-map-location" title={mapFolder?.name}>
              {mapFolder?.name ?? 'Folder'} ·{' '}
              {mapFolder ? displayBytes(selectedBytes(mapFolder, displayQuery.basis)) : '—'}
            </span>
          </header>
          <div className="storage-map-controls">
            <div role="group" className="storage-views" aria-label="Map visualization">
              <button
                type="button"
                aria-pressed={mapKind === 'radial'}
                onClick={() => setMapKind('radial')}
              >
                Radial
              </button>
              <button
                type="button"
                aria-pressed={mapKind === 'tree'}
                onClick={() => setMapKind('tree')}
              >
                Treemap
              </button>
            </div>
            <label className="storage-map-size">
              <span className="sr-only">Map pane size</span>
              <select value={mapSize} onChange={(event) => setMapSize(event.target.value)}>
                <option value="compact">Compact map</option>
                <option value="balanced">Balanced map</option>
                <option value="expanded">Expanded map</option>
              </select>
            </label>
          </div>
          {mapKind === 'radial' ? (
            <StorageRadial
              entries={result?.map ?? []}
              branch={result?.mapBranch ?? null}
              folder={mapFolder?.name ?? 'Folder'}
              basis={displayQuery.basis}
              selected={query.selected}
              select={select}
              open={open}
            />
          ) : (
            <StorageMap
              entries={result?.map ?? []}
              selected={query.selected}
              select={select}
              open={open}
            />
          )}
          <p className="storage-map-note">
            {activeSelection && !inMap ? (
              'Selected entry has no individual tile (grouped, zero, or unavailable).'
            ) : displayQuery.basis === 'allocated' && mapFolder?.allocatedUnknown ? (
              `Known allocation only · ${mapFolder.allocatedUnknown.toLocaleString()} files unknown`
            ) : mapKind === 'radial' ? (
              'Sector angle represents size. Select a folder to preview its children.'
            ) : (
              <>
                <span data-map-kind="directory">Folder</span>
                <span data-map-kind="file">File</span>
                <span data-map-kind="other">Other grouped entries</span>
              </>
            )}
          </p>
        </section>
        <aside className="storage-inspector" aria-label="Entry inspector">
          <header className="storage-pane-head">
            <h3>{mode === 'categories' ? 'Scope categories' : 'Inspector'}</h3>
            {activeSelection && (
              <button
                type="button"
                className="storage-button"
                onClick={() => update({ selected: null })}
              >
                Clear selection
              </button>
            )}
          </header>
          <div className="storage-inspector-content" tabIndex={0} aria-label="Inspector details">
            {activeSelection ? (
              <StorageDetails selection={activeSelection} basis={displayQuery.basis} open={open} />
            ) : (
              <>
                {mode !== 'categories' && (
                  <p className="storage-muted">Select an entry to inspect it.</p>
                )}
                <h4>Indexed file categories</h4>
                <p className="storage-muted">
                  {displayQuery.basis === 'logical'
                    ? 'Logical bytes across scope'
                    : 'Known allocated bytes across scope'}
                </p>
                <StorageCategories
                  categories={result?.categories ?? []}
                  basis={displayQuery.basis}
                  active={query.category}
                  select={category}
                />
                <AccountingHelp />
              </>
            )}
          </div>
        </aside>
      </div>
      <Status scan={scan} expired={false} action={action} />
    </>
  )
}

export function StorageExplorerPage() {
  const session = useStorageSession()
  const { snapshot, working, action } = session
  useWorkspaceActivity(
    working
      ? 'Storage scan active'
      : snapshot?.state === 'partial'
        ? 'Partial storage results'
        : null
  )
  const disabled = Boolean(action)
  const controls = (
    <>
      <button
        type="button"
        className="storage-button"
        disabled={disabled || working}
        onClick={() => void session.choose()}
      >
        Choose location
      </button>
      {snapshot && !working && (
        <>
          <button
            type="button"
            className="storage-button"
            data-primary
            disabled={disabled}
            onClick={() => void session.start(snapshot.id)}
          >
            {snapshot.state === 'ready' ? 'Start scan' : 'Rescan'}
          </button>
          <button
            type="button"
            className="storage-button"
            disabled={disabled}
            onClick={() => void session.drop(snapshot.id)}
          >
            Discard scan
          </button>
        </>
      )}
      {snapshot && working && (
        <button
          type="button"
          className="storage-button"
          disabled={disabled || snapshot.state === 'cancelling'}
          onClick={() => void session.cancel(snapshot.id)}
        >
          Cancel scan
        </button>
      )}
    </>
  )
  return (
    <section className="storage-workbench" aria-label="Storage workspace">
      {session.error && (
        <p className="storage-error" role="alert">
          {session.error}
        </p>
      )}
      {snapshot?.totals ? (
        <Workspace key={snapshot.id} scan={snapshot} controls={controls} action={action} />
      ) : (
        <>
          <header className="storage-toolbar">
            <h2>Storage Explorer</h2>
            <div className="storage-actions">{controls}</div>
          </header>
          <div className="storage-start">
            <h3>
              {snapshot?.scope.name ??
                (session.loaded ? 'Choose a folder or local volume' : 'Checking scan session…')}
            </h3>
            {snapshot && <code className="storage-path">{snapshot.scope.location}</code>}
            {working && (
              <>
                <progress aria-label="Scan in progress; total entries unknown" />
                <p>
                  {snapshot!.processed.toLocaleString()} inspected ·{' '}
                  {snapshot!.indexed.toLocaleString()} indexed
                </p>
              </>
            )}
            {snapshot?.state === 'cancelling' && (
              <p className="storage-muted">Waiting for the active filesystem operation.</p>
            )}
            {snapshot?.failure && (
              <p role="alert">
                {snapshot.failure === 'scope-changed'
                  ? 'The folder changed. Choose it again.'
                  : 'The selected location is unavailable.'}
              </p>
            )}
            {!working && !snapshot?.failure && (
              <p className="storage-muted">
                Read-only metadata scan. Symbolic links, other mounts, and recognized cloud
                locations are excluded.
              </p>
            )}
            {session.expired && (
              <p className="storage-muted">
                The inactive scan expired. Choose a location to start a new scan.
              </p>
            )}
          </div>
          <Status scan={snapshot} expired={session.expired} action={action} />
        </>
      )}
    </section>
  )
}
