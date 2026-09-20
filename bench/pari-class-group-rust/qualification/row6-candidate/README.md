# Row-6 Rust candidate diagnostic

This is an answer-free, candidate-only timing probe for
`x^3 - 2000000000010*x + 2000000000018`. It exercises the existing Rust
coefficient-box collector with bounded two-minute checkpoints and records
resource usage via Linux `/proc` sampling plus `getrusage(2)`.

The original shared Rust `PreparedCubic` API accepted only a unimodular `i64`
basis. Row 6's maximal order has index three in the equation order; PARI
2.17.4 gives the integral basis

```text
[1, x, (x^2 + x - 1333333333340) / 3].
```

The validated prepared-field path now represents that rational basis directly.
It derives maximal-order prime ideals as exact rank-three GMP lattices, handles
the index prime through the replayed multiplication algebra, and computes
valuations by membership in exact ideal powers. The older equation-order
diagnostics remain historical receipts; the executable's default route is now
the maximal order. Its output remains a relation-lattice candidate, not a
completed class group.

Run one checkpoint with:

```sh
./run.sh 1 120
```

The faithful translated collector is still protected by the
`UpstreamAssumedH1` capability and cannot be invoked for row 6. This is an
intentional truthful limitation, not a reason to weaken the capability.

`analyze_catalog.py` reproduces the factor-catalog ceiling and residue-scan
work directly from the neutral polynomial. It does not invoke PARI and does
not contain the class number or invariant factors.

## 2026-09-20 historical equation-order checkpoint

The coefficient-box path did **not** finish even at radius 1. The original
hard checkpoint terminated it after 120.022629029 seconds (22,568 KiB kernel
maximum RSS). A second instrumented run terminated after 10.014035887 seconds
and proved that the standalone factor base had already completed in
133.034173 ms with 1,202 ideals.

Bounded prefix probes then excluded the other setup stages:

- all 216 complete-prime initial cache rows took about 4.3 ms and left 986
  missing pivots;
- exact norm-form recovery took 2.080 microseconds, the prime sieve 0.274320
  ms, prime-product preparation 3.011099 ms, and the factor-base prime product
  0.054320 ms;
- radius-1 rational admission visited 24 shell points, tested 12 primitive
  canonical points, found one rationally smooth norm and rejected 11, all in
  0.035480 ms.

The first slow/failing boundary was the first smooth candidate's prime-ideal
valuation (`refine_element_factorization`). That candidate is `x - 1`, whose
norm is `3^2`, and the factor base has exactly one prime ideal above 3. In a
complete one-prime group the exact norm identity determines the local
valuation without repeated division. Adding that general shortcut eliminated
the hang: the same radius-1 command now finishes in 286.293295 ms, including a
134.080102 ms standalone factor-base construction and 146.891242 ms for the
collector's independently repeated factor base plus enumeration.

That completed diagnostic has 217 rows for 1,202 generators (216 seeded rows
plus the new `x - 1` relation), so it is visibly rank deficient and is not a
class-group candidate. This is also not evidence that the faithful row-6
algorithm is slow: the probe remains forced into the nonmaximal equation order
by that former boundary. It motivated the maximal-order bridge below.

`results/diagnosis.json` records the exact checkpoint and prefix measurements.
There is no full-rank relation presentation, candidate class group, HNF, or
Smith timing from this lane.

## 2026-09-20 maximal-order bridge

The new exact factor-base path derives bound 9,196 and exactly 1,130 ideals
over 740 rational primes. The 1,130 dimension agrees with the independently
recorded PARI prepared-field frontier; it is not supplied to the Rust runtime.
For the ramified index prime, the multiplication table proves the unique
character `[1, 1, 1]` modulo 3, its kernel has norm 3, and exact ideal powers
prove `v_P(x-1)=2`.

The radius-1 maximal-order run completes in 236.650092 ms including its own
factor-base construction; a separately timed factor-base construction takes
227.616573 ms. It begins with 203 independent rational relations and admits
one searched relation, leaving 927 of 1,130 pivots missing. A radius-64 run
visits 2,146,560 shell points in 3.015112088 seconds, admits ten searched
relations, and still leaves 918 pivots missing. The arbitrary-precision norm
front is required: even bounded radius-32 coordinates in this integral basis
can exceed `i128`.

