# Row-6 Rust candidate diagnostic

## Compact presentation-index invariant

For the final small-surplus presentation, let `R = [A; B]`, with `A` the
selected square relation block and `B` the surplus rows. The exact
small-surplus kernel has rows `C = (-Z | Y)` satisfying `C R = 0`.
Qualification exports `D = |det(A)|`, not only its bit length. A downstream
verifier proves that `C` is the full integral left kernel by checking its rank
and a gcd-one certificate made from exact maximal minors of the small-row
matrix `C`. It then computes `K = |det(Y)|` and checks

```text
K > 0,       D % K == 0,       D / K == claimed class-group order.
```

This is equivalent to the full presentation index: the left kernel is
primitive, projection to the surplus coordinates has image `row(Y)`, and the
surplus rows enlarge `row(A)` by index `K`. The certificate therefore avoids
enumerating 1130-row minors of `R`; it does not infer saturation from replay or
rank alone.

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

Fine-grained measurement first showed that the unfiltered random continuation
spent 50.452 seconds in repeated LLL across 6,388 ideals; direct GMP-to-FLINT
copying saved only about 0.9 seconds. Feeding the modular cache's unresolved
pivots back into ideal selection changes the algorithmic work instead: the
accepted trace visits 1,167 ideals, including only 37 random searches, and
spends 0.541 seconds in LLL. Its complete collection time is 7.673 seconds.
Only 14.4 milliseconds are spent in archimedean Gram--Schmidt and bound
construction. The exact-mode receipt is
`results/maximal-flint-lll-profile.json`.

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

The continuation now closes the feedback loop already implicit in PARI's
`need`/`L_jid` policy. After the first schedule, the finite-field relation
cache exposes four coordinates whose diagonal pivots remain zero. Each seeded
random ideal is tested only against those unresolved factor-base ideals, and
the target list is recomputed after every rank gain. This reduces random
searches from 5,258 to 37 and retains exactly 1,130 independent plus seven
supplementary relations. It is a modular search heuristic only: the subsequent
arbitrary-precision HNF and all-relation Smith-map check remain the authority.

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
run, exact determinant computation took 4.925233197 seconds, initial modular
HNF 30.197258869 seconds, and saturation 3.243619535 seconds. The determinant
falls from 306 bits to the 3-bit value 4, and the final basis contains only
2-bit entries. Smith transformation plus compact class-map extraction takes
2.347174184 seconds.

The complete answer-free run takes 48.561829883 seconds: 7.643504352 seconds
for collection and about 41 seconds for selection, exact linear algebra, map
construction, and verification. It again gives invariant factors `[2, 2]`,
class number 4, and all 1,137 original relation rows map to zero. This replaces
the earlier 252.55-second generic rectangular HNF with an exact algorithm that
uses the collector's phase-lifetime information. The receipt is
`results/maximal-incremental-hnf-class-map.json`.

## 2026-09-20 exact order and compact principal witnesses

A direct `fmpz_mat_hnf_transform` control on the complete 1,137 by 1,130
relation matrix is not viable. It was stopped after five minutes with no
result after resident memory had exceeded 9 GiB. The issue is provenance
coefficient growth across a dense 1,137 by 1,137 unimodular transform, not the
relation lattice or the final four-element quotient. This rejected control is
retained in the bridge as a focused small-matrix oracle, not as the row-6
route.

The first accepted provenance route used the phase lifetime explicitly. It
reduced the selected square basis without a transform, computed a transform
only while adjoining the seven surplus rows, and solved each target back
through the original square matrix. That proved the certificate existed, but
the transform-oriented implementation still took about 35 seconds.

The current route is substantially narrower. For a target `t`, selected square
matrix `A`, and seven surplus rows `B`, it solves

```text
x A + y B = t
```

by one fraction-free solve against `A^T`, followed by affine congruences modulo
`det(A)` in only eight variables: the seven coordinates of `y` plus one fixed
target coordinate. The bridge obtains a final-coordinate-one solution by an
exact Bezout reduction, reconstructs `x`, and replays the complete witness
against every source column before returning it. No 1,137-square provenance
transform is built.

The resulting targets are twice factor-base generators 8 and 6 (zero-based),
whose compact Smith coordinates are respectively `(1, 0)` and `(0, 1)`.
The current affine witnesses have 876 and 878 nonzero coefficients, with
maximum coefficient sizes of 594 and 304 bits. Every referenced relation retains the exact
integral-basis element whose principal ideal produced it, so each witness also
encodes a compact principal element as the product of those elements to the
signed relation coefficients.

