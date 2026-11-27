import { useEffect, useRef, useState } from 'react'
import {
  DUPLICATE_LIMITS,
  type DuplicateGroup,
  type DuplicateMember,
  type DuplicatePreview,
  type DuplicateQuery,
  type DuplicateResult,
  type DuplicateSnapshot
} from '../../../../shared/contracts/duplicates'
import { displayBytes } from '../storage/presentation'
import { StorageGlyph } from '../storage/StorageResults'

function Pager({
  page,
  size,
  total,
  name,
  change
}: {
  page: number
  size: number
  total: number
  name: string
  change: (page: number) => void
}) {
  if (!total) return null
  const last = Math.ceil(total / size) - 1
  return (
    <nav className="storage-pager duplicate-pager" aria-label={name}>
      <span>
        {(page * size + 1).toLocaleString()}–{Math.min((page + 1) * size, total).toLocaleString()}{' '}
        of {total.toLocaleString()}
      </span>
      <button
        type="button"
        className="storage-icon-button"
        aria-label={`Previous ${name}`}
        disabled={page === 0}
        onClick={() => change(page - 1)}
      >
        <StorageGlyph icon="back" />
      </button>
      <button
        type="button"
        className="storage-icon-button"
        aria-label={`Next ${name}`}
        disabled={page === last}
        onClick={() => change(page + 1)}
      >
        <StorageGlyph icon="forward" />
      </button>
    </nav>
  )
}

function fileType(member: DuplicateMember): string {
  if (member.image) return member.image.format.toUpperCase()
  const at = member.name.lastIndexOf('.')
  return at > 0 && at < member.name.length - 1 ? member.name.slice(at + 1).toUpperCase() : 'File'
}

function MemberInspector({
  group,
  reference,
  member,
  preview,
  photos,
  pending
}: {
  group: DuplicateGroup
  reference: DuplicateMember | null
  member: DuplicateMember | undefined
  preview: DuplicatePreview | null
  photos: boolean
  pending: boolean
}) {
  return (
    <aside
      className="duplicate-inspector"
      aria-label={photos ? 'Photo comparison' : 'Verification details'}
    >
      <header className="storage-pane-head">
        <h3>{photos ? 'Photo comparison' : 'Verification'}</h3>
        <span className="duplicate-flag">
          {photos
            ? `${DUPLICATE_LIMITS.thumbnail}px previews · not full resolution`
            : 'Byte-for-byte match'}
        </span>
      </header>
      <div className="duplicate-inspect-body" tabIndex={0}>
        {photos ? (
          <>
            <div className="duplicate-comparison" aria-busy={pending}>
              {(
                [
                  ['Reference image', reference, preview?.reference],
                  [
                    'Comparison image',
                    member && member.id !== group.reference ? member : null,
                    preview?.member
                  ]
                ] as const
              ).map(([title, file, image]) => (
                <figure key={title} className="duplicate-shot">
                  <div className="duplicate-frame">
                    {image && file ? (
                      <img src={image} alt={`${title}: ${file.name}`} />
                    ) : (
                      <span>
                        {pending
                          ? 'Preparing preview…'
                          : file
                            ? 'Preview unavailable'
                            : 'Select a similar photo'}
                      </span>
                    )}
                  </div>
                  <figcaption>
                    <strong>{title}</strong>
                    <bdi title={file?.name}>{file?.name ?? '—'}</bdi>
                    {file?.image && (
                      <small>
                        {fileType(file)} · {file.image.width} × {file.image.height} ·{' '}
                        {displayBytes(file.logical)}
                      </small>
                    )}
                  </figcaption>
                </figure>
              ))}
            </div>
            {member && member.id !== group.reference && (
              <p className="duplicate-match">
                <strong>{member.distance} / 64 bits differ</strong>
                {member.byteEqual ? ' · Byte-for-byte match' : ' · Visual resemblance only'}
              </p>
            )}
          </>
        ) : (
          <dl className="duplicate-facts">
            <dt>Logical size per copy</dt>
            <dd>{displayBytes(group.each)}</dd>
            <dt>Total logical size, all paths</dt>
            <dd>{displayBytes(group.logical)}</dd>
            <dt>Redundant logical size</dt>
            <dd>{displayBytes(group.redundant)}</dd>
            <dt>Allocated estimate, unique identities</dt>
            <dd>{displayBytes(group.allocated)}</dd>
          </dl>
        )}
        {member && (
          <section className="duplicate-member" aria-label="Selected file">
            <h4>
              <bdi>{member.name}</bdi>
            </h4>
            <code className="storage-path">
              <bdi>{member.location}</bdi>
            </code>
            <dl className="duplicate-facts">
              {!member.image && (
                <>
                  <dt>Format</dt>
                  <dd>{fileType(member)}</dd>
                  <dt>Logical size</dt>
                  <dd>{displayBytes(member.logical)}</dd>
                </>
              )}
              <dt>Allocated estimate</dt>
              <dd>
                {member.hardLinkAlias ? 'Counted with its file' : displayBytes(member.allocated)}
              </dd>
              <dt>Modified</dt>
              <dd>{new Date(member.modifiedAt).toLocaleString()}</dd>
            </dl>
          </section>
        )}
        <details className="storage-accounting duplicate-method" open>
          <summary>{photos ? 'How photos are compared' : 'What was verified'}</summary>
          <p>
            {photos
              ? 'Each match is measured against the displayed reference using a 64-bit perceptual hash. Fewer differing bits means a closer candidate, not a probability or proof. The threshold filters existing reference matches. Only static JPEG and PNG are supported.'
              : 'Files with matching sizes and SHA-256 hashes were compared byte for byte. Hard links are alternate paths to the same file. Redundant logical size assumes one independent copy is retained; shared blocks and filesystem overhead mean it is not a space recovery estimate.'}
          </p>
        </details>
      </div>
    </aside>
  )
}

