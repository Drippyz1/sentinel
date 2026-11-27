import {
  DUPLICATE_LIMITS,
  type DuplicateIssue,
  type DuplicatePhase,
  type DuplicateSnapshot
} from '../../../shared/contracts/duplicates'
import { DuplicateResults } from '../components/duplicates/DuplicateResults'
import { useDuplicateSession } from '../components/duplicates/useDuplicateSession'
import { displayBytes } from '../components/storage/presentation'
import { useWorkspaceActivity } from '../components/layout/useWorkspaceActivity'
import { useLocation } from 'react-router-dom'
import '../assets/storageExplorer.css'
import '../assets/duplicates.css'

const PHASES: Record<DuplicatePhase, string> = {
  discovery: 'Discovering files',
  hashing: 'Hashing size candidates',
  verification: 'Verifying byte-for-byte',
  decoding: 'Decoding JPEG and PNG',
  matching: 'Comparing photo signatures',
  ready: 'Preparing results'
}
const STATES: Record<DuplicateSnapshot['state'], string> = {
  ready: 'Authorized',
  running: 'Running',
  cancelling: 'Cancelling',
  cancelled: 'Cancelled · incomplete coverage',
  complete: 'Complete',
  partial: 'Partial coverage',
  failed: 'Analysis failed'
}
const ISSUES: Record<DuplicateIssue, string> = {
  discovery: 'Traversal exclusions or limits',
  changed: 'Changed or replaced',
  unreadable: 'Unreadable',
  unavailableData: 'Offline or no allocated blocks',
  unsupportedFormat: 'Unsupported format',
  invalidImage: 'Invalid image',
  imageLimit: 'Image exceeds size or pixel limit',
  lowDetail: 'Too little visual detail',
  decoderUnavailable: 'Decoder unavailable',
  resourceLimit: 'Analysis resource limit',
  identityUnavailable: 'File identity unavailable'
}

function ScanStatus({ scan }: { scan: DuplicateSnapshot | null }) {
  const skips =
    scan && (Object.keys(scan.skipped) as DuplicateIssue[]).filter((key) => scan.skipped[key] > 0)
  return (
    <footer className="storage-status duplicate-status">
      <span className="storage-state" data-state={scan?.state} role="status">
        {scan ? STATES[scan.state] : 'No folder authorized'}
      </span>
      {scan && scan.state !== 'ready' && (
        <>
          <span>{scan.inspected.toLocaleString()} inspected</span>
          <span>
            {scan.completed.toLocaleString()} / {scan.eligible.toLocaleString()} candidates
          </span>
          <span>{displayBytes(String(scan.bytesRead))} read</span>
          <span>{(scan.elapsedMs / 1000).toFixed(1)} s</span>
        </>
      )}
      {!!skips?.length && scan && (
        <details className="storage-coverage">
          <summary>
            {skips.reduce((n, key) => n + scan.skipped[key], 0).toLocaleString()} skips / limits
          </summary>
          <ul>
            {skips.map((key) => (
              <li key={key}>
                {ISSUES[key]}: {scan.skipped[key].toLocaleString()}
              </li>
            ))}
          </ul>
        </details>
      )}
    </footer>
  )
}