The class-order call now returns an owned phase-lifetime workspace containing
its fraction-free LU, permutation and exact determinant. The affine witness
call consumes that same workspace instead of repeating the factorization, and
the workspace is freed automatically after the phase. A representative run
spent 2.75 seconds in relation collection, 3.39 seconds in the single square
factorization, and only 0.307 seconds constructing both generator witnesses.
The complete answer-free row-6 run is 8.14 seconds. The authenticated PARI
2.17.4 prepared-field control is 4.057 seconds, so the former roughly 16-fold
gap is now about 2.00-fold while retaining the previously omitted
generator-order evidence.

The independent Sage.js result boundary also passes. It reconstructs the two
selected prime ideals, validates 879 distinct source relations, validates the
exported prime-power lattices, handles the single residue-degree-two prime via
an independent Sage.js factorization, and proves both principal relations. The
certificate verifier itself took 12.07 seconds after construction of the field
object. The executable nine-cubic receipt records successful independent
verification for every case in
`results/sagejs-open-cubic-public-boundary-replay.json`.

Together with the later unit-lattice and analytic-completion stages, these
witnesses establish the selected generator orders in the conditionally
complete class group. They do not yet provide arbitrary ideal discrete logs or
principal generators through the public Sage.js API.

## 2026-09-20 saturated relation kernel and unit lattice

The exact FLINT bridge now computes the saturated left kernel of the full
1,137 by 1,130 relation matrix rather than treating the seven surplus rows as
mere rank insurance. It returns seven independent integer dependencies in
1.63 seconds externally (1.57 seconds inside FLINT), and both the C boundary
and Rust replay verify every dependency against all 1,130 relation
coordinates. The largest dependency coefficient is 316 bits.

Each dependency is also a compact exact unit candidate: a product of the
retained principal relation generators to signed powers. At 4,096-bit
precision their logarithmic embeddings satisfy the product formula to far
more precision than is needed here. Rational reconstruction recovers the
rank-two unit lattice from the seven highly redundant candidates. The exact
coordinate data is unchanged when reconstructed independently at 2,048 and
4,096 bits. Its selected two-vector lattice has index

```text
633864164639955485156933800558027338788037545076700998940971649147252552428274422
```

in the reconstructed lattice. Flattening the resulting two basis vectors all
the way back to the original relation generators again annihilates every
finite relation coordinate exactly. Recomputing the determinant from those
flattened compact units gives

```text
83268030694439630.29650600032488368532504410209...
```

which agrees with the independent PARI 2.17.4 value
`83268030694439630.296506000324883685321...`. The Rust diagnostic takes 9.79
seconds total: 7.83 seconds collecting relations, 1.63 seconds for the exact
kernel, 0.24 seconds for 4,096-bit logarithms, and 0.024 seconds for lattice
reconstruction plus flattened replay. The full sparse receipt is
`results/maximal-unit-lattice.json`.

This was initially an R3 candidate milestone. The rational-reconstruction
denominator ceiling is a generous diagnostic bound derived from the observed
exact kernel coefficient size, not a theorem-derived bound. A direct Arb pass
reevaluates
the two flattened compact units from the exact polynomial, integral basis,
relation generators and exponents. It emits a 4,096-bit outward dyadic
regulator enclosure whose decimal value begins
`83268030694439630.296506000324883685320925...`. This pass notably detects
that the heavily cancelled MPFR diagnostic, while agreeing for about 47
significant decimal digits, is not inside the much narrower Arb enclosure.
The Arb pass adds about 0.18 seconds and is the regulator authority.

The follow-up now supplies the missing analytic authorities. It enumerates every
rational prime below the exact cutoff `23994`, authenticates each maximal-order
splitting type (including the index prime `3`), and aggregates 6,291 raw terms
to 1,656 exact Belabas--Friedman prime-power terms. A 512-bit Arb computation
proves the explicit tail strictly below `1/4`. Combining the resulting zeta
residue enclosure with the exact class candidate, exact compact units, and
rigorous regulator gives the class-unit index interval

```text
[838409711, 1382165893] * 2^-30
```

or approximately `[0.78083, 1.28725]`. The product of the candidate class
index and candidate unit index is a positive integer, so this interval proves
that product is one. Both indices are therefore individually one. Conditional
on the GRH hypothesis in the Belabas--Friedman bound, row 6's prepared-field
class group is exactly `C2 x C2`, and the two retained compact units form a
fundamental system. This conclusion no longer depends on the heuristic
rational-reconstruction denominator ceiling: reconstruction proposes exact
compact units; exact replay, direct Arb evaluation, and the analytic
index-one proof certify them.

