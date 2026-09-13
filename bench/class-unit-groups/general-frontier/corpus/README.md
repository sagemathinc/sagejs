# General class/unit candidate acquisition

This developer-only Node tool acquires a bounded, offline-replayable LMFDB
**candidate pool**, not the final 1,800-field coverage corpus or 360-field
performance panel. No Sage.js success, known class number, or CAS computation
is used for acquisition. Final reference-cost strata, distinctness of added
families, exposure audit, and development/holdout assignment remain pending.

```sh
node bench/class-unit-groups/general-frontier/corpus/candidate-pool.cjs plan
node --test bench/class-unit-groups/general-frontier/corpus/candidate-pool.test.cjs
```

`plan` prints the pinned seed, policy, and every cell without networking.
The degree-2–10 policy covers all 34 signatures. Eight absolute-discriminant
bands have endpoints `10^0, 10^6, 10^12, 10^18, 10^24, 10^36, 10^60, 10^100,
10^200` (lower inclusive, upper exclusive). Each band/signature has `all` and
`missing-h` channels: 544 cells altogether. The extra channel intentionally
retains unknown class numbers; it is not a proxy for a measured expensive case.
Empty and failed cells are evidence, not permission to substitute silently.

## Bounded acquisition and its sampling limitation

Every SQL query requests the first **128** rows ordered by numeric `disc_abs`
then bytewise LMFDB label within one cell. Local SHA-256 ranking using the
pinned seed, cell ID and label selects at most **64** non-excluded rows. This
avoids an unbounded database-wide random sort. It is deliberately **not uniform
sampling of the entire cell**: when a window is full, its candidates come from
the low-discriminant edge of that band. The receipt explicitly records
`window_limit_reached`. The large-scale bands supply breadth, not proof of
seconds-scale coverage. No existing window is advanced or silently enlarged.
Additional windows/families require a revised policy and separate export.

SQL runs read-only with a 20-second statement timeout, an 8-second connection
timeout, a 30-second client deadline, and an 8 MiB response cap. These cap
duration/output, not database rows examined internally; indexed-plan quality
may vary. Defaults fetch **one** pending cell; `--max-cells` permits at most
34 per invocation (at most 1,020 seconds of client deadlines, serially).
Do not run the full acquisition as a side effect of a smoke check. A completely
filled policy would contain at most 34,816 selections before cross-cell label
deduplication, and at most 69,632 raw rows. Raw windows are retained for audit.

Create a task-scoped output directory, then explicitly select small cells:

```sh
node bench/class-unit-groups/general-frontier/corpus/candidate-pool.cjs fetch \
  --directory /tmp/general-class-unit-candidate-smoke \
  --cell n2-r2-0-d0-all --cell n10-r2-0-d4-all --max-cells 2
node bench/class-unit-groups/general-frontier/corpus/candidate-pool.cjs check \
  --directory /tmp/general-class-unit-candidate-smoke
```

The public read-only PostgreSQL defaults match the existing repository
downloader: host `devmirror.lmfdb.xyz`, port `5432`, database/user `lmfdb`.
`psql` must be installed to fetch; offline planning, tests and checking need
only Node.js 22.22.2 or newer and work without `psql`. Override connections with
`LMFDB_PGHOST`, `LMFDB_PGPORT`, `LMFDB_PGDATABASE`, `LMFDB_PGUSER`, and
`LMFDB_PGPASSWORD`. Passwords go only in the child environment; receipts and
diagnostics do not contain credentials, connection overrides, or server error
text. Acquisition requires network access; routine tests never do.

## Resume and offline integrity

`export.json` pins the exact policy, attribution, optional campaign digest,
and separate hard-exclusion/historical-exposure lists. Each attempted cell gets an immutable numbered
`.receipt.json` containing SQL/query hash, canonical raw source rows/hash,
selected labels, capture timestamp, status, and receipt hash. `pool.json` is a
deterministically regenerated normalized projection of the receipts, with
selected-record and ordered-label hashes. It describes all 544 cells, including
pending cells. Per-degree availability summaries report distinct labels,
missing class numbers, signature counts, and the arithmetic shortfall to 200
candidates; even zero shortfall does not establish a qualified final panel.
`check` recomputes every digest and projection offline.

## Explicit v2 acquisition revision

Bounded read-only source probes on 2026-09-11 established a real v1
cardinality shortfall: the maximum absolute quadratic discriminant was
`802241960520` in both signatures (minima 5 for real, 3 for imaginary), and no
degree-2 record had a missing class number. All four signature × band-0/1
windows had at least 128 records. Thus only those four quadratic `all` cells
can contribute: v1's 40 selections per cell gave a maximum of **160**, not
the required 200. Higher bands and missing-class-number channels cannot fill
that witnessed gap. The maximum/minimum queries used ordered `LIMIT 1`
lookups; the four count probes used `LIMIT 128` subqueries, with a 15-second
statement timeout and read-only connection. This was source discovery, not
Sage.js performance-based selection.

