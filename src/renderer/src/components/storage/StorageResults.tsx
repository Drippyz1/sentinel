import type { KeyboardEvent } from 'react'
import {
  STORAGE_LIMITS,
  type StorageItem,
  type StorageQuery,
  type StorageResult,
  type StorageSort
} from '../../../../shared/contracts/storageExplorer'
import { storageShare } from '../../../../shared/utils/storageExplorer'
import {
  CATEGORY_LABELS,
  COLUMNS,
  DEFAULT_COLUMNS,
  displayBytes,
  displayShare,
  selectedBytes
} from './presentation'

export function StorageGlyph({
  icon
}: {
  icon: 'file' | 'directory' | 'back' | 'forward' | 'up' | 'columns' | 'inspector' | 'search'
}) {
  const shapes = {
    file: 'M4.5 2.5h5l3 3v8h-8zM9.5 2.5v3h3',
    directory: 'M1.5 4h5l1.5 1.5h6.5v7h-13z',
    back: 'm9.5 3.5-4.5 4.5 4.5 4.5',
    forward: 'm6 3.5 4.5 4.5L6 12.5',
    up: 'M8 13V3m-4 4 4-4 4 4',
    columns: 'M2.5 3.5h11v9h-11zM6 3.5v9m4-9v9',
    inspector: 'M2.5 3.5h11v9h-11zM9.5 3.5v9',
    search: 'M11 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0zm-1.2 2.8 3.2 3.2'
  }
  return (
    <svg
      aria-hidden="true"
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.15"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={shapes[icon]} />
    </svg>
  )
}

export function StorageColumns({
  columns,
  change
}: {
  columns: StorageSort[]
  change: (value: StorageSort[]) => void
}) {
  return (
    <details className="storage-columns">
      <summary title="Choose table columns">
        <StorageGlyph icon="columns" /> Columns
      </summary>
      <div className="storage-columns-menu" aria-label="Visible columns">
        {COLUMNS.filter(({ id }) => id !== 'name').map(({ id, label, title }) => (
          <label key={id}>
            <input
              type="checkbox"
              checked={columns.includes(id)}
              onChange={() =>
                change(
                  columns.includes(id)
                    ? columns.filter((column) => column !== id)
                    : [...columns, id]
                )
              }
            />{' '}
            {title ?? label}
          </label>
        ))}
        <button className="storage-button" type="button" onClick={() => change(DEFAULT_COLUMNS)}>
          Restore defaults
        </button>
      </div>
    </details>
  )
}

function cell(row: StorageItem, id: StorageSort) {
  switch (id) {
    case 'logical':
      return <span title={`${row.logical} bytes`}>{displayBytes(row.logical)}</span>
    case 'allocated':
      return (
        <span
          title={
            row.allocatedUnknown
              ? `${row.allocatedUnknown} file allocations unavailable`
              : undefined
          }
        >
          {displayBytes(row.allocated)}
          {row.allocatedUnknown && row.allocated !== null ? ' + ?' : ''}
        </span>
      )
    case 'percentage':
      return (
        <span className="storage-percent">
          <i aria-hidden="true" style={{ width: `${row.parentShare ?? 0}%` }} />
          {displayShare(row.parentShare)}
        </span>
      )
    case 'scopeShare':
      return displayShare(row.scopeShare)
    case 'count':
      return row.kind === 'directory' ? row.files.toLocaleString() : '—'
    case 'directories':
      return row.kind === 'directory' ? row.directories.toLocaleString() : '—'
    case 'modified':
      return row.modifiedAt === null ? '—' : new Date(row.modifiedAt).toLocaleDateString()
    case 'category':
      return CATEGORY_LABELS[row.category]
    case 'kind':
      return row.kind === 'directory' ? 'Folder' : 'File'
    default:
      return null
  }
}