The same exact splitting stream independently proves the factor-base
generation premise. At exclusive bound `9197`, an outward-Arb evaluation of
the strict Belabas--Diaz y Diaz--Friedman inequality has margin
`0.003663352078084927024143978104206706... > 0`. Hence, under its stated GRH
hypothesis for unramified class-group characters, the retained prime ideals of
norm at most `9196` generate the full class group. This closes the mathematical
honesty gap for this prepared field; it is not merely the earlier PARI
floating-point bound replay.

The final combined diagnostic has a three-run median of 7.6025 seconds: 2.76
seconds for relation collection, 3.71 seconds for exact class-order and
saturated-kernel determination, 0.24 seconds for logarithmic embeddings, 0.82
seconds for unit reconstruction/replay including 0.62 seconds for both
analytic certificates. The class-order stage no longer constructs a 1,130-dimensional
HNF. A single fraction-free LU decomposition computes the 306-bit determinant
of the selected square relation basis and solves the seven surplus rows in that
basis; the solve itself is about 0.16 seconds.

The congruence kernel now stays in its actual dimension. Starting from
`Z^7`, it intersects one congruence at a time, using an extended-GCD basis
change and a 7 by 7 HNF after every effective constraint. This replaces the
former 1,137-dimensional rational nullspace: the surplus-kernel phase falls
from 1.83 seconds to about 0.003 seconds. Its saturated basis already contains
the seven full relation dependencies, so the terminal unit stage reorders and
reuses them instead of separately recomputing a 1,137 by 1,130 left kernel.
That formerly 1.47-second pass now costs about 0.0006 seconds. Every exported
dependency is replayed against every relation coordinate. Exact rank modulo
two is two, distinguishing `C2 x C2` from `C4`, and differential tests compare
the small-surplus order and dependency construction with direct Smith form on
independent small presentations.

The complete mod-2 map uses a packed-bit row-echelon kernel specialized to
GF(2), rather than FLINT's word-per-entry generic modular matrix. This retains
the same exact two-character map and selected generators while removing about
0.16 seconds of representation overhead.

The same pass takes the right nullspace of the complete relation matrix modulo
two. Because the exact class order is four and the exact 2-rank is two, this
dual character map is an isomorphism onto `C2 x C2`, rather than merely a
modular diagnostic. It assigns coordinates to all 1,130 factor-base ideals,
annihilates all 1,137 relations, and selects independent concrete generator
ideals above 11 and 19. Thus the fast completion path now retains a usable
ideal-to-class map without constructing the large Smith transform.

The collection gain comes from an exact bounded-valuation observation, not
from skipping verification. Once `Norm(element) / Norm(divisor)` has been
factored, its rational-prime exponent is a rigorous upper bound for all
additional prime-ideal valuations above that prime. The old generic membership
loop still constructed `P^(v+1)` to prove that a valuation known to be at most
`v` was not larger. The new route checks every required divisor membership but
returns at the norm-proved cap. On this run, prime valuation plus relation-cache
time fell from 5.42 seconds to 0.52 seconds. The receipt retains the exact
stage profile and all collector counters; they are unchanged from the prior
route.

This is not a qualified performance result: the current Rust incremental HNF
is still used by the separately retained map/witness path, and the command
emits a large diagnostic receipt. The prepared-field class-and-unit
certificate itself no longer depends on that expensive HNF.

For orientation, the closest available PARI 2.17.4 instrumented boundaries
from the frozen row-6 campaign compare as follows. These are deliberately
called *closest* rather than identical: the Rust terminal row explicitly
constructs a saturated left kernel and a separately replayable rigorous
analytic certificate, while PARI's timers place some corresponding work inside
its HNF driver.

| closest region | Rust diagnostic | PARI 2.17.4 instrumented | ratio |
| --- | ---: | ---: | ---: |
| relation side | 2.758939 s | 1.100174 s | 2.5077x |
| shared determinant/solve and exact class-order/map kernel / matrix side | 3.713325 s | 2.791358 s | 1.3303x |
| explicit units, regulator and analytic completion / terminal residual | 1.130273 s | 0.009196 s | not algorithmically matched |
| complete external diagnostic / instrumented control | 7.602536 s | 3.900729 s | 1.9490x |

