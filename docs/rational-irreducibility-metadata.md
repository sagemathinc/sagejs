# Rational irreducibility without public factor reconstruction

This implements the first opportunity from the
[public constructor profile](cubic-constructor-costs.md). It changes the
public rational-polynomial predicate, not the closed cubic class-group
algorithm, its bounds, GRH assumptions, or receipts.

## Mathematical contract

For $0\ne f\in\mathbb Q[x]$ of positive degree, write its complete irreducible
factorization as $f=u\prod_{i=1}^r p_i^{e_i}$, with $u\in\mathbb Q^\times$,
distinct nonconstant irreducible $p_i$, and positive integer $e_i$. Then
$f$ is irreducible if and only if $r=1$ and $e_1=1$. The factorization of the
primitive integer numerator supplies the same factors and exponents over
$\mathbb Q$; rational content is a unit. Zero and constant polynomials return
`False`, without asking FLINT to factor zero. This fixes the previous zero
case, which could raise from `factor()` instead of returning a Boolean.

The new path trusts FLINT's complete-factorization contract, as `factor()`
already does. It does not independently certify FLINT's irreducibility tests.
The removed reconstruction equality was a useful redundant consistency check
against some possible implementation faults, but not a proof that returned
factors were irreducible. We make that trust boundary explicit rather than
claiming identical fault-detection coverage.

This criterion is deliberately scoped to `QQ`. Integer-polynomial content
has different unit semantics; the `ZZ` path and finite-field dispatch are
unchanged.

## Implementation and ownership

`PolynomialElement.is_irreducible()` delegates rational inputs to the lazy
`public_structural.rational_is_irreducible` helper. On resource-backed inputs,
ordinary Python calls the existing generated factorization binding and reads
its count and, only when needed, first exponent. No factor coefficient bytes,
public factor polynomials, products or reconstruction comparisons are made.

The factorization is owned by a `with` block, which closes on true, false and
exceptional exits. The input polynomial is borrowed, not closed or mutated.
No new external library, handwritten mathematical C, native boundary or
resource allowance is introduced. Resource-unavailable inputs retain the
previous factorization/reconstruction fallback, except that zero/constants
are handled before that branch.

## Compiler obstruction remains explicit

An attempted `@native` implementation of the same resource context manager
fails in IR 40: `AST_With` currently handles native vectors, matrices and
arenas, not ordinary owned FFI constructors. The diagnostic error is
`NativeIntegerVector() requires capacity and memory_limit` for
`with fmpq_polynomial_factor_resource(source) as factors:`.

The working implementation is ordinary Python using existing generated FFI,
not a claimed closed native predicate. This follows the architecture's
ordinary-Python-first rule while removing the measured reconstruction cost.
A future compiler extension must implement the real lexical lifetime:
fallthrough, return, errors, ownership escape and borrowed-input lifetime.
It must not merely delay all closes to function exit and claim general
context-manager semantics. The cubic polynomial-to-class-group native core
itself remains unchanged and closed.

## Verification scope

The focused test covers Eisenstein polynomials in degrees 2 through 9,
nonmonic and rationally scaled inputs, large coefficients, translated
polynomials, repeated factors and reducible products. An independent exact
rational-root criterion supplies expected results for 150 monic cubics and
their rational rescalings. Metadata exceptions are injected to check
deterministic closure, short-circuit rejection and borrowed-source survival.
A synthetic no-resource fixture verifies the retained fallback dispatch; it
is not a browser mathematics qualification.

The rebuilt public runtime passes all three focused tests, the existing
exact-polynomial-resource regression suite, the full build, strict Python
checks (382 modules), and `pnpm architecture:check`. Public cubic smoke tests
return class groups of orders 5, 2 and 3 for $x^3+9x-55$,
$x^3-x^2+3x-4$ and $x^3-x^2-11x-63$, respectively, with authenticated receipts
and successful independent exact replay.

## Controlled constructor measurement

On the dedicated `opt` VM, commit `8fa831438` uses Node 26.8.1, CPU-0
affinity and one-thread numerical-library limits. The retained
`diagnose-number-field-construction.py` driver prepares the polynomial
$x^3-x^2-11x-63$, warms each operation 30 times, and measures eleven rounds
of 128 calls, alternating forward/reverse operation order. Startup is outside
the timers. No class number is computed in this experiment.

| Boundary | Previous median ms | New median ms | New range of batch means |
| --- | ---: | ---: | ---: |
| `p.factor()` | 0.764686 | 0.893122 | 0.709664–1.277754 |
| `p.is_irreducible()` | 2.995336 | 0.088120 | 0.082360–0.266534 |
| `NumberField(p, "a")` | 3.710720 | 0.660816 | 0.535496–0.978938 |
| `str(p)` | 0.105460 | 0.093490 | 0.084960–0.172014 |

The previous measurements are the separate `ca2e588b5` run recorded in the
[constructor diagnosis](cubic-constructor-costs.md), whose constructor and
polynomial implementations remained unchanged through `35af5d123`.
This is not a paired, randomized two-revision experiment. The unchanged
factorization boundary also shows run-to-run variation; do not attribute
every difference to the new predicate. The large irreducibility and
constructor improvements agree with the removed work and the earlier profile.
These boundaries are not disjoint phases and their medians must not be
subtracted as an exact cost decomposition.

Local timings overlapping validation jobs are excluded. This is not a new
1,000-field corpus or browser qualification, nor by itself a public
class-number performance claim.

## Whole-public-path measurement

The retained five-boundary driver also completes eleven rounds on opt at
`8fa831438`, alternating Sage.js and PARI 2.17.4 process order. All 7,040
timed Sage.js results authenticate after timing; 66 sampled receipts replay
independently, including warmups. The mathematical target remains
$x^3-x^2-11x-63$ with class group $C_3$. The source and production-pack hashes
are checked before and after the run.