These results close the representation/valuation blocker but also decisively
reject coefficient-box enumeration as the route to row-6 completion. The next
algorithmic milestone is to drive these exact maximal-order ideals through the
faithful small-norm/LLL relation schedule, continuation HNF, and completion
logic.

## 2026-09-20 generalized small-norm pass

The same maximal-order owners now drive a generalized totally-real cubic
embedding, exact LLL basis change, Fincke--Pohst cursor, arbitrary-precision
norm admission, and exact prime-ideal valuations. A 128-ideal prefix retains
372 searched relations and reaches 575 total rows in 1.153751821 seconds.

The complete deterministic first schedule visits all 1,130 ideals, examines
525,269 primitive nonscalar candidates, finds 3,687 smooth candidates, and
retains 930 searched relations. Together with 203 rational seeds this gives
1,133 rows in 8.803 seconds. The cache has modular rank 1,126, four short of
the 1,130 generators. Replaying the schedule with a deeper cursor produces
more smooth elements but no new rank. Thus the exact blocker has moved to
PARI's continuation/random-relation and sparse-HNF loop; it is no longer
factor-base construction, rational-basis arithmetic, embeddings, LLL,
enumeration, norm factorization, or local valuations.

## 2026-09-20 deterministic random continuation

The collector now implements PARI 2.17.4's XORGEN4096 stream, exact
factor-base ideal powers/products, quotient-norm admission for `R * P[j]`, and
batched random relation insertion. Quotient admission matters: the known
factorization of the divisor must be carried separately so an intentionally
omitted conjugate above a rational prime is not mistaken for a smooth active
factor-base contribution.

With fixed seed 1 and explicit limits of 12,000 searched ideals and 5.5
million primitive candidates, row 6 reaches modular rank 1,130/1,130 and has
no remaining supplementary-relation deficit. The completed relation
presentation contains 1,526 rows. It used 25 random ideals and 5,258 composite
search ideals after the deterministic first pass, completing in
111.942058868 seconds internally. Exact composite-ideal preparation accounts
for 88.357510296 seconds and is the dominant optimization target.

This is a completed relation lattice, not yet a class group. Exact scalable
HNF/Smith, unit reconstruction, regulator/completion evidence, saturation,
and public result construction remain mandatory. The raw bounded receipt is
`results/maximal-random-continuation-full-rank.json`.

## 2026-09-20 exact Smith candidate

A feature-gated qualification adapter now copies the complete signed `i64`
relation presentation into the repository's pinned FLINT 3.6 build and asks
FLINT for its exact Smith diagonal. This is deliberately a thin foreign-library
boundary: the normal-form algorithm remains in FLINT, and the adapter is not a
Sage.js product route.

On the captured deterministic run, relation collection produced the same
1,526 by 1,130 presentation in 109.219965760 seconds. FLINT's direct dense
Smith reduction took another 257.964417946 seconds and returned full rank,
invariant factors `[2, 2]`, and class number 4. Those exact candidate invariants
agree with the authenticated PARI 2.17.4 prepared-field result. The complete
Rust-plus-FLINT diagnostic took 367.195208203 seconds, versus PARI's
4.057270249-second prepared-field computation; these are not matched contracts
because PARI also completes units and certification while this route still
stops at candidate invariants.

This result proves that the answer-free Rust relation lattice encodes the
expected finite group. It does **not** establish that the presentation is the
full class group: this first bridge returns no transformations, generator
ideals, class/principality maps, units, regulator, saturation, or completion
certificate. It also shows that feeding the unreduced rectangular relation
matrix directly to dense Smith form is not a competitive linear-algebra
architecture. The next boundary is sparse/incremental HNF or lattice-basis
reduction with transformations, followed by Smith form on the reduced square
basis. The exact receipt is `results/maximal-smith-candidate.json`.

The immediate HNF-first control is also now measured. FLINT reduced the same
rectangular presentation to a square 1,130 by 1,130 row-lattice basis in
250.150881495 seconds; Smith form on that reduced basis then took only
13.394962874 seconds and again returned `[2, 2]`. Including a 109.919471376
second collector run, the route took 373.476580892 seconds. Thus basis reduction
does make the final Smith problem about nineteen times cheaper, but FLINT's
generic dense HNF simply moves almost all of the cost into the preceding stage.
This negative result rules out a superficial HNF-before-Smith rearrangement;
the next implementation must exploit sparse incremental relation insertion and
retain transformations as the lattice changes. The receipt is
`results/maximal-hnf-smith-candidate.json`.

