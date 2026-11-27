# Duplicate Files

Open **Analyze > Duplicate Files** or **Analyze > Similar Photos**, then choose a folder.
Selecting a folder in Storage Explorer does not authorize content analysis.
Start analysis separately. Sentinel reads eligible local files without changing them. Choosing
another mode or folder discards the old session. Results are held in memory for the current
window and expire after 30 minutes of inactivity. No cleanup, export, or network requests are
part of this workflow.

## Exact Duplicates

Sentinel considers independent regular files of the same logical size, streams SHA-256 hashes,
then compares matching candidates byte for byte. A hard link is another name for the same
underlying file, not an independent copy. Empty files are hidden by default.

**Redundant logical size** is the common file length multiplied by the number of independent
copies minus one. **Allocated estimate** uses filesystem-reported blocks, once per known
identity. APFS clones and other copy-on-write or deduplicated files may share blocks. These are
not estimates of space that deleting a file would recover. A reference is the deterministic
comparison file, not an original or a recommendation.

## Similar Photos

Initial support is static JPEG and PNG. JPEG orientation is applied before hashing. Sentinel
samples luminance into a 9 × 8 grid; horizontal comparisons produce a 64-bit difference hash
(dHash). Each candidate is compared to its displayed reference. The threshold is the maximum
Hamming distance (number of differing bits, 0–10). Changing it filters existing groups; it
does not create new references. A zero distance is not proof of an exact copy. The separate
byte-for-byte label requires matching SHA-256 and a direct comparison of the encoded files.

Resizing or recompression can preserve a match, but crops, large edits, similar compositions,
flat images, or orientation changes can produce misses or false matches. Review both images.
HEIC, RAW, animated formats, and other unsupported images are not decoded. Small raster
previews are decoded on demand; a changed file may no longer have a preview.

## Coverage And Limits

One folder, one scan and one decoder at a time. At most 30,000 entries, 12,000 exact hash
candidates, 512 photos, 1,000 groups, and five minutes of scheduled work. Exact file reads are
limited to 256 MiB per file and 2 GiB across hashing and verification. Images are limited to
4 MiB encoded, 4,096 pixels on an edge, and 12 megapixels. Previews are at most 192 pixels
on an edge. The status footer lists exclusions and limits; partial or cancelled scans do
not cover the full folder.

Symbolic links, other mounts, recognized cloud locations and obvious dataless placeholders
are skipped. Some providers do not expose dataless files reliably; avoid their folders.
The analysis is not an atomic filesystem snapshot. Windows content analysis stays disabled
pending validation of reparse-point and offline-file protections.
