# Storage Explorer

Open **Storage** in the workspace bar. Choose a local folder or mounted volume in the native picker, then select **Start scan**. Sentinel never starts a storage scan at launch. The scan reads metadata, not file contents. There are no cleanup or filesystem modification controls.

The entry table, storage map and inspector form one workspace. Select a row or map tile to inspect it. Double-click or press **Enter** on a folder to open it; use Back, Forward, Parent or the breadcrumbs to navigate. The table can be navigated with the arrow keys, and **Columns** saves the display choices without retaining scan paths. On compact windows, switch between the map and inspector below the table.

The radial map shows positive measured children of its labeled folder. Sector angle represents size, and small entries are grouped. Selecting a visible folder exposes its children as an outer ring within that folder's wedge. Press **Enter** on the selected folder sector to drill down, or use the directory table. Switch to **Treemap** without rescanning.

A zero or unknown value has no area but can still appear in the table. The table shows immediate-parent share and can show indexed-scope share. Unknown allocation is excluded from allocated denominators. **Largest** ranks immediate child directories, files in the subtree, or recursive directory aggregates (which overlap and are not additive). **Search** matches indexed names across the scan. **Categories** filters metadata-based classifications, which can be wrong.

## Reading Sizes

- **Logical** counts file lengths per indexed name. **Unique logical** counts identifiable hard-linked objects once.
- **Allocated estimate** sums known file blocks, excluding hard-link aliases. Missing allocations are reported, not replaced with zero. Attribution goes to the first name encountered and may differ between scans.
- Sparse or compressed files can allocate less than their logical size. Clones and copy-on-write extents can share storage that reported block counts cannot deduplicate. Snapshots, unscanned paths and filesystem metadata are not part of folder totals. The separately labeled volume figure is filesystem available space, not the scan total or macOS purgeable-inclusive availability.

## Coverage and Privacy

Link targets, recognized mount or cloud boundaries, special files and inaccessible metadata are skipped. A scan can contain partial results after cancellation or a coverage error. Sentinel uses a bounded session (120,000 indexed entries, 48 open directory levels, 50 rows per page, up to 20 map sectors per ring). It never estimates progress as a percent of unknown work.

Scopes are authorized by the main window's native picker and never accepted as renderer-supplied paths. Scan results are kept in memory only; discard them manually or let them expire after 30 minutes of inactivity. They also expire on app shutdown or renderer destruction and are not included in reports.

The scan is not a filesystem snapshot. Files can change mid-scan. Linux pins opened directories through descriptors; macOS and Windows recheck canonical paths and directory identity without an atomic directory-relative walk. Windows does not report an allocation estimate and not every reparse-point type is exposed by Node. These checks do not promise race-free traversal. Use only locations you mean to inspect.
