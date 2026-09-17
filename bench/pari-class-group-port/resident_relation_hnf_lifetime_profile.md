# Resident relation-to-HNF compiler/lifetime profile

This is a read-only diagnostic of integration commit `944a12911`. It profiles
the generated arbitrary-precision native graph rooted at
`pari_connected_relation_hnf` and the same four frozen relation/HNF inputs used
by `check_connected_relation_hnf.cjs`. It changes neither the compiler nor the
generated kernel. The machine-readable ledger is
`resident-relation-hnf-lifetime-profile-20260917.json`.

## Boundary and method

`profile_connected_relation_hnf_lifetimes.cjs` verifies that the manifest's
source hash equals the checked-in Python source, extracts generated `native_*`
definitions by brace matching, and follows direct calls from the resident root.
It reports static generated-C sites, not guessed dynamic executions. Thus two
cleanup branches can contribute two `mpz_clear` sites even though only one
executes on a particular invocation. Owner sizes reproduce the exact workspace
synthesis in `check_connected_relation_hnf.cjs`; “logical” size stores each
current integer in its minimum whole-limb payload, while the fixed-capacity size
uses the existing diagnostic policy of 64 limbs per integer slot and four limbs
for `hnf_cup_*`.

## Result

- The root reaches all **199** arbitrary-precision native functions through
  **635** internal call sites and **365** distinct directed edges. Only one host
  native entry occurs per attempt, so JS/native crossings are not the issue
  inside this boundary.
- The reachable graph occupies **11,042,421 bytes** of generated C out of a
  **45,610,040-byte** core. The largest exact functions are
  `pari_hnfspec_sparse_prefix` (403,537 bytes), `pari_hnffinal_nonempty`
  (281,476 bytes), `_pari_flm_cup_frame` (251,145 bytes), and
  `pari_flm_lsolve_upper` (246,266 bytes).
- There are **0 `fmpz_init` and 0 `fmpz_clear` sites**. This path is currently
  emitted through the `mpz_t` native backend, despite the plan's generic use of
  “fmpz”. The actual graph contains **2,470 `mpz_init*` sites** and **4,934
  `mpz_clear` sites**.
- Exact-owner traffic is also broad: **825** integer-buffer-to-`mpz` reads,
  **547** `mpz`-to-integer-buffer writes, **4,800** machine-to-`mpz` sets,
  **57** `mpz`-to-machine gets, and **6,854** `mpz_set` copies.
- Every frozen case passes **202 buffer owners** and 1.39–1.47 million slots.
  Current-value logical storage is 15.2–16.1 MB, while the diagnostic 64-limb
  capacity policy reserves 452–481 MB. The latter is 29.7–29.9 times logical
  storage. This is live owner capacity at entry, not a peak-allocation claim.

## Decision and falsifiable next experiment

The resident exact-lifetime campaign is justified as a bounded A/B experiment,
not yet as a claim that lifecycle dominates runtime. The graph has one host
entry but thousands of per-function exact temporary lifecycle sites, hundreds
of owner conversions, and an approximately 30x gap between logical payload and
the current conservative capacity policy. This is exactly the compiler frontier
named by the plan; arithmetic would not explain these structural counts.

Implement one guarded compiler experiment: authenticate a root-owned `mpz`
scratch frame for this call graph, preserve the current fallback outside the
authenticated root, and reuse frame slots across non-overlapping callee
lifetimes. Reject the campaign unless a generated-C A/B on these unchanged four
inputs:

1. removes at least 75% of dynamically executed `mpz_init`/`mpz_clear` calls;
2. improves relation-to-HNF kernel CPU time by at least 3x; and
3. produces byte-identical owner state and outputs after every frozen prefix,
   including malformed/capacity/alias controls.

This threshold distinguishes a real lifetime win from source-size tidying. If
it fails, profile arithmetic inside the largest HNF functions rather than
extending the ownership campaign.