The same feature-gated bridge can perform each three-dimensional LLL basis
change in FLINT while retaining Rust ownership of the ideal, embedding,
enumeration and relation logic. Values cross this experimental boundary as
decimal integers, and a focused exact test verifies the returned unimodular
transform against the existing Rust column-basis contract. On row 6 this
reduces the complete relation-collection time to 72.999378942 seconds. A direct
exact Smith reduction of the resulting (slightly reordered) 1,526-row lattice
again gives `[2, 2]` and class number 4, so the optimization preserves the
candidate group. The direct Smith stage remains 256.534886485 seconds and is
unchanged, as expected. The receipt is
`results/maximal-flint-lll-smith-candidate.json`.

This is a meaningful collector improvement, not yet the competitive endpoint.
The broad numerical-preparation bucket falls from 88.36 to roughly 52 seconds,
which shows that high-precision embedded Gram--Schmidt and repeated per-ideal
setup now dominate that bucket. Fine-grained preparation timings and reusable
workspaces are the next collector optimization boundary.

Fine-grained measurement rejects that provisional workspace hypothesis. Of
51.489715053 seconds charged to numerical preparation on the exact-FLINT-LLL
route, 51.354673344 seconds are inside LLL and only 0.108516933 seconds are in
the subsequent embedded high-precision Gram--Schmidt and bound construction.
Switching FLINT's Gram mode from `EXACT` to `APPROX` produced essentially the
same 51.15-second LLL time, so the accepted qualification route retains the
stronger exact mode. The next collector experiment must reduce repeated LLL
work or its value-conversion/call boundary, not optimize archimedean storage.
The exact-mode receipt is `results/maximal-flint-lll-profile.json`.

## 2026-09-20 compact candidate class map

Smith transformation data is now retained in compact form instead of stopping
at invariant factors. After the square HNF basis is constructed, FLINT computes
Smith transforms and the bridge exports each of the 1,130 factor-base
generators' two coordinates modulo 2. Rust independently evaluates every one
of the 1,526 original relation rows under this map; all map to zero. The 2,260
binary coordinates are recorded losslessly, generator-major and least-
significant-bit first, in `results/maximal-class-map-candidate.json`.

On the captured run, collection took 72.337437820 seconds, generic HNF took
252.549092196 seconds, and Smith transformation plus compact map extraction
took 2.389889556 seconds. This is a genuine candidate homomorphism from the
factor-base presentation to `C2 x C2`, not merely an invariant-factor match.
It still does not prove HNF provenance without its left transformation, furnish
principal elements, select generator ideals with order witnesses, or prove
that the relation lattice is complete. Those remain R2/R3 gates.

## 2026-09-20 determinant-certified incremental HNF

The relation cache's rank-changing rows now define a deterministic square
starting basis. Replaying the 1,526-row presentation through the same modular
rank filter selects exactly 1,130 source rows without inspecting the expected
class group. Generic FLINT HNF on that square matrix takes 45.791380395 seconds.
Its determinant is only 306 bits and its largest entry is 300 bits, establishing
that the starting lattice is tractable rather than an uncontrolled coefficient
explosion. The exact diagnostic is
`results/maximal-square-hnf-profile.json`.

The accepted route computes that square determinant, uses it as the certified
elementary-divisor multiple for FLINT's modular HNF, then appends the 396
omitted relations and performs a second modular saturation. On the captured
run, exact determinant computation took 4.777826847 seconds, initial modular
HNF 27.544016676 seconds, and saturation 3.287743253 seconds. The determinant
falls from 306 bits to the 3-bit value 4, and the final basis contains only
2-bit entries. Smith transformation plus compact class-map extraction takes
2.372440047 seconds.

The complete answer-free run takes 109.415094493 seconds: 71.212692777 seconds
for collection and about 38 seconds for selection, exact linear algebra, map
construction, and verification. It again gives invariant factors `[2, 2]`,
class number 4, and all 1,526 original relation rows map to zero. This replaces
the earlier 252.55-second generic rectangular HNF with an exact algorithm that
uses the collector's phase-lifetime information. The receipt is
`results/maximal-incremental-hnf-class-map.json`.

This remains a candidate computation. The modular HNF bridge currently exports
the final lattice basis but not the provenance needed to reconstruct principal
elements from relation generators. Unit reconstruction, regulator/completion
evidence, honesty/saturation checks beyond the collected presentation, and the
public polynomial-to-result route remain required.