| Boundary | Previous `ca2e588b5` median ms | Current median ms | Current range |
| --- | ---: | ---: | ---: |
| Sage.js prepared field | 3.236846 | 3.497362 | 3.355848–3.593428 |
| Sage.js expression + field + public order + class number | 24.347214 | 21.454488 | 21.199512–21.724606 |
| Sage.js expression + field + class number | 19.514130 | 16.037290 | 15.870908–16.664338 |
| Sage.js coefficient vector + field + public order + class number | 11.490664 | 8.442392 | 8.047538–8.835352 |
| Sage.js coefficient vector + field + class number | 8.260848 | 5.165022 | 4.126332–5.804804 |
| PARI prepared `nf` + `bnfinit` | 0.765625 | 0.773438 | 0.757813–0.804688 |
| PARI coefficient vector + `bnfinit` | 1.210938 | 1.210938 | 1.195313–1.250000 |

See [the original boundary definitions](cubic-public-target-boundaries.md).
These are separate-revision runs, not an isolated test of the predicate:
native analytic-index and bit-length changes also intervene. In particular,
the prepared-field median is **8.0% slower**, despite the fresh-path gains.
Do not hide that regression or attribute it without a same-runtime control.
The fresh coefficient-vector path is about 4.27 times PARI here, not a PARI
win. Its appreciable within-run variation also limits small speed claims.

## Same-runtime control

`diagnose-irreducibility-public-ab.py` restores the old reconstruction
formula by replacing the new module-level predicate **only in a diagnostic
process**. It does not change production dispatch or mathematical bounds.
The `metadata` mode uses the unmodified production predicate. The companion
runner alternates these modes over eleven paired rounds on CPU 0, using
the same `8fa831438` runtime and native pack. Each process checks one warmup
and two batches of 128 fields, authenticating every timed result and
independently replaying the warmup and last receipt of each batch.

| Boundary | Reconstruction median ms | Metadata median ms | Geometric mean paired metadata/reconstruction ratio |
| --- | ---: | ---: | ---: |
| Prepared field | 3.270580 | 3.413950 | 1.037694 |
| Coefficient vector + field + class number | 7.745978 | 4.653040 | 0.602494 |

All 5,632 timed results authenticate and all 66 sampled replays pass. The
fresh path improves in all eleven pairs. The prepared path is slower in ten
of eleven pairs, so the regression cannot simply be dismissed as unrelated
revision drift. This control has two boundaries, not the five-boundary
driver's entire process history; their absolute timings are not interchangeable.

The original protocol has only one class-number warmup. Extra arithmetic in
the old constructor might have warmed shared runtime code before the prepared
timer. The driver therefore also supports a separately reported experiment
with equal additional class-number warmups. This tests a hypothesis; it does
not retroactively replace the original timings or redefine their acceptance.

With 128 additional class-number warmups **in each mode**, the full eleven
paired rounds give:

| Boundary | Reconstruction median ms | Metadata median ms | Geometric mean paired ratio |
| --- | ---: | ---: | ---: |
| Prepared field | 2.972450 | 3.070240 | 1.027789 |
| Coefficient vector + field + class number | 7.813640 | 4.534810 | 0.584223 |

All 5,632 timed results authenticate; all 88 sampled independent replays pass,
including the last additional warmup in each process. Fresh computation is
faster in all eleven pairs, but prepared computation remains slower in nine.
The first pair was almost equal; it would have been misleading to conclude
from that pair that warmup resolved the regression. Equal warmup improves
both modes' prepared medians but does **not** eliminate the loss.

This is therefore a measured tradeoff, not a regression-free qualification:
about 40–42% less fresh-path time, with about 3–4% more prepared-path time in
the paired controls. The remaining prepared-path cause is unresolved. Native
mathematics is unchanged between these modes, but construction can influence
resource-cache, allocation and runtime-optimization state. Those are possible
mechanisms to profile, not established explanations. PR190 remains draft;
the broader current-source corpus and unseen-neighbor gates remain outstanding.

## Reproducible evidence

The production revision is `8fa8314380bfd36d14498264160d7733f8cbe7b0`.
The native cubic source SHA-256 is
`678630a3a68b436e71a34966576baa71a1fe6b645ec5f845cabb4f94cdef2447`
and the production pack SHA-256 is
`9b8c2f7d3ac1529fd11d44a31104ed3599796aea566c9dcddadb53e1561d6262`;
both are unchanged by the predicate implementation. The optimizer evidence
is published in its
[content-addressed auxiliary release](https://github.com/sagemathinc/sagejs/releases/tag/optimizer-evidence-campaign-1-d887ac313c36b7209f58b0e8e095b23f303c1cbd072f44d46557516e869d4a4b-d9877c4a348bccd5).

For the same-runtime control, copy
`bench/class-unit-groups/diagnose-irreducibility-public-ab.py` into a fresh
output directory. Run the companion `.cjs` through the pinned Node binary
with arguments `BUILT_ROOT OUTPUT_DIRECTORY EXTRA_WARMUPS`, under CPU-0
affinity. Use `0` for the original control and `128` for the separate
equal-warmup experiment. The runner records source, pack and Python-driver
hashes, retains stdout/stderr, and rejects failed assertions or changed
source identity. Its baseline override is not a supported production API.

Raw per-process output, the exact diagnostic scripts used in both runs,
environment hashes, aggregate timings, build and test logs are retained in
the [auxiliary measurement release](https://github.com/sagemathinc/sagejs/releases/tag/cubic-irreducibility-8fa831438-20260908).
The initial zero-extra-warmup run used the script before the optional warmup
parameter was added; that original script is included in the raw archive.
This release is evidence, not a product release or a performance promotion.