Policy, export, cell-receipt and pool schema identifiers are explicitly **v2**.
The global selection cap is now **64**, yielding at most **256** quadratic
candidates from the four known populated windows before hard exclusions.
The 128-row source windows, SQL queries, ranking seed, time/response limits,
and all coverage/performance acceptance targets are unchanged. For identical
source rows and exclusions, the selected 40-label set is contained in the new
64-label set. The retained seed's `v1` suffix identifies that unchanged ranking
seed; it does not identify the revised policy version.

Use a **new output directory** and bounded refetch for v2. Existing v1 exports
and receipts remain immutable: v2 validation/resume rejects their policy and
schema identities before any query or artifact rewrite. There is deliberately
no v1 importer or silent receipt relabelling. Keep the v1 tool revision if
offline verification of historical v1 artifacts is needed. The extra candidate
capacity does not establish reference timing coverage or qualify a final panel.

Successful and empty cells are never refetched. Errors remain pinned unless
`--retry-errors` explicitly appends another attempt. Failed attempts have
distinct sanitized outcomes (`query-timeout`, `query-error`,
`client-unavailable`, `response-cap`, `malformed-response`). A directory lock
prevents concurrent writers; after a killed process, inspect ownership before
manually removing its stale `fetch.lock`. Atomic JSON replacements make a
partially completed acquisition resumable. A killed process may leave an
unreferenced `.tmp` file; it is ignored, never treated as a completed receipt.

Source changes for the same label across cells are rejected, not overwritten.
The multi-query acquisition is a versioned export assembled over time, not a
claim of one PostgreSQL transaction snapshot. Export timestamps and full rows
make this limitation inspectable. New source/policy/exclusion/campaign versions
need a new output directory. Generated exports are evidence artifacts; do not
commit them without an explicit campaign freeze/review decision.

## Exact metadata and exposure boundary

Coefficients and large integer metadata are canonical decimal strings in
ascending power order, with the final monic coefficient `"1"`. Null class
number, class group, regulator, index and proof metadata stay null. An empty
class-group list means known trivial invariants; it is never manufactured from
a missing class group. When both class number and group are known their orders
must agree. Label degree, real-signature count and discriminant are checked
against source columns. Regulator decimals remain text, including scientific
notation; they are database metadata, not newly certified enclosures.

`--exposed-labels PATH` accepts a JSON array of historically exposed LMFDB
labels. It is canonicalized and hashed but **does not discard useful development
cases**. Selected matching records carry
`exposure: "historically-exposed-development-only"` and
`holdout_eligible: false`. All other records have exposure audit pending and
`holdout_eligible: null`, never an unsupported claim of being unseen.
Final holdout consumers must require `holdout_eligible === true` after a
separate completed exposure audit; `holdout_eligible !== false` incorrectly
accepts unknowns. This acquisition tool itself never emits `true`.

`--exclude-labels PATH` is a separate, explicit hard-exclusion list, also a
JSON array. Those labels remain in raw windows but cannot enter the candidate
list at all. Use this only when the acquisition policy really requires excluding
a field, not merely because it has already been examined.

`--campaign PATH` optionally binds
the parent campaign JSON and checks seed, degrees, target counts, missing-data policy and
absence of Sage.js-based selection. Supply the same options on resume. This
interface does not infer that unlisted labels are unseen: audit historical
fixtures, scratch evidence, all previous campaigns and isomorphic alternative
presentations before assigning final holdouts. This includes the old 1,000-field
cubic development set, every local fixture label, and newly examined probes
such as `3.3.49.1`, `4.2.283.1`, and `4.4.725.1`, alongside known quadratic and
torsion reference fields. The coordinator must assemble and pin that exposure
union; the tool does not silently infer one from whichever checkout is present.
Holdouts are not sealed by this
tool, and no candidate is assigned a final role.

Distinctness here is **LMFDB field label**, not polynomial hash. Repeated labels
from overlapping channels merge source-cell provenance only when raw records
agree. The tool does not establish irreducibility or field isomorphism itself.
Alternative polynomials and independent families must undergo exact
isomorphism reconciliation before they count as additional fields or cross a
development/holdout boundary.

## Subsequent selection gate

Use a separately frozen bounded PARI/Hecke screening schedule and the campaign
CPU ledger before freezing coverage. Keep timeouts and other censored cases.
Then select 200 fields/degree (120 development, 80 holdout) and 40 performance
fields/degree (24 development, 16 holdout), balancing signatures and the
available secondary mathematical strata with deterministic tie-breaking.
The performance panel needs at least 120 fields whose faster matched complete
reference request takes one second and at least 40 taking ten seconds; these
are global, not per-degree, quotas. Scalar class-number timings do not meet
that request. Publish shortfalls and revise the acquisition policy explicitly
if this bounded candidate pool cannot fill the panel. Do not prematurely
freeze the easiest 1,800 inputs and relabel them representative later.