Against the pristine PARI total of `3.886499614` seconds, three consecutive
Rust runs take 7.6018, 7.6025, and 7.6418 seconds. Their median is `1.9561x`
PARI, passing the row-6 `<= 2x` median gate. The remaining latency is localized
to relation collection and especially the 1,130-square fraction-free
decomposition, rather than surplus processing or a duplicated unit kernel.

The median-run sparse receipt is `results/maximal-unit-lattice.json` (SHA-256
`ce367a8f88174d91f4c5b0941f2ad0152d8f3ed9dfbe5e25688e1399766822c0`).
The three raw timing records, their receipt hashes, the frozen PARI control,
and the machine-readable gate decision are in
`results/competitive-timing-repeats.json`.
An initial Linux resource observation records about 78.3 MiB peak sampled RSS
and a 19.8 MB stripped, 7.8 MB gzip-compressed standalone qualification
executable in `results/linux-resource-observation.json`. The executable
statically includes FLINT, OpenBLAS, MPFR and GMP; it is not the planned lazy
browser artifact and therefore is not a browser payload-gate measurement.
Public generator/result construction, a production honesty-extension policy,
unconditional certification, and the public polynomial-to-result route remain
required; this prepared-field diagnostic does not authorize production
dispatch.

## 2026-09-20 neutral prepared-field ingress

The complete engine now also accepts the qualification suite's answer-free
`neutral-prepared-field` JSON contract. JSON parsing alone confers no trust:
the Rust ingress replays the cubic irreducibility witness, rational integral
basis, equation-order index and its complete prime support, discriminant,
signature, and all 27 multiplication-table structure constants before it can
construct a `ValidatedPreparedCubic`. Nonintegral structure constants and
tampered discriminants have focused rejection tests. The contract carries no
class number, relations, units, regulator, or class map.

Running the entire row-6 computation from
`inputs/row6-neutral-prepared-field.json` again returns the exact conditional
`C2 x C2` class group, complete map, fundamental compact units, rigorous
regulator enclosure, and analytic class/unit index one. Its first measured
total was 7.583400901 seconds. After deleting timing fields and the transport
input identifier, the complete output has SHA-256
`ba0900d4856e54b08a18ce2707f66092dfe1db3edd99ff302cda81d1eb27dd5d`;
the legacy compiled-fixture route has the identical digest.

This closes the compiled-in-row-6 dependency for the prepared-field engine.
It does not close public completeness: the checked-in preparation is still
marked as coming from an independent preparation authority. The next boundary
is a Sage.js-certified polynomial-to-prepared-field adapter, followed by the
same replay validation and a multi-field differential corpus. The compact
evidence is `results/neutral-prepared-input-replay.json`.

The same executable has now crossed two additional prepared-field boundaries.
H1, whose maximal order equals its equation order, completes with trivial class
group and analytic class/unit index one in 0.693218116 seconds. The independent
index-three row-1 preparation completes with cyclic class group `C3` and index
one in 0.702380143 seconds. The latter cannot use the elementary-2 map: the
engine automatically constructs an exact incremental HNF and Smith transform,
checks that every relation maps to zero, and retains a concrete prime-ideal
generator. No class-group answers occur in either runtime input.

This also corrected a subtle cross-precision test. Rational unit coordinates
at 2,048 and 4,096 bits can legitimately select bases related by a unimodular
swap; literal array equality rejected H1. The replay now solves for the exact
rational basis change, requires determinant `+1` or `-1`, and checks every
coordinate. A non-unimodular scaling is rejected by a focused test. The three
case receipt is `results/prepared-cubic-generalization.json`.

## 2026-09-20 multiplier continuation control

PARI 2.17.4 interleaves deterministic `P_0^e P_j` small-norm passes with
sparse-HNF feedback and `trim_list` before switching to random relations. A
controlled port of the multiplier passes without that feedback was rejected.
One complete untrimmed pass searches 1,130 additional ideals, gains no rank,
leaves the subsequent 25 random ideals unchanged, and raises collection time
from 71.143 to 84.029 seconds. Ten untrimmed passes recover three of the four
missing directions and make LLL nearly free, but create 26,477 smooth
candidates, spend 71.463 seconds in valuation/cache work, and hit the
5.5-million-candidate limit one rank short.

Thus the useful next unit is not the multiplier loop alone: it is the complete
sparse-HNF feedback cycle that updates the permutation and removes resolved
factor-base directions before another pass. The exact negative receipt is
`results/multiplier-without-trim-negative.json`; the accepted runtime remains
the deterministic first pass followed by seeded random continuation.