export function DuplicateResults({ scan }: { scan: DuplicateSnapshot }) {
  const photos = scan.mode === 'photos'
  const [query, setQuery] = useState<DuplicateQuery>({
    text: '',
    sort: photos ? 'distance' : 'bytes',
    threshold: 10,
    page: 0,
    group: null,
    memberPage: 0,
    hideEmpty: true
  })
  const [result, setResult] = useState<DuplicateResult | null>(null)
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  const [pending, setPending] = useState(true)
  const [selected, setSelected] = useState<number | null>(null)
  const [previewResult, setPreviewResult] = useState<{
    key: string
    value: DuplicatePreview | null
  } | null>(null)
  const [panel, setPanel] = useState('results')
  const queue = useRef(Promise.resolve())
  const update = (change: Partial<DuplicateQuery>) => setQuery((q) => ({ ...q, ...change }))

  useEffect(() => {
    let current = true
    const timer = setTimeout(() => {
      queue.current = queue.current.then(async () => {
        if (!current) return
        setPending(true)
        try {
          const data = await window.electronAPI.queryDuplicateScan(scan.id, query)
          if (current) {
            setResult(data)
            setFailed(data === null)
          }
        } catch {
          if (current) setFailed(true)
        } finally {
          if (current) setPending(false)
        }
      })
    }, 100)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [scan.id, query, retry])

  const group = result?.selected?.id === query.group ? (result?.selected ?? null) : null
  const visiblePanel = !group ? 'results' : panel
  const groupId = group?.id
  const rows = group ? result!.members : []
  const member =
    rows.find((row) => row.id === selected) ??
    (photos ? rows.find((row) => row.id !== group?.reference) : rows[0])
  const memberId = member?.id
  const previewKey =
    photos && scan.state !== 'cancelled' && groupId !== undefined && memberId !== undefined
      ? `${groupId}:${memberId}`
      : null
  const preview =
    previewKey !== null && previewResult?.key === previewKey ? previewResult.value : null
  const previewPending = previewKey !== null && previewResult?.key !== previewKey
  useEffect(() => {
    if (!previewKey || groupId === undefined || memberId === undefined) return
    let current = true
    queue.current = queue.current.then(async () => {
      if (!current) return
      let value: DuplicatePreview | null = null
      try {
        value = await window.electronAPI.previewDuplicateMember(scan.id, groupId, memberId)
      } catch {
        // Index data remains available if either raster can no longer be read.
      } finally {
        if (current) setPreviewResult({ key: previewKey, value })
      }
    })
    return () => {
      current = false
    }
  }, [scan.id, previewKey, groupId, memberId])

  return (
    <>
      <div className="storage-location-bar duplicate-filters">
        <label className="storage-search">
          <StorageGlyph icon="search" />
          <span className="sr-only">Search file names</span>
          <input
            type="search"
            placeholder="Search file names"
            value={query.text}
            maxLength={DUPLICATE_LIMITS.search}
            onChange={(event) => update({ text: event.target.value, page: 0, memberPage: 0 })}
          />
        </label>
        <label>
          Sort{' '}
          <select
            value={query.sort}
            onChange={(event) => {
              const sort = event.target.value
              if (sort === 'bytes' || sort === 'copies' || sort === 'name' || sort === 'distance')
                update({ sort, page: 0 })
            }}
          >
            {photos && <option value="distance">Closest match</option>}
            <option value="bytes">{photos ? 'Logical size' : 'Redundant logical size'}</option>
            <option value="copies">{photos ? 'Most candidates' : 'Most independent copies'}</option>
            <option value="name">Reference name</option>
          </select>
        </label>
        {photos ? (
          <label
            className="duplicate-threshold"
            title="Maximum number of different bits from the reference; lower is stricter"
          >
            Max distance{' '}
            <input
              type="range"
              min="0"
              max={DUPLICATE_LIMITS.distance}
              value={query.threshold}
              aria-label="Maximum Hamming distance"
              aria-valuetext={`${query.threshold} differing bits`}
              onChange={(event) =>
                update({ threshold: event.target.valueAsNumber, page: 0, memberPage: 0 })
              }
            />
            <output>{query.threshold} bits</output>
          </label>
        ) : (
          <label>
            <input
              type="checkbox"
              checked={!query.hideEmpty}
              onChange={(event) => update({ hideEmpty: !event.target.checked, page: 0 })}
            />{' '}
            Show empty files
          </label>
        )}
      </div>
      <div
        className="storage-compact-panes duplicate-compact"
        role="group"
        aria-label="Analyzer pane"
      >
        <button
          type="button"
          aria-pressed={visiblePanel === 'results'}
          onClick={() => setPanel('results')}
        >
          Results
        </button>
        <button
          type="button"
          aria-pressed={visiblePanel === 'details'}
          disabled={!group}
          onClick={() => setPanel('details')}
        >
          {photos ? 'Comparison' : 'Inspector'}
        </button>
      </div>
      <div className="duplicate-body" data-panel={visiblePanel} data-mode={scan.mode}>
        <div className="duplicate-results" aria-busy={pending}>
          <section className="duplicate-groups" aria-label="Match groups">
            <header className="storage-pane-head">
              <h3>{photos ? 'Similarity groups' : 'Verified groups'}</h3>
              <span>{result?.matches ?? '—'}</span>
            </header>
            {failed ? (
              <p className="storage-empty" role="alert">
                Results unavailable.{' '}
                <button
                  type="button"
                  className="storage-button"
                  onClick={() => setRetry((n) => n + 1)}
                >
                  Retry
                </button>
              </p>
            ) : !result?.groups.length ? (
              <p className="storage-empty">
                {pending ? 'Loading groups…' : 'No groups match these filters.'}
              </p>
            ) : (
              <div className="duplicate-scroll" tabIndex={0} aria-label="Scrollable group table">
                <table className="duplicate-table">
                  <thead>
                    <tr>
                      <th scope="col">Reference file</th>
                      <th scope="col">Paths</th>
                      <th scope="col">{photos ? 'Closest' : 'Copies'}</th>
                      <th scope="col">{photos ? 'Logical' : 'Redundant'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.groups.map((item) => (
                      <tr key={item.id} data-selected={query.group === item.id}>
                        <th scope="row">
                          <button
                            type="button"
                            aria-pressed={query.group === item.id}
                            className="storage-link"
                            onClick={() => {
                              update({ group: item.id, memberPage: 0 })
                              setSelected(null)
                              setPanel('results')
                            }}
                          >
                            <bdi>{item.label}</bdi>
                          </button>
                        </th>
                        <td>{item.paths}</td>
                        <td>
                          {photos
                            ? `${item.bestDistance} ${item.bestDistance === 1 ? 'bit' : 'bits'}`
                            : item.copies}
                        </td>
                        <td>{displayBytes(photos ? item.logical : item.redundant)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {result && (
              <Pager
                page={result.page}
                size={DUPLICATE_LIMITS.groupPage}
                total={result.matches}
                name="groups"
                change={(page) => update({ page })}
              />
            )}
          </section>
          <section className="duplicate-files" aria-label="Group files">
            <header className="storage-pane-head">
              <h3>Group files</h3>
              <span>{group ? `${group.paths} paths` : '—'}</span>
            </header>
            {!group ? (
              <p className="storage-empty">Select a group to inspect its files.</p>
            ) : (
              <>
                <div className="duplicate-scroll" tabIndex={0} aria-label="Scrollable file table">
                  <table className="duplicate-table duplicate-member-table">
                    <thead>
                      <tr>
                        <th scope="col">File and location</th>
                        <th scope="col">Logical</th>
                        <th scope="col">{photos ? 'Distance' : 'Identity'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.id} data-selected={row.id === memberId}>
                          <th scope="row">
                            <button
                              type="button"
                              className="storage-link duplicate-file-link"
                              aria-pressed={row.id === memberId}
                              onClick={() => setSelected(row.id)}
                            >
                              <bdi>{row.name}</bdi>
                              <small title={row.location}>
                                <bdi>
                                  {row.location.slice(
                                    scan.scope.location.replace(/[\\/]$/, '').length + 1
                                  )}
                                </bdi>
                              </small>
                            </button>
                          </th>
                          <td>{displayBytes(row.logical)}</td>
                          <td>
                            {row.id === group.reference
                              ? 'Reference'
                              : photos
                                ? `${row.distance} ${row.distance === 1 ? 'bit' : 'bits'}`
                                : row.hardLinkAlias
                                  ? 'Hard link'
                                  : 'Independent'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pager
                  page={result!.memberPage}
                  size={DUPLICATE_LIMITS.memberPage}
                  total={group.paths}
                  name="files"
                  change={(memberPage) => update({ memberPage })}
                />
              </>
            )}
          </section>
        </div>
        {group ? (
          <MemberInspector
            group={group}
            reference={result?.referenceFile ?? null}
            member={member}
            preview={preview}
            photos={photos}
            pending={previewPending}
          />
        ) : (
          <aside className="duplicate-inspector" aria-label="Match inspector">
            <header className="storage-pane-head">
              <h3>{photos ? 'Photo comparison' : 'Verification'}</h3>
            </header>
            <p className="storage-empty">
              Select a group to review{' '}
              {photos ? 'the reference and a candidate' : 'the verification and size breakdown'}.
            </p>
          </aside>
        )}
      </div>
    </>
  )
}