export function StorageTable({
  result,
  pending,
  query,
  columns,
  selected,
  update,
  open,
  select
}: {
  result: StorageResult | null
  pending: boolean
  query: StorageQuery
  columns: StorageSort[]
  selected: number | null
  update: (patch: Partial<StorageQuery>) => void
  open: (id: number) => void
  select: (id: number) => void
}) {
  const shown = COLUMNS.filter(({ id }) => columns.includes(id))
  const rows = result?.rows ?? []
  const active = rows.some((row) => row.id === selected) ? selected : rows[0]?.id
  const pages = Math.max(1, Math.ceil((result?.matches ?? 0) / STORAGE_LIMITS.pageSize))
  const sortKey = query.sort === 'size' ? query.basis : query.sort

  function keys(event: KeyboardEvent<HTMLButtonElement>, index: number, row: StorageItem): void {
    if (event.key === 'Enter' && row.kind === 'directory') {
      event.preventDefault()
      open(row.id)
      return
    }
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const target =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? rows.length - 1
          : Math.max(0, Math.min(rows.length - 1, index + (event.key === 'ArrowUp' ? -1 : 1)))
    const next = rows[target]
    event.currentTarget
      .closest('tbody')
      ?.querySelector<HTMLButtonElement>(`[data-entry="${next.id}"]`)
      ?.focus()
    select(next.id)
  }

  return (
    <>
      <div
        className="storage-table-scroll"
        aria-label="Indexed entries"
        role="region"
        tabIndex={0}
        aria-busy={pending}
      >
        <table className="storage-table">
          <colgroup>
            {shown.map(({ id, numeric }) => (
              <col key={id} data-column={id} data-numeric={numeric || undefined} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {shown.map(({ id, label, title, numeric }) => (
                <th
                  key={id}
                  scope="col"
                  data-number={numeric || undefined}
                  aria-sort={
                    sortKey === id
                      ? query.direction === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : undefined
                  }
                >
                  <button
                    type="button"
                    title={title ?? label}
                    onClick={() =>
                      update({
                        sort: id,
                        direction:
                          sortKey === id
                            ? query.direction === 'asc'
                              ? 'desc'
                              : 'asc'
                            : numeric
                              ? 'desc'
                              : 'asc',
                        page: 0
                      })
                    }
                  >
                    {label}
                    {sortKey === id && (
                      <span aria-hidden="true">{query.direction === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={row.id}
                data-selected={selected === row.id}
                onClick={() => select(row.id)}
                onDoubleClick={row.kind === 'directory' ? () => open(row.id) : undefined}
              >
                {shown.map(({ id, numeric }) => (
                  <td key={id} data-number={numeric || undefined}>
                    {id === 'name' ? (
                      <button
                        type="button"
                        className="storage-entry"
                        title={row.name}
                        data-entry={row.id}
                        tabIndex={active === row.id ? 0 : -1}
                        aria-pressed={selected === row.id}
                        aria-label={`${row.name}, ${row.kind === 'directory' ? 'folder' : 'file'}${row.incomplete ? ', partial' : ''}`}
                        onKeyDown={(event) => keys(event, index, row)}
                      >
                        <StorageGlyph icon={row.kind} />
                        <bdi>{row.name}</bdi>
                        {row.incomplete && <span aria-hidden="true">!</span>}
                      </button>
                    ) : (
                      cell(row, id)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <p className="storage-empty">
            {pending ? 'Loading indexed entries…' : 'No matching indexed entries.'}
          </p>
        )}
      </div>
      <div className="storage-pager">
        <span>
          {(result?.matches ?? 0).toLocaleString()} {result?.matches === 1 ? 'match' : 'matches'}{' '}
          <span className="storage-muted">· Indexed results sorted before paging</span>
        </span>
        <div className="storage-actions">
          <button
            className="storage-icon-button"
            type="button"
            aria-label="Previous page"
            title="Previous page"
            disabled={pending || !result?.page}
            onClick={() => update({ page: (result?.page ?? 0) - 1 })}
          >
            <StorageGlyph icon="back" />
          </button>
          <span>
            {(result?.page ?? 0) + 1} / {pages}
          </span>
          <button
            className="storage-icon-button"
            type="button"
            aria-label="Next page"
            title="Next page"
            disabled={pending || (result?.page ?? 0) + 1 >= pages}
            onClick={() => update({ page: (result?.page ?? 0) + 1 })}
          >
            <StorageGlyph icon="forward" />
          </button>
        </div>
      </div>
    </>
  )
}

export function StorageCategories({
  categories,
  basis,
  active,
  select
}: {
  categories: StorageResult['categories']
  basis: StorageQuery['basis']
  active: StorageQuery['category']
  select: (category: StorageQuery['category']) => void
}) {
  const files = categories
    .filter(({ totals }) => totals.files)
    .map((entry) => ({ ...entry, bytes: selectedBytes(entry.totals, basis) }))
    .sort((a, b) =>
      BigInt(a.bytes ?? 0) < BigInt(b.bytes ?? 0)
        ? 1
        : BigInt(a.bytes ?? 0) > BigInt(b.bytes ?? 0)
          ? -1
          : 0
    )
  const total = files.reduce((sum, entry) => sum + BigInt(entry.bytes ?? 0), 0n)
  if (!files.length) return <p className="storage-muted">No indexed files.</p>
  return (
    <ul className="storage-category-list">
      {files.map(({ category, bytes }) => (
        <li key={category}>
          <button
            type="button"
            aria-pressed={active === category}
            onClick={() => select(active === category ? null : category)}
          >
            <span>{CATEGORY_LABELS[category]}</span>
            <strong>{displayBytes(bytes)}</strong>
            <i
              aria-hidden="true"
              style={{ width: `${storageShare(BigInt(bytes ?? 0), total)}%` }}
            />
          </button>
        </li>
      ))}
    </ul>
  )
}

export function StorageDetails({
  selection,
  basis,
  open
}: {
  selection: NonNullable<StorageResult['selected']>
  basis: StorageQuery['basis']
  open: (id: number) => void
}) {
  const { item, location, parentName } = selection
  const extension =
    item.kind === 'file' && item.name.lastIndexOf('.') > 0 ? item.name.split('.').at(-1) : null
  return (
    <>
      <header className="storage-entry-title">
        <StorageGlyph icon={item.kind} />
        <h3>
          <bdi>{item.name}</bdi>
        </h3>
      </header>
      <code className="storage-path">
        <bdi>{location}</bdi>
      </code>
      <dl className="storage-properties">
        <dt>Entry type</dt>
        <dd>{item.kind === 'directory' ? 'Directory aggregate' : 'File'}</dd>
        {extension && (
          <>
            <dt>Extension</dt>
            <dd>{extension}</dd>
          </>
        )}
        <dt>Modified</dt>
        <dd>
          {item.modifiedAt === null ? 'Unavailable' : new Date(item.modifiedAt).toLocaleString()}
        </dd>
        <dt>Parent</dt>
        <dd>
          {item.parent === null ? (
            'Scan root'
          ) : (
            <button className="storage-link" type="button" onClick={() => open(item.parent!)}>
              {parentName}
            </button>
          )}
        </dd>
      </dl>
      <h4>Accounting</h4>
      <dl className="storage-properties">
        <dt>Logical size</dt>
        <dd title={`${item.logical} bytes`}>{displayBytes(item.logical)}</dd>
        <dt>Allocated estimate</dt>
        <dd title={item.allocated === null ? undefined : `${item.allocated} bytes`}>
          {displayBytes(item.allocated)}
          {item.allocatedUnknown !== 0 && item.allocated !== null ? ' + unknown' : ''}
        </dd>
        <dt>Unique logical</dt>
        <dd>{displayBytes(item.uniqueLogical)}</dd>
        <dt>Parent / scope</dt>
        <dd>
          {displayShare(item.parentShare)} / {displayShare(item.scopeShare)}
        </dd>
        {item.kind === 'directory' && (
          <>
            <dt>Files / folders</dt>
            <dd>
              {item.files.toLocaleString()} / {item.directories.toLocaleString()}
            </dd>
          </>
        )}
        <dt>Hard-link aliases</dt>
        <dd>{item.hardLinkAliases.toLocaleString()}</dd>
      </dl>
      <p className="storage-muted">
        Shares use {basis === 'logical' ? 'logical bytes' : 'known allocated bytes'}. An allocated
        estimate need not be exclusive.
      </p>
      <h4>Classification evidence</h4>
      <strong>{CATEGORY_LABELS[item.category]}</strong>
      <p className="storage-muted">{item.evidence}</p>
      <h4>Coverage</h4>
      <p>
        {item.incomplete ? 'Partial aggregate' : 'Indexed under scan policy'}
        {item.skipped ? ` · ${item.skipped} known skips or limits` : ''}.
      </p>
      {item.allocatedUnknown > 0 && (
        <p className="storage-muted">
          {item.allocatedUnknown.toLocaleString()} file allocations unavailable.
        </p>
      )}
      {item.kind === 'directory' && (
        <button type="button" className="storage-button" onClick={() => open(item.id)}>
          Open folder
        </button>
      )}
    </>
  )
}
