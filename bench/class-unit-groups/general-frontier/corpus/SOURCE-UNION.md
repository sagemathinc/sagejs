# Offline acquisition-source union

`source-union.cjs` validates and combines the existing v2 candidate acquisition
with a separate hard-window acquisition. It performs no network request, CAS
computation, reference timing, exposure inference or final panel selection.

```sh
node bench/class-unit-groups/general-frontier/corpus/source-union.cjs \
  --v2-directory build/general-frontier/candidates-v2 \
  --hard-directory build/general-frontier/hard-windows-v1 \
  --output build/general-frontier/source-union-v1.json
```

The output must be a new file outside both source acquisition directories; its
parent must exist. Publication is exclusive and does not overwrite an earlier
union. The API `buildUnion(v2Directory, hardDirectory)` performs the same offline
validation and returns the union without writing files. Downstream readiness
checks can use its `records` as validated membership, not infer membership from a
numeric-looking label or accept a fabricated union merely because its digest is
self-consistent.

## Validation and retained identity

The v2 acquisition is reconstructed using `candidate-pool.cjs` `loadExport`,
which validates its export and raw receipts. The stored `pool.json` must exactly
match that reconstruction. The hard-window acquisition is reconstructed using
its existing offline `replay`, including pinned source versions, manifest,
dispatch and raw-result validation. No producer is modified or bypassed.

For every selected record, the union finds the actual selected raw row in its
source receipt and reuses exact `normalizeRow` semantics. Normalized `degree`,
`signature`, `r1`, `r2`, `unit_rank`, `discriminant_absolute`, `discriminant_sign`
and ascending exact-string `coefficients` remain directly accessible, alongside
the other original mathematical/source metadata.

The output has schema `sagejs.general-class-unit-source-union.v1`. Its records
have `source_kind: "validated-source-union-v1"` and an explicit `sources` array:

- `candidate-pool-v2`: export/pool identity, cell ID, attempt, raw-row hash and
  source-receipt hash;
- `hard-window-v1`: manifest/pool identity, window ID, raw-row hash,
  source-receipt hash and dispatch-ticket hash.

Top-level acquisition entries retain source-pool identities, identity-file byte
hashes, and the full cell/window status summaries. The v2 stored pool byte hash is
also retained. Errors, empty cells and pending/interrupted windows are not hidden
or converted into successful acquisition. A partial acquisition can produce an
explicitly partial union; later receipts require a newly published union.

Duplicate labels are combined only when **every normalized source field agrees
exactly**, including coefficients, null metadata, regulator text, index and proof
metadata. Conflicts identify the disagreeing fields and fail the whole operation.
There is no null-value enrichment or approximate-number reconciliation. Accepted
duplicates retain both source kinds and all contributing selected-cell/window
provenances. Records and provenance arrays have deterministic ordering.

## Limits

This validates source membership and consistency, not number-field isomorphism,
mathematical correctness or source completeness. Distinct labels and generated
presentations are not automatically deduplicated. Every record remains
`reference_time_band: "pending"` and `final_role: null`. Known historical exposure
from v2 stays `holdout_eligible: false`; otherwise exposure remains pending and
holdout eligibility is `null`, never `true`.

Top-level `frozen`, `qualification_evidence` and `independent_replay` are all false.
The latter concerns independent mathematical replay, not this offline acquisition
reconstruction. Existing generated-family reserves and separately declared
reference-cost rescue queues are unchanged. This tool does not consume Sage.js
outcomes to select or discard a candidate.

Offline fixture tests:

```sh
node --test bench/class-unit-groups/general-frontier/corpus/source-union.test.cjs
```
