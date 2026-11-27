# Desktop reliability

## Preferences

Main is authoritative. The renderer does not display a pause, layout or filter change as saved until it receives a committed settings snapshot. Snapshots are revisioned in memory for that app run. The renderer sends one write at a time and coalesces waiting edits into one patch. It displays a failure instead of applying an optimistic value. Retry is offered only while it can replay the failed edit against the same committed revision; otherwise repeat the action against the current values. No revision data is written to the preferences file.

The settings writer creates an exclusive, random temporary file in the settings directory, uses owner-only permissions where POSIX modes apply, and renames it over the original after writing and closing it. It removes only the temporary file it created. The rename is normally atomic on a local filesystem; Windows ACLs are inherited from the profile directory, and filesystem/OS errors can still prevent replacement. It is not a guarantee against a sudden power loss or concurrent external editing. At startup, unreadable, malformed or unsupported-version settings remain untouched. Sentinel uses temporary defaults and disables preference changes. To recover, quit Sentinel, back up or replace `settings.json` in its profile, and restart. Valid legacy profiles keep their prior normalization rules.

Launch at Login has a saved desired setting and a separately read macOS state. A failed save never invokes the OS setter. A denied OS change leaves the saved preference intact for retry and shows the actual state separately. Unrelated saves and startup do not change the login item. If the OS state cannot be read, Sentinel does not label it as definitively off.

## History and background behavior

The chart uses minute-bucket readings, not interpolated samples. Null values and absent buckets break the line, including gaps that would otherwise disappear during downsampling. Real zero values remain valid. Added break markers are only chart inputs; SQLite rows, retention, alert timestamps and CSV exports do not change. History and System's periodic thermal refresh stop scheduling new requests while the document is hidden. Raw sampling, background history writes and alert processing do not depend on this renderer visibility.

## Security and platform limits

See the [IPC capability matrix](ipc-capabilities.md). Native process confirmation remains Cancel-default; main checks the selected identity and window again before signaling it. The final check and the signal are not an atomic operation on all targets, so a residual PID reuse race remains. The macOS disk-capacity probe uses Foundation's important-usage availability through JXA; any public binary distribution should review Apple's [required-reason API declarations](https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacyaccessedapitypes/nsprivacyaccessedapitype), including display and optional diagnostic-report use. This is not a signing or distribution change.

## Reproducing verification

- `npm run verify` and `npm run smoke:desktop` exercise the compiled app and disposable profile. For paused startup, set `SENTINEL_SMOKE_START_PAUSED=1`. For privacy-screened native captures from the smoke fixture, set `SENTINEL_SMOKE_CAPTURE_DIR` to a precreated outside directory.
- Optional local process confirmation: run `./node_modules/.bin/electron scripts/accept-process-safety.cjs` after a build on macOS. Verify the named disposable process and PID in each dialog. Choose **Cancel** in the first, **Terminate** in the second. No existing app should be targeted.
- `npm run benchmark:desktop` uses 43,200 seeded rows and a sustained ten-minute Overview run by default. Set `SENTINEL_BENCH_OUTPUT` for raw JSON. `SENTINEL_BENCH_STARTUP_ONLY=1` measures first render and initial complete readings from loading main; it does not measure an empty OS/FS cache. `SENTINEL_BENCH_DETAIL=1` uses 86,400 seeded rows (one-second density) and adds verified native minimize, visibility sampling, event-loop delay, History request timings, heap/RSS/private-memory checkpoints and repeat tray/Mini transitions. Set `SENTINEL_BENCH_MAIN` to a separately built immutable main bundle for comparison.
- Working-set totals include shared residency and are not unique physical memory. Electron CPU excludes external collector subprocess CPU. Wire sizes are estimated JSON bytes, not Electron transport measurements. Pair runs using equal seeded data, cadence, role visibility, warmup, scenario order and runtime; compare distributions instead of attributing unrelated host changes to the app.
