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
not a plausible explanation. The first permitted compiler campaign tested
authenticated root-lifetime GMP scratch frames. It preserved the exact H1
authority digest and reduced median root callback allocation events from
7,210,445 to 34,813, a 99.52% reduction. The fixed time gate nevertheless
failed: relation/retry improved 1.51x, HNF/SNF 1.69x, and unit/regulator 1.26x,
all below the required 2x. Allocation-event count is therefore not the dominant
remaining H1 wall-time mechanism, and the campaign stopped without fmpz parity.

The honest predeclared campaign outcome at this checkpoint is therefore **D**.
The correctness prerequisite for Outcome C exists, but the required 80% gap
attribution does not.

## Phase coverage

| Phase | State | Closed evidence | Remaining gate |
| --- | --- | --- | --- |
| 0 — canonical spine | Partial | Required compiler and port histories are ancestors; pinned PARI 2.17.4 replay driver exists; architecture gate passes at `ba140b214`. | Publish a fresh durable full Phase-0 receipt at the combined commit and record the toolchain/resource ledger. |
| 1 — observability and ladder | Partial | Four-plus-twelve identities and the 24-field qualification population are frozen; all 16 development PARI traces are exported and hashed. | Natural random-relation, successful honesty, and precision coverage are absent from the performance population; Sage.js does not execute all 16 end to end. |
| 2 — relation/retry | Partial | Exact cubic collection, quartic repeated nonempty-`W` HNF appends, and isolated random-relation corridors exist. | Generic capacity growth, factor-base enlargement, natural random fallback, and all-sentinel closure remain. |
| 3 — exact envelope | Partial | H1 full Smith replay and field-3 `[2,2]` relation/Smith state exist. The field-3 live process retains and independently cold-replays all 186,560 exact cells. All 301 principal relations replay exactly against the 288 retained factor-base ideals. A bounded canonical-HNF route proves rank 288, invariant factors `[2,2]`, order 4, exact suffix alignment, and an arbitrary-ideal receipt with an independently checked principal quotient. The exact 301-by-13 transform has been bound into the immutable field-3 composer: all 3,744 relation-kernel entries vanish, source-order packed replay matches every HNF/append checkpoint and terminal `A`, and both compact unit columns have exact kernel witnesses. | Generalize beyond the one field and close the 12-field envelope. |
| 4 — units/precision | Partial | The real H1 cubic performs exact source-derived units and retries from 192 to 2304 bits. The authentic mixed-quartic class logs pass packed `cleanarch` across CPython, JavaScript, GMP, tagged, and pristine PARI. Neutral 153088-bit packed Python/GMP probes match pristine PARI exactly for pi, log(2), exp(log(2)), and exp(log(2)+i). A source-matched full-product branch lowers ordinary Python `mx * my` to GMP `mpz_mul` above the pinned host's 3520-bit PARI threshold; the requalified complex probe falls from 380.346 to 170.488 seconds. The first authentic field-3 scalar relation-log column is regenerated from exact owners at 153088 bits and is packed-equal to PARI. A fresh exact prepared-basis owner supports a field-specific root/embedding rebuild: all four realified roots and all 16 `make_M` entries match PARI bit-for-bit across CPython, JavaScript, and GMP, while independent exact tensor and embedding-homomorphism identities pass. PARI's 153088-bit real AGM logarithm path is also ported source-transparently and matches 7/7 packed cases, including an authentic field-3 root and both sides of the series/AGM dispatch boundary. | The high-precision complex AGM logarithm branch and batched replay for the remaining field-3 columns, regulator, and unit solve remain open. |
| 5 — honesty/final | Partial | One atomic H1 internal final result and mutation/replay contract exist. A field-neutral immutable correspondence envelope provides canonical encoding, independent mathematical authority, tagged exact/PRECI/LARGE unit outcomes, honesty outcomes, and atomic publication. The field-3 composer now seals and separately publishes an authentic internally correspondence-complete result: class `[2,2]`/order 4, both generator ideals, exact arbitrary-ideal quotient, 3,913-entry transform, two 301-factor compact units of norm +1, source-order packed replay, torsion 2, and faithful `not_given(PRECI)`. It rejects 23 mutations and remains `public_complete=false`. A separate predeclared unequal-bound degree-five path authentically executes successful `be_honest`. | The envelope still has no qualified H1 adapter, independent Sage.js certification remains absent, and a joined general final replay beyond the one field remains open. |
| 6 — qualification | Partial | A real mutually exclusive seven-pair matched diagnostic conserves each root and leaves only `0.011 ms` median unattributed in Sage.js. Compiler campaign 1 preserved the exact result while removing 99.52% of callback allocation events; only 1.26x–1.69x stage gains prove allocation count is not the dominant residual gap. | Source stage cuts are not cross-implementation-identical, the 80% cross-source gap attribution gate remains unmet, and the frozen 24-field qualification has not run. |

