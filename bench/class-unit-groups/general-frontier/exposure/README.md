# Historical exposure inventory (developer-only)

This exporter is an **incomplete provenance inventory**, not a corpus freeze or
an isomorphism oracle. It performs no network access, CAS calls, timing, Sage.js
execution, native compilation, or opt activity. Never infer `unlisted = unseen`.

```sh
node bench/class-unit-groups/general-frontier/exposure/export.cjs \
  --manifest bench/class-unit-groups/general-frontier/exposure/historical-sources.local.json \
  --output /absolute/new/task-directory/exposure-inventory.json
node --test bench/class-unit-groups/general-frontier/exposure/test.cjs
```

The output parent directory must already exist; output creation is exclusive,
so an existing inventory cannot be overwritten. On missing sources, hash/schema
mismatch, malformed rows, or bounds violations, export fails instead of silently
omitting a source. Limits are 256 sources, 64 MiB per raw/decompressed source,
256 MiB aggregate raw inputs, and 100,000 evidence records/candidate records.
Do not commit generated inventory outputs.

## Explicit inputs and source coverage

`historical-sources.local.json` is a checked-in **local acquisition manifest**,
not a portable promise that scratch data exists. Its absolute retained-source
paths and relative tracked-fixture paths are intentional. Relative paths resolve
against the manifest directory. When relocating sources, create a new manifest
with explicit paths and unchanged raw SHA256 values; the manifest identity will
change. There is no directory discovery, cache scan, label regex extraction, or
fallback to another source.

The manifest schema is `sagejs.general-frontier/exposure-sources-v1`. It contains
`sources` and optionally `candidates`. Every source requires `id`, `kind`,
`category`, `path`, and `sha256`; optional `note` is human provenance. Unknown
manifest/descriptor keys and unknown kinds fail closed. Versionless historical
JSON formats are accepted only through their named, explicitly chosen adapter
with their known version/shape, never by automatic structural guessing.

| Source adapter | Input contract |
| --- | --- |
| `historical-3259-labels` | Exact sorted, unique 3,259-line historical union, SHA256 `b7dc806d98b62f02950f5273c9f50d4126ef9f93a67b1b1c9623f96d0ed4a188`; must be `historical-quarantine` |
| `legacy-cubic-out-of-sample` | `sagejs.benchmark/complex-cubic-lmfdb-out-of-sample-v1`, `records` |
| `frozen-cubic-survey-jsonl-gzip` | 1,012 explicit degree-3 `smoke`/`tune` records; compressed bytes pinned in manifest |
| `lmfdb-fixture` | The three explicit supported cubic/class-number/quartic fixture schemas |
| `class-unit-oracles` | Version 1 `cases`, `known_hard_cases`, and `invalid_inputs`; invalid inputs kept separately marked |
| `high-degree-oracles` | Version 1 high-degree oracle `cases` |
| `foundations-oracles` | `sagejs.number-fields/foundations-oracle-v1`, version 1 `fields` |
| `maximal-order-oracles` | Version 1 maximal-order `cases` with ascending polynomial objects |
| `quadratic-discriminants` | `sagejs.number-fields/quadratic-class-units-oracle-v1`; explicit `x^2-D` presentation derived from asserted field discriminant |
| `registered-neighbors` | Selection-only, not-benchmarked `sagejs.diagnostic/registered-neighbors-v1`; selected-record/label hashes and historical exclusion hash checked |
| `explicit-presentations-v1` | `sagejs.general-frontier/exposure-presentations-v1`, `records` with optional `id`, `label`, `coefficients`, `invalid` |

The local manifest covers the strongest recovered exclusion union, the old
1,730-field evaluated cubic corpus, the frozen 1,000 tuning fields plus 12
controls, 20 registered neighbors, and eight tracked fixtures. The original
1,815-label pre-survey exposure set has exact coefficient coverage from the
1,730 corpus plus the cubic-100/class-number fixtures. The 3,259 union also
conservatively quarantines the old 400 policy-held-out labels and earlier
tracked/neighbor labels; a quarantine entry does **not** certify actual execution.

