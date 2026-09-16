# Selected descriptor metadata: preparation boundary

Checkpoint 2026-09-15. This is a tested dependency removal, not an
`nfinit`-only entry, a full class/unit certificate, or a timing result.

`selected_ideal_metadata.py` is a source-transparent representation gather:
PARI's `FBgen`/`subFBgen` retain prime descriptors in `F->LP`, whereas the
experiment stores their fields in separate owners. The helper uses the
translated initial-base selector's active `KC` prefix of catalog indices to
copy prime, ramification index, residue degree, inert flag, and row-major tau.
It validates all selected scalar domains and storage before writing, preserves
output tails, and requires disjoint owners and mathematically consistent raw
descriptors. It does not compute prime decomposition or tau.

## What the checker now derives

`check_actual_initial_collector.cjs` derives both CPython and native inputs:

- Active descriptor metadata from the full raw descriptor catalog and the
  actual translated selection indices; selected reference groups are assertions
  only, including their tau/e/f fields.
- Admission offsets/counts and initializer groups from the translated base's
  selected rational primes, offsets, counts, and completeness flags.
- Admission support product from the translated base result, and search order
  from the translated subfactor permutation.
- Ideal HNFs/norms, exclusion flags, ball-volume scale, and subfactor-product
  policy through the previously connected translated helpers.

Generated CPython metadata is copied back into the exported `inputs` before
temporary result fields are removed. Each native backend regenerates the
metadata independently before calling downstream code. The selected tau/e/f
answers are no longer copied out of `expected.groups` into either execution
path. The full CPython collector exercises the generated metadata and generated
initializer groups; policy-only native tests stop before collection/HNF.

## Inputs and boundaries that remain external

- The maximal-order field, defining polynomial, discriminant-derived binary64
  `LOGD`, signature, precision, multiplication table, and embedding data remain
  prepared. This checker has not incorporated the separate new discriminant-log
  or analytic-attempt wrappers.
- The full decomposition catalog, raw prime generators, e/f fields, and tau
  matrices still come from PARI. In particular, `pr_get_tau` is computed upstream;
  moving it into a raw catalog does not make it part of `nfinit` automatically.
  Inert tau's scalar representation is encoded as the same zero matrix expected
  by the existing admission interface.
- The inherited prepared collector fixture still supplies its rational-prime
  table, batched products, factoring cutoffs (1,048,576 and 65,537 in field 1),
  embedding/reduction inputs, and mode/diagnostic configuration. These have not
  become translated field preparation merely because descriptor gathering is
  now native.
- The diagnostic harness still obtains initial quota/additional/target values
  and workspace capacities from its source fixture. It checks initializer
  counts, but does not claim a fully autonomous policy driver.
- Helper calls are host-orchestrated. Prime decomposition, automorphism and
  cyclotomic-unit branch checks, analytic reference preparation, and the full
  PARI oracle remain outside the candidate call. The source oracle deliberately
  overprepares descriptors; analytic-only primes need degree patterns, not all
  these descriptors, in a future faithful driver.
- The candidate scope remains initial collection/HNF without retries, honesty
  completion, class ideal generators, or fundamental-unit output. Reference
  results used for comparisons are not candidate answers.

## Receipts

All commands were metered through `meter_command.py`; no large native collector
closure was rebuilt and no performance comparison was run.

- Helper CPython/JS/GMP/tagged: 10 valid controls and 20 invalid controls pass,
  including huge signed tau entries, reordered/repeated selections, inert data,
  unused invalid index tails, and atomic validation failures.
  `/tmp/sagejs-selected-metadata-34vADX/result.json`.
- Actual field 1 policy, CPython/JS/GMP/tagged: 51 selected descriptors match
  PARI; `/tmp/sagejs-actual-initial-collector-s2E0at/fixtures.json`.
- Actual field 2 policy, all four paths: 143 selected descriptors match PARI;
  `/tmp/sagejs-actual-initial-collector-vrnEA6/fixtures.json`.
- Full field 1 CPython: 11 initialized relations become 58; HNF status 0, and
  exact relations, generators, logs, H/D/B/C and permutation match the source.
  `/tmp/sagejs-actual-initial-collector-9DEdus/fixtures.json`.
- Pinned Python formatter and diff checks pass. Architecture checks reach the
  pre-existing stale optimizer-opportunity manifest failure, not a new metadata
  classification failure. The generated C oracle initially exposed a quoting
  error during validation; it was fixed before the passing receipts above.