## Next falsifiable cuts

1. Extend the now-sealed field-3 owner/result machinery to the remaining
   predeclared development sentinels without field-specific answer fixtures.
   Preserve the exact relation kernel, source-order packed replay, separate
   publication authority, and `public_complete=false` certification boundary.
2. Connect the live nontrivial mixed quartic
   `x^4 - 2000022*x - 2000042` through its existing signed `genback`, Smith,
   mixed `nf_cxlog`/`getfu`, class-generator, `cleanarch`, and final replay
   leaves. Its authenticated live endpoint has 288 factor-base rows, 301
   relations, `H = diag(2,2)`, and class invariants `[2,2]`.
3. Use the now-qualified neutral 153088-bit packed primitive corridor to
   regenerate the field's precision-dependent embeddings and logs from exact
   owners, then rerun `cleanarch`/`getfu` without answer-derived
   transformations. The successful neutral real and complex probes do not by
   themselves close this field-specific cut.
4. Preserve the full relation/HNF provenance and exact generator-order
   witnesses. A compact identity witness or a rebuilt final-answer fixture is
   not a valid substitute. After those cuts, reassess the next development field from the frozen
   ladder. Do not broaden by selecting easier fields.

The bounded full-presentation checker at integration commit `e635ce176` used
2,637,224 KiB peak aggregate RSS. It reduced the 301-by-288 source lattice to
288 canonical HNF rows with 555 nonzero entries, then verified the presentation
invariants and order. The generic source-transform route is not an alternative:
it exceeded the four-GiB campaign ceiling before reaching a result.

The first field-specific 153088-bit log replay used 2,108,868 KiB peak
aggregate RSS and 99.663 seconds wall time at integration commit `5083d897a`.
It authenticates the exact hard-quartic owners, regenerates the scalar-2 column
as `(log(2), log(2), 2*log(2))`, and matches all six packed scalar fields with
PARI. It publishes only one of 301 columns and explicitly derives no accepted
lattice or regulator.

The integrated high-precision full-product branch agrees exactly with PARI,
CPython, JavaScript, GMP, and tagged execution at and around the tune-dependent
3520-bit cutoff and at 153088 bits. A 42.7x operand-size increase costs about
5.2x rather than the 1824x quadratic-size ratio. Requalification preserves all
packed outputs; the complex neutral root now uses 170.488 seconds arithmetic
and 1,228,256 KiB peak RSS, versus 380.346 seconds before the branch.

The field-specific 153088-bit embedding probe atomically retains polynomial,
signature, exact integral-basis numerator/denominator data, multiplication
tensor, and run identity. All four exported root components and all 16
`make_M` entries are packed-exact. Closing the former one-ulp discrepancy
required preserving PARI's source operation graph: evaluate the numerator
basis with its common denominator 37 still present, then divide every column by
37. Algebraically cancelling that factor earlier changed one rounding decision;
no answer-derived correction is used.

The 153088-bit real AGM logarithm port matches all seven pristine-PARI packed
triples, including six AGM cases, one series-side cutoff case, exponent shifts,
and one authentic field-3 real root. CPython, generated JavaScript, and GMP
agree. The focused GMP batch used 96.266 seconds arithmetic and 1,298,336 KiB
peak aggregate RSS. Complex AGM remains a separate open cut.

The authentic field-3 composer publishes internal envelope SHA-256
`95925cadcaa3073f8b90b44e4bb8d785e49290c398c42cb41ba10314e347f08a`.
Its two compact units each have 227 nonzero raw-principal factors and exact norm
`+1`; the exact relation-kernel identities also hold after the compact
rank-two transformation. Publication is separately authorized, atomic, and
idempotent. This is PARI-correspondence completeness, not independent Sage.js
certification, so `public_complete` remains false.

## Resource state

Rebuildable caches and inactive generated worktree products were cleaned before
this checkpoint. Active integration and lane artifacts were preserved. Bulky
corpus and replay artifacts remain under project-scoped `/scratch` storage.
