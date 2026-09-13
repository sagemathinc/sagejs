# Bounded hard-discriminant acquisition

This is a separate, explicitly declared acquisition policy, not a v2 cell or a
performance-panel freeze. It uses only degree, signature and discriminant windows
to acquire candidates, then a fixed seeded selection rule. It does not query or
run Sage.js, PARI or Hecke. Neither source metadata nor successful acquisition
proves the requested mathematics or the ten-second reference-cost stratum.

| Degree | Signature `(r1,r2)` | Absolute discriminant windows |
|---|---|---|
| 8 | `(8,0)` | `[10^37,10^38)`, `[10^38,10^39)` |
| 8 | `(0,4)` | `[10^37,10^38)`, `[10^38,10^39)` |
| 9 | `(9,0)` | `[10^40,10^41)` |
| 9 | `(1,4)` | `[10^38,10^39)` |
| 10 | `(0,5)` | `[2.5×10^36,10^37)` |
| 10 | `(2,4)` | `[10^41,10^42)` |

These windows start above the corresponding captured v2 windows, which were
concentrated near broad-band lower edges. Their database population is unknown.
An empty response is evidence of an empty queried window at acquisition time,
not permission to change the bounds or retry indefinitely.

## Declare first, fetch only with explicit approval

From the repository root, supply **all prior and currently active screening input
files**, including the active 72-field batch, when constructing a new plan:

```sh
node bench/class-unit-groups/general-frontier/corpus/hard-windows.cjs plan \
  --directory build/general-frontier/hard-windows-v1 \
  --exclude-input /path/to/prior-input-1.json \
  --exclude-input /path/to/prior-input-2.json \
  --exclude-input /path/to/active72-input.json

# Offline inspection; no database client is started:
node bench/class-unit-groups/general-frontier/corpus/hard-windows.cjs check \
  --directory build/general-frontier/hard-windows-v1

# Coordinator-approved acquisition ONLY; this can issue up to eight queries:
node bench/class-unit-groups/general-frontier/corpus/hard-windows.cjs fetch \
  --directory build/general-frontier/hard-windows-v1

# Offline deterministic reconstruction to an exclusive new output file:
node bench/class-unit-groups/general-frontier/corpus/hard-windows.cjs replay \
  --directory build/general-frontier/hard-windows-v1 \
  --output build/general-frontier/hard-window-pool-v1.json
```

The acquisition directory must be new and its parent must exist. Exclusion inputs
are JSON arrays of labels or objects with `label`; generated input labels are
allowed too. Each input's exact JSON text, file path, byte hash and extracted labels
are retained in `manifest.json`. The manifest binds the tool and shared-normalizer
source hashes, so replay uses those same source versions. Later changes to input
files do not change the pinned exclusions. The coordinator remains responsible
for supplying the complete prior/active list: the tool cannot discover omitted
inputs automatically. Up to 64 input files and 8 MiB total input bytes are allowed.

The plan has eight fixed window IDs; there are no command-line range, row-count,
query-count or retry overrides. Every query reads the first 128 rows ordered by
numeric discriminant and bytewise label. Excluded labels are removed before
selecting at most eight rows by the pinned seed/window/label hash. Thus at most
64 candidates are exported. This is not a uniform database sample, an isomorphism
deduplication, or a guarantee of 64 available candidates. Class-number-null rows
are retained; no selection depends on a Sage.js result.

## Bounds and failure handling

The optional native `psql` client uses a read-only session, 20-second statement
timeout, 8-second connection timeout, 30-second client timeout and 8 MiB response
cap. The client is killed on timeout. Connection environment names and defaults
match the existing candidate-pool tool; credentials and server stderr are never
persisted. A hash of host/port/database/username records connection configuration
identity without retaining those values. Missing `psql` yields an explicit
`client-unavailable` receipt; no package installation or fallback query occurs.

An exclusive directory lock prevents concurrent acquisition. Before each query,
an immutable, fsynced dispatch ticket records the SQL, its hash, the manifest hash,
producer hashes and client/runtime metadata. Results retain bounded stdout bytes
as base64, their hash, normalized raw rows, selected labels, and explicit
success/empty/error status. Malformed and partial responses remain available in
raw form; error receipts never contribute candidates. Overflow capture may be
truncated and is labeled. Final receipts are atomically published without replacing
existing files. Directory fsync is used where supported; Windows still fsyncs each
file but does not support the directory-fsync step.

Repeated fetches skip every already dispatched window, including empty and error
results. A ticket without a result blocks further fetching and is reported as
`interrupted-or-in-progress`; there is no automatic retry or budget reset.
SIGKILL/power loss can leave a lock or temporary file; replay fails closed on
unknown artifacts. Such conditions require explicit coordinator reconciliation,
not deletion/recreation of the directory to disguise a retry. At most eight
queries are dispatched over the lifetime of a normal acquisition directory.

Replay/check are offline and do not overwrite the export. Keep replay output
outside the acquisition directory; unknown files inside it are rejected. A
complete collection of empty/error receipts is a valid, possibly empty, pool.
Partially dispatched collections explicitly retain unqueried/pending windows.

## Source identity and subsequent work

The tool reuses `candidate-pool.cjs` exact row normalization, hashing and source
attribution. Its SQL uses the same column representation, but its own bounded
window validation. It never calls v2 query functions with counterfeit cells,
bypasses their validation, or labels new receipts as v2.

Exports use `sagejs.general-class-unit-hard-window-pool.v1` and
`source_kind: "hard-window-v1"`; each selected row links to its raw-row and receipt
hashes. Any future union with v2 records must validate both source kinds explicitly.
These candidates still require exposure/isomorphism audits and matched reference
costs. Existing generated-family reserves, including the 20-field reserve, are
unchanged. The separately declared 600-second censored-reference rescue queue is
also unaffected. Source rows remain attributed to the LMFDB Collaboration under
the existing CC-BY-SA-4.0 dataset metadata carried in the export.

Offline validation (uses fake query results only):

```sh
node --test bench/class-unit-groups/general-frontier/corpus/hard-windows.test.cjs
```