export function DuplicateExplorerPage() {
  const preferred = useLocation().state?.analyzerMode === 'photos' ? 'photos' : 'exact'
  const session = useDuplicateSession(preferred)
  const { snapshot: scan, mode, supported, running, pending } = session
  const showResults = scan && !running && scan.groups > 0
  useWorkspaceActivity(
    running
      ? 'Content analysis active'
      : scan?.state === 'partial'
        ? 'Partial analysis results'
        : null
  )
  return (
    <section
      className="storage-workbench duplicate-workbench"
      aria-label="Duplicate analysis workspace"
    >
      <header className="storage-toolbar duplicate-toolbar">
        <h2 className="sr-only">Duplicate Files</h2>
        <div className="storage-views" role="group" aria-label="Analysis mode">
          <button
            type="button"
            aria-pressed={mode === 'exact'}
            disabled={pending || running}
            onClick={() => void session.switchMode('exact')}
          >
            Exact duplicates
          </button>
          <button
            type="button"
            aria-pressed={mode === 'photos'}
            disabled={pending || running}
            onClick={() => void session.switchMode('photos')}
          >
            Similar photos
          </button>
        </div>
        <div className="storage-actions">
          <button
            type="button"
            className="storage-button"
            disabled={!supported || pending || running}
            data-primary={!scan || undefined}
            onClick={() => void session.choose()}
          >
            Choose folder
          </button>
          {scan &&
            (running ? (
              <button
                type="button"
                className="storage-button"
                disabled={pending || scan.state === 'cancelling'}
                onClick={() => void session.cancel(scan.id)}
              >
                Cancel analysis
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="storage-button"
                  data-primary
                  disabled={pending}
                  onClick={() => void session.start(scan.id)}
                >
                  {scan.state === 'ready' ? 'Start analysis' : 'Rescan'}
                </button>
                <button
                  type="button"
                  className="storage-button"
                  disabled={pending}
                  onClick={() => void session.discard(scan.id)}
                >
                  Discard
                </button>
              </>
            ))}
        </div>
      </header>
      {scan && (
        <div className="storage-scan-strip duplicate-scope">
          <strong>Authorized folder</strong>
          <code title={scan.scope.location}>
            <bdi>{scan.scope.location}</bdi>
          </code>
        </div>
      )}
      {session.error && (
        <p className="storage-error" role="alert">
          {session.error}
        </p>
      )}
      {showResults ? (
        <DuplicateResults key={scan.id} scan={scan} />
      ) : (
        <div className="storage-start duplicate-start">
          {supported === null ? (
            <h3>Checking session…</h3>
          ) : !supported ? (
            <>
              <h3>Content analysis is unavailable on this platform</h3>
              <p>Storage Explorer can still inspect metadata for supported local folders.</p>
            </>
          ) : !scan || scan.state === 'ready' ? (
            <>
              <h3>
                {scan
                  ? 'Ready to analyze'
                  : mode === 'exact'
                    ? 'Find exact copies'
                    : 'Compare similar photos'}
              </h3>
              <p>
                Sentinel reads file contents inside the authorized folder. Analysis is local and
                read-only.
              </p>
              <details className="analysis-limits">
                <summary>Coverage limits</summary>
                <p>
                  {DUPLICATE_LIMITS.entries.toLocaleString()} indexed entries ·{' '}
                  {DUPLICATE_LIMITS.durationMs / 60_000} minutes of scheduled work
                </p>
                <p>
                  {mode === 'exact'
                    ? `${DUPLICATE_LIMITS.exactCandidates.toLocaleString()} hash candidates · ${DUPLICATE_LIMITS.fileBytes / 1024 ** 2} MiB per file · ${DUPLICATE_LIMITS.totalBytes / 1024 ** 3} GiB read budget`
                    : `${DUPLICATE_LIMITS.photos} photos · ${DUPLICATE_LIMITS.photoBytes / 1024 ** 2} MiB encoded · ${DUPLICATE_LIMITS.photoPixels / 1e6} megapixels · ${DUPLICATE_LIMITS.photoDimension.toLocaleString()} pixels per edge`}
                </p>
              </details>
              <p>
                {mode === 'exact'
                  ? 'Exact matches are verified byte for byte; hard links are not counted as independent copies.'
                  : 'Static JPEG and PNG only. Visual matches are candidates for review, not interchangeable copies.'}
              </p>
            </>
          ) : running ? (
            <>
              <h3>
                {scan.state === 'cancelling' ? 'Finishing the current read' : PHASES[scan.phase]}
              </h3>
              <progress aria-label="Analysis in progress; no estimated completion percentage" />
            </>
          ) : scan.state === 'failed' ? (
            <>
              <h3>Analysis could not finish</h3>
              <p role="alert">Choose the folder again or rescan. No files were modified.</p>
            </>
          ) : (
            <>
              <h3>{scan.state === 'cancelled' ? 'Analysis cancelled' : 'No matching groups'}</h3>
              <p>
                {scan.state === 'complete'
                  ? 'No matches were found in the analyzed files.'
                  : 'No verified groups are available. Check scan coverage below before drawing conclusions.'}
              </p>
            </>
          )}
        </div>
      )}
      <ScanStatus scan={scan} />
    </section>
  )
}