The pinned local inputs currently yield 6,734 evidence records, 3,315 unique
source-asserted label strings, 3,428 unique coefficient arrays, and two declared
invalid records. These are inventory/presentation counts, **not field counts**.
There are 567 polynomial-only evidence records across all sources. The 365
degree-2-through-10 maximal-order presentations are only a subset, not the full
same-field reconciliation pool; all relevant polynomial-only and alternative
labeled presentations must be reviewed.
Current general-frontier pilots, inline polynomial constructions, additional
scratch experiments, and alternative-presentation reconciliation remain review
work; this manifest does not purport to cover them.

## Categories and candidate matching

Categories are source-owner assertions preserved per evidence record:

- `prior-sage-exposure`: prior Sage.js evaluation/development exposure.
- `historical-quarantine`: conservatively excluded historical material, which
  may mix actual evaluation, registered selection, or synthetic test labels.
- `selection-only`: acquisition or predeclared selection; not by itself Sage.js
  development exposure.
- `reference-only`: independent reference screening only; likewise not by
  itself Sage.js development exposure.

The historical fixture adapters do not deduce execution from an oracle name or
from a field appearing in a file. The supplied manifest quarantines ambiguous
fixture provenance conservatively. New reference/pilot records should use a
reviewed explicit presentation wrapper and an appropriate category. Do not
declare all newly acquired candidates exposed just because metadata was fetched.

Optional `candidates` is an explicit `{ "path": "...", "sha256": "..." }`
descriptor. That file must have schema
`sagejs.general-frontier/exposure-candidates-v1` and a `records` array whose rows
contain a unique string `id`, exact ascending `coefficients`, and optionally
`label`. This is intentionally not a generic reader for changing candidate-pool
receipt layouts; the freeze coordinator must explicitly construct this wrapper.

Matches use exact asserted label strings or exact canonical coefficient arrays.
Decimal strings remain exact; unsafe JSON numbers, noncanonical decimal forms,
trailing zero coefficients, degree contradictions, and unsupported schemas are
rejected. Candidates require a nonempty string ID and an actual coefficient
array even when a label is present. Records supplying both `coefficients` and
`polynomial` are rejected, even when the two aliases appear to agree.
Multiple polynomials sharing a label are retained, not silently
collapsed into one field. Label syntax validation proves no database membership.

Prior-Sage matches set `prior_sage_exposure: true`; otherwise it remains `null`,
never inferred false. Prior-Sage, historical-quarantine, or invalid-input matches
set `holdout_eligible: false`. Selection-only/reference-only and unmatched cases
keep it `null`. **The exporter never emits `holdout_eligible: true`.**

## Identity and outstanding reconciliation

Every evidence record binds its source ID/category, source record ID, exact
presentation, and canonical SHA256. Raw hashes, source descriptor paths, source
byte/count metadata, canonical manifest hash, exporter source hash, and final
canonical inventory hash are retained. Source descriptor ordering and normalized
record ordering are deterministic; reordering raw source bytes legitimately
changes their provenance hashes. Duplicate identical evidence is coalesced;
distinct evidence and all source witnesses remain represented.

`distinct_fields` remains null. Source-asserted signatures/discriminants, when
available, are only bucket hints. Equal discriminants are not isomorphism proofs;
different coefficient arrays are not proofs of different fields. For example,
`x^2-5` and `x^2-x-1` do not exact-match here. The foundations fixture's stated
isomorphisms remain in its hashed source and are not automatically certified.
The next reviewed stage must reconcile candidate and exposed presentations with
exact discriminants and same-field tests, propagate exposure across equivalent
presentations, audit missing/deleted historical sources and evaluated holdouts,
then explicitly decide final eligibility. Strict consumers must require
`holdout_eligible === true`; this inventory cannot supply that approval.

## Reproducible conservative reconciliation

`reconcile.cjs` implements the bounded next step without running CAS code:

```sh
node bench/class-unit-groups/general-frontier/exposure/reconcile.cjs \
  --manifest bench/class-unit-groups/general-frontier/exposure/reconciliation-inputs.local.json \
  --output /absolute/new/task-directory/conservative-reconciliation.json
node --test bench/class-unit-groups/general-frontier/exposure/reconcile.test.cjs
```

