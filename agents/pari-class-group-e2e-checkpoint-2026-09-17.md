# PARI class-group end-to-end checkpoint — 2026-09-17

This checkpoint records the honest state of
`pari-class-group-end-to-end-native-plan.md` after integration of the first
complete prepared real-cubic H1 root and the native diagnostic stage clock.
It is not a qualification result and does not weaken any plan gate.

## Current result

One prepared totally real cubic,
`x^3 - 20018*x + 20034`, now has a genuinely connected internal result:

- live relation collection and HNF state;
- exact H1 class correspondence;
- precision-retrying fundamental-unit reconstruction;
- exact unit norms, regulator, torsion, and final atomic publication;
- an independent cold-replay boundary;
- `correspondence_complete = true` and `public_complete = false`.

The last distinction is essential. PARI agreement and its assumed analytic
policy do not constitute Sage.js completion or certification.

The newer seven-pair development-host diagnostic has 14 samples per
implementation and median complete-root times of `942.830 ms` for Sage.js and
`11.488 ms` for PARI 2.17.4, an `82.07x` ratio. It is explicitly unqualified.
Its raw receipt has SHA-256
`45f778c300a0a51a6b3a039693d1a3b9a423afe9c5e4e7bde8f2a8eab1e1306f`
and records clean commit `68a90847708e2fe49ac9b07c13e51d5c53b31969`.
Both implementations now have real exclusive source-local duration partitions,
but their source cuts are not proved to be identical and therefore must not be
compared stage by stage. Within the Sage.js root, the median partitions are
`626.123 ms` for unit/regulator, `251.142 ms` for relation/retry, `64.037 ms`
for sparse HNF/SNF, `0.100 ms` for honesty/final, and `0.011 ms` unattributed.

A read-only allocator-count profile localizes a concrete compiler/runtime
frontier. The unit/regulator visits perform about 2.09 million `malloc` and
2.26 million `realloc` calls; relation/retry performs about 1.35 million and
0.54 million; sparse HNF/SNF performs about 0.67 million and 0.30 million. The
generated root is one native call, so the public JavaScript/native boundary is
not a plausible explanation. The first permitted compiler campaign will test
root-lifetime `fmpz` scratch/limb reuse; it must reduce allocation events by at
least 80% and target-stage time by at least 2x without changing any authority.

The honest predeclared campaign outcome at this checkpoint is therefore **D**.
The correctness prerequisite for Outcome C exists, but the required 80% gap
attribution does not.

## Phase coverage

| Phase | State | Closed evidence | Remaining gate |
| --- | --- | --- | --- |
| 0 — canonical spine | Partial | Required compiler and port histories are ancestors; pinned PARI 2.17.4 replay driver exists; architecture gate passes at `ba140b214`. | Publish a fresh durable full Phase-0 receipt at the combined commit and record the toolchain/resource ledger. |
| 1 — observability and ladder | Partial | Four-plus-twelve identities and the 24-field qualification population are frozen; all 16 development PARI traces are exported and hashed. | Natural random-relation, successful honesty, and precision coverage are absent from the performance population; Sage.js does not execute all 16 end to end. |
| 2 — relation/retry | Partial | Exact cubic collection, quartic repeated nonempty-`W` HNF appends, and isolated random-relation corridors exist. | Generic capacity growth, factor-base enlargement, natural random fallback, and all-sentinel closure remain. |
| 3 — exact envelope | Partial | H1 full Smith replay and field-3 `[2,2]` relation/Smith state exist. The field-3 live process retains and independently cold-replays all 186,560 exact cells required for the 288-by-301 presentation, factor-base ideals, generators, logs, provenance, permutations, and RNG/control state. | Decode those owners into a replayed full presentation, align it with the compact suffix, and publish exact generator-order and arbitrary-ideal witnesses; the 12-field envelope is open. |
| 4 — units/precision | Partial | The real H1 cubic performs exact source-derived units and retries from 192 to 2304 bits. The authentic mixed-quartic class logs now pass packed `cleanarch` across CPython, JavaScript, GMP, tagged, and pristine PARI. | The mixed-quartic `getfu` path still returns PRECI at 192 bits. Pristine PARI succeeds by 153024 bits, so a neutral high-precision owner/re-log retry and the development panel remain open. |
| 5 — honesty/final | Partial | One atomic H1 internal final result and mutation/replay contract exist. A field-neutral immutable correspondence envelope now provides canonical encoding, independent mathematical authority, tagged exact/PRECI/LARGE unit outcomes, honesty outcomes, atomic publication, and 15 adversarial mutations. A separate predeclared unequal-bound degree-five path authentically executes the successful six-ideal `be_honest` schedule with transactional rejection. | The envelope deliberately has no H1 adapter until Python replay has a trusted data-only cross-runtime identity. The H1 class group is trivial and its honesty path is an equal-bound skip. Nontrivial generator witnesses, mixed units, and a joined general final replay remain. |
| 6 — qualification | Partial | A real mutually exclusive seven-pair matched diagnostic conserves each root and leaves only `0.011 ms` median unattributed in Sage.js. | Source stage cuts are not cross-implementation-identical, the 80% cross-source gap attribution gate remains unmet, and the frozen 24-field qualification has not run. |

## Next falsifiable cuts

1. Decode and replay the newly authenticated full field-3 owners, reconstruct
   the full relation presentation, align its Smith coordinates with the
   published `[2,2]` suffix, and publish exact generator-order plus one
   arbitrary-ideal receipt.
2. Connect the live nontrivial mixed quartic
   `x^4 - 2000022*x - 2000042` through its existing signed `genback`, Smith,
   mixed `nf_cxlog`/`getfu`, class-generator, `cleanarch`, and final replay
   leaves. Its authenticated live endpoint has 288 factor-base rows, 301
   relations, `H = diag(2,2)`, and class invariants `[2,2]`.
3. Lift the neutral precision-resource graph to at least the proved PARI
   success bound of 153024 bits, regenerate precision-dependent embeddings and
   logs from the retained exact owners, and rerun `cleanarch`/`getfu` without
   answer-derived transformations.
4. Preserve the full relation/HNF provenance and exact generator-order
   witnesses. A compact identity witness or a rebuilt final-answer fixture is
   not a valid substitute. After those cuts, reassess the next development field from the frozen
   ladder. Do not broaden by selecting easier fields.

## Resource state

Rebuildable caches and inactive generated worktree products were cleaned before
this checkpoint. Active integration and lane artifacts were preserved. Bulky
corpus and replay artifacts remain under project-scoped `/scratch` storage.