The explicit input manifest pins raw SHA256 values for the existing v2
`candidates-v2/pool.json`, exposure inventory, and class-unit oracle fixture.
It does not edit or refresh any input. The pool adapter checks schema/policy
versions, whole-pool/record/label hashes, unique labels, exact coefficients,
degree/signature consistency, and discriminants against canonical label parts.
The inventory's canonical digest and each evidence digest are checked too.

All historical label assertions contribute their degree, signature, and signed
discriminant, including the 442 cubic labels without coefficient arrays in the
pinned inventory. This is conservative bucketing, **not database membership or
an isomorphism assertion**. Exact-label and exact-coefficient matches retain
their distinct reason codes. Other compatible degree/discriminant/signature
matches are marked `possible-same-field-bucket-not-isomorphism`; the candidates
remain separate, including distinct fields with equal discriminants.

For coefficient-only class-unit oracle cases, source ID/kind and raw fixture
hash must agree with the inventory source. Case IDs bind the exact polynomial.
Only agreeing `sage_pari` and `magma` recorded field-discriminant/signature values
are joined. Conflicting metadata across these records, canonical labels, or
identical polynomials fails closed. The same consistency check includes every
candidate and additional-exposure assertion, not just historical records;
conflicting discriminants or signatures are rejected before bucket matching.
There are 16 per-case join receipts for the pinned fixture; eight distinct
polynomial buckets otherwise lacked field
discriminants after deduplication across all historical sources. There is no
need to recompute those discriminants with CAS for this conservative audit.

Missing metadata is not evidence of non-exposure: unresolved valid historical
presentations conservatively quarantine compatible degree/signature candidates
and are listed in `unresolved_metadata`. Declared-invalid presentations are
exact-match quarantines, not reasons to exclude every field of their degree.
Selection-only/reference-only observations retain reasons but do not trigger
historical quarantine automatically.

The pinned no-pilot replay yields 4,436 candidates, 14 quarantines, 4,422 not
quarantined, and zero unresolved metadata records. Seven quarantines are exact
coefficient matches; seven more are conservative same-discriminant buckets.
This preserves all 34 signatures. The output gives per-degree and per-signature
total/quarantined/not-quarantined counts, full per-candidate reasons, source
assertions, and metadata join receipts. The envelope binds every raw input,
canonical input manifest, exporter and normalization producer hashes, and result.

Optional `additional_exposure` is another explicit raw-hashed descriptor. Its
file must be:

```json
{
  "schema": "sagejs.general-frontier/additional-exposure-v1",
  "category": "historical-quarantine",
  "records": [
    {"id": "reviewed-pilot", "label": "2.2.5.1", "coefficients": ["-1", "-1", "1"]}
  ]
}
```

Each row needs a unique nonempty string ID and coefficient array; a canonical
LMFDB label is optional. The category is an explicit reviewer decision, not
inferred from pilot filenames, reference timings, or acquisition. The same four
categories apply. Quarantined additional labels also conservatively exclude
matching discriminant/signature buckets, not just their exact labels. Additional
unlabeled presentations without discriminants remain unresolved and block their
compatible degree candidates conservatively. Therefore this policy may exclude
more than an earlier exact-label-only pilot count; reasons are retained.

For this campaign, the 168 reference pilot labels must **not** be labeled prior
Sage.js exposure simply because they were screened. The separately reviewed five
actual Sage.js diagnostic presentations are `real-cubic-49`,
`mixed-quartic-283`, `real-quartic-725`, `3.3.1179905564504915820.14`, and
`4.2.1261504958441728000.28`. An explicit prior-Sage wrapper with their exact
diagnostic `case.coefficients` yields 39 total quarantines and 4,397 remaining
candidates under this same conservative policy; degree 3 retains 249 and degree
4 retains 300. Their diagnostic raw hashes and explicit canonical-label mapping
belong in a retained derivation sidecar, bound to the wrapper's raw SHA256.
This records exposure attempts, including timeouts, not authenticated timing.

The reconciliation does not grant coverage approval, count distinct fields,
assert that an unquarantined candidate is unseen, or emit true holdout
eligibility. Remaining candidates stay null until historical source coverage
and the final selection policy are explicitly reviewed. Optional exact same-field
tests may recover conservatively quarantined distinct fields later; they are not
required to reproduce this conservative result.
