# Plan for fast hyperelliptic local L-polynomials and Jacobians

## Decision

Build the genus-2 and genus-3 foundation around exact local Frobenius data,
with smalljac as the first production accelerator, rforest as a serious
candidate for batched genus-3 Frobenius congruences, and ordinary,
CPython-parseable Python as the correctness implementation and capability
fallback.

The work has five product goals, in dependency order:

1. compute the full local L-polynomial of a genus-2 hyperelliptic curve;
2. expose the same exact API for genus 3, accelerating every model and prime
   range for which a validated smalljac, rforest-plus-reconstruction, or other
   mature backend returns the complete exact polynomial;
3. derive curve cardinalities over extensions, Frobenius polynomials, and
   finite-field zeta functions from that local polynomial;
4. implement the Jacobian group law with canonical divisor-class
   representations;
5. compute Jacobian orders and basic finite abelian group structure, and expose
   one batched good-prime local-polynomial API for curves over `QQ`.

Genus 2 is the first firm optimized product target. Genus 3 is a firm
correctness and API target, but its native performance milestone is conditional
on a source audit described below: smalljac 4.1.3 says genus-3 support was
removed from version 4, while retaining limited point-count and dormant group
code. The newly MIT-licensed rforest library computes the Hasse--Witt matrices
of a fixed hyperelliptic curve over `QQ` at all good primes up to a bound, but
these determine the local polynomial only modulo `p`. Sage.js must not turn
either source into a complete-product claim without an exact reconstruction
algorithm, separate build, oracle corpus, sanitizer coverage, and
cross-platform evidence.

Do not make Sage, Magma, PARI, `hypellfrob`, or any standalone executable a
runtime dependency. They are development oracles and comparative baselines.
The shipped implementation must remain in-process on Linux x64/arm64, macOS
arm64, and native Windows x64.

This plan deliberately stops before global genus-2 L-series. Good local Euler
factors are the dominant coefficient input, but a correct global L-function
also needs bad Euler factors, the conductor, gamma factors, and the root
number. Those should be a later project built on this one rather than hidden
inside it.

## User-visible objective

The intended Sage-compatible shape is:

```python
R = PolynomialRing(QQ, "x")
x = R.gen()
C = HyperellipticCurve(x**5 + x + 1)

# A good prime of a curve over QQ.
Lp = C.local_lpolynomial(101)

# One smalljac traversal and one native boundary crossing.
data = C.local_lpolynomials(2, 10**6)

Cp = C.change_ring(GF(101))
Cp.frobenius_polynomial()
Cp.cardinality()
Cp.cardinality(extension_degree=5)
Cp.count_points(5)
Cp.zeta_function()

J = Cp.jacobian()
J.order()
J.zero()
D = J([u, v])
2 * D
J.group_structure()
```

Exact names and return containers should be finalized in P0, but the semantic
separation must remain:

- `frobenius_polynomial()` is attached to a curve already defined over a
  finite field and returns `det(x - Frob_q)`;
- `local_lpolynomial(p)` is attached to a curve over `QQ` and returns the good
  Euler numerator `det(1 - T*Frob_p)`;
- a bad prime is never assigned a good-reduction polynomial by guesswork;
- the batched API returns only good factors by default and retains explicit
  skipped/bad/error diagnostics internally.

The public mathematical results are exact integers and polynomials. Backend
selection, retries, or fallback do not change their representation.

## Current Sage.js baseline

The recently completed portability work supplies a strong starting point:

- smalljac 4.1.3 and ffpoly 1.2.7 build on Linux x64/arm64, macOS arm64, and
  native Windows x64;
- the portable fixed-width arithmetic has exact differential coverage against
  optimized GNU x86-64 and independent word-arithmetic oracles;
- `smalljac_Lpolys` is already called once per elliptic prime interval;
- the public callback ABI uses fixed-width `uint64_t`/`int64_t` types on
  Windows and the upstream LP64 types on Unix;
- the standalone trace harness already prints every coefficient returned by
  smalljac;
- the existing addon deliberately requests `SMALLJAC_A1_ONLY` and discards
  every coefficient after the first;
- the Windows library is documented only as the proven genus-1 link closure,
  even though it already compiles `smalljac_g23`, `hecurve`, `hecurve2`,
  Jacobian-order, and Jacobian-structure objects;
- ffpoly uses global finite-field state, so the current adapter serializes
  smalljac calls with a mutex;
- Sage.js has prime and extension finite fields, exact polynomial arithmetic,
  integer factorization, and the lazy mathematical-module architecture needed
  for the readable layer;
- Sage.js does not yet have a public hyperelliptic-curve or hyperelliptic-
  Jacobian type.

The installed smalljac header is more precise than the earlier portability
summary:

- genus 1 and 2 are intended to work together with `SMALLJAC_GENUS=2`;
- full genus-2 L-polynomials are supported for quintic and sextic models;
- group structure is restricted to curves over `QQ`, prime fields, and
  odd-degree models;
- the ordinary `smalljac_Lpolys` callback returns only the first `g`
  coefficients because the remainder follows from the functional equation;
- full genus 3 is not a supported version-4 product; `A1_ONLY` traces and some
  generic/dormant source paths remain;
- the published prime bounds and crossover constants are old hardware tuning,
  not Sage.js performance policy.

The plan must therefore extend the proven boundary rather than merely remove
`SMALLJAC_A1_ONLY` and assume every higher-genus path works.

### rforest genus-3 candidate

The canonical rforest repository is
`https://github.com/edgarcosta/rforest`. It now has an explicit MIT license;
the bundled David Harvey `zz` sources have a separate permissive license. The
Harvey--Sutherland papers cover a fixed curve

```text
y^2 = f(x),  f in ZZ[x],
```

and compute its `g x g` Hasse--Witt matrix `W_p` simultaneously at every good
prime up to `N`. They prove

```text
L_p(T) = det(1 - T*Frob_p) == det(I - T*W_p) (mod p).
```

This is directly aligned with the P6 batched good-prime API, and the published
implementation was specifically measured in genera 2 and 3. It is less
naturally suited to a one-off finite-field call, extension fields,
characteristic 2, or a model with `h != 0` before a checked transformation.

rforest is not by itself a local-L-polynomial backend. Its public C function
evaluates polynomial transition-matrix products modulo many supplied moduli;
the curve-specific construction of those matrices and interpretation as
Hasse--Witt matrices must be implemented from the papers or a validated
wrapper. In genus 3, `det(I-T*W_p)` supplies `c_1,c_2,c_3 (mod p)`. The trace
`c_1` has a unique Weil-bound lift once `p > 16g^2`, but the bounds leave a
constant-size set of lifts for `c_2` and `O(sqrt(p))` possible lifts for
`c_3`. A complete exact backend therefore needs a second stage, such as:

- Jacobian order and twist/order searches using the genus-3 group law;
- a proved higher-power Frobenius congruence; or
- another exact local-polynomial algorithm that benefits from the congruence.

P0 must measure these alternatives rather than assuming that a residue modulo
`p` determines the integer polynomial. The likely high-value route is a
hybrid: rforest cheaply narrows all primes in a batch, then the Jacobian code
resolves and certifies the remaining candidates. This also makes the Jacobian
group law an algorithmic dependency of fast genus-3 local factors, not just a
derived feature.

The current upstream build is still a portability project despite the clean
license story: its makefile assumes GCC, `-m64`, Unix paths, GMP internals, and
a bundled 62-bit FFT layer. Treat Windows x64, macOS arm64, and Linux arm64 as
unproven until source-level word/ABI audits and exact cross-platform tests pass.
Do not route the public `algorithm="auto"` through rforest until the completion
stage returns a uniquely certified full polynomial.

## Mathematical normalization

Let `C/F_q` be a smooth projective hyperelliptic curve of genus `g`. Write

```text
P_C(X) = det(X - Frob_q)
       = X^(2g) + c_1 X^(2g-1) + ... + c_(2g)

L_q(T) = det(1 - T Frob_q)
       = 1 + c_1 T + ... + c_(2g) T^(2g).
```

Thus `L_q(T) = T^(2g) P_C(1/T)`. If the reciprocal roots are
`alpha_1, ..., alpha_(2g)`, then

```text
#C(F_(q^n)) = q^n + 1 - sum(alpha_i^n)
#J_C(F_q)   = L_q(1) = P_C(1).
```

For a smooth curve the functional equation gives

```text
c_(2g-i) = q^(g-i) c_i,  0 <= i <= g,
```

with `c_0 = 1`. Smalljac returns `c_1, ..., c_g`; the Sage.js boundary must
reconstruct and validate the full polynomial exactly. In genus 2 this is

```text
1 + c_1*T + c_2*T^2 + q*c_1*T^3 + q^2*T^4,
```

and in genus 3 it is

```text
1 + c_1*T + c_2*T^2 + c_3*T^3
  + q*c_2*T^4 + q^2*c_1*T^5 + q^3*T^6.
```

Do not reuse elliptic `a_p` naming for `c_1`: smalljac's elliptic convention is
`c_1 = -a_p`. The raw callback coefficient, the curve point-count trace, the
Frobenius polynomial coefficient, and the Euler-factor coefficient must each
have explicit names in code and tests.

### Reference reconstruction from point counts

The ordinary fallback computes `N_k = #C(F_(q^k))` for `1 <= k <= g`, puts

```text
s_k = q^k + 1 - N_k,
```

and applies Newton identities

```text
k*c_k + sum(c_(k-i)*s_i, i=1..k) = 0.
```

The remaining coefficients follow from the functional equation. Exact
division, coefficient bounds, reciprocity, `P_C(1) > 0`, and agreement with
the original point counts are checked rather than assumed. This fallback is
slow for large fields but is correct and supplies the primary same-system
differential oracle.

## Curve models and staged support

The public constructor should use Sage's equation convention

```text
y^2 + h(x)y = f(x).
```

It should accept exact polynomial inputs over `QQ` and finite fields, check
smoothness when requested, compute the genus from the smooth projective model,
and retain `f` and `h` exactly. A raw smalljac curve string is a private adapter
format, not the mathematical representation.

Support should be staged explicitly:

| Model/base | Exact public API | Native acceleration target |
| --- | --- | --- |
| genus-2 `y^2=f`, degree 5, over `QQ`/`F_p` | P1 | P2 firm |
| genus-2 `y^2=f`, degree 6 | P1 | P2 after sextic oracle corpus |
| genus-2 `y^2+h*y=f`, odd characteristic | P1 through exact completion of the square | P2 when the transformed model is accepted |
| genus-2 characteristic 2 | P1 exhaustive fallback | later accelerator |
| genus-3 degree 7/8 | P1 exact fallback | P7 conditional smalljac/rforest-completion lane |
| finite extension fields | P1 exact fallback | only after explicit smalljac validation |
| arbitrary genus | constructor and generic operations only when correct | out of this optimized product |

Completing the square in odd characteristic uses `Y = 2y+h` and
`Y^2 = h^2+4f`. The transformation must preserve the exact curve and points at
infinity; it is not permission to divide by two in characteristic 2 or to
silently replace a nonsquare leading coefficient by a quadratic twist.

For curves over `QQ`, denominators and leading coefficients require a checked
integral-model transformation before calling smalljac. Primes dividing a
denominator, discriminant, or transformation determinant are reported as
excluded until good reduction is established. P0 must document exactly which
quintic and sextic strings smalljac 4.1.3 accepts.

## Public API contract

### Finite-field curves

Proposed methods:

```python
C.frobenius_polynomial(algorithm="auto")
C.cardinality(extension_degree=1, algorithm="auto")
C.count_points(n=1, algorithm="auto")
C.zeta_function(algorithm="auto")
```

Algorithms:

- `"auto"`: full-polynomial smalljac when supported, otherwise the exact
  reference implementation;
- `"smalljac"`: require the validated native capability and fail clearly if
  the curve/model/field lies outside it;
- `"exhaustive"`: enumerate the required extension fields and reconstruct via
  Newton identities.

`cardinality(extension_degree=n)` should use a cached Frobenius polynomial once
available. It should not repeat exhaustive point counting over `F_(q^n)`.
`count_points(n)` similarly derives all requested values from one polynomial,
except that the reference implementation may compute the first `g` counts to
construct it.

### Curves over `QQ`

Proposed methods:

```python
C.local_lpolynomial(p, algorithm="auto")
C.local_lpolynomials(start, stop, algorithm="auto")
```

The interval is closed, matching smalljac. Inputs are machine-size primes for
the smalljac path; arbitrary Sage integers may use the fallback when feasible.
The result is ordered by prime and contains exact Sage.js polynomials, not raw
typed arrays. An internal packed result retains:

- prime or prime power;
- good-reduction status;
- genus and returned coefficient count;
- `c_1, ..., c_g` in signed fixed-width storage;
- backend and capability status;
- a distinct error code for parse/model/range/internal failure.

Bad primes are skipped by the plural good-prime API and cause a clear
`ArithmeticError` in the singular method. A future global-L-function project
may add a separate `local_euler_factor(p)` that understands bad reduction; do
not overload this project with that semantics.

Large ranges need an internal chunked iterator so memory is bounded. The
ordinary user API may materialize moderate ranges, but the L-series consumer
must be able to consume chunks without allocating `O(pi(B))` Python
polynomials at once.

### Caching

Cache immutable exact results by curve model, base field, prime/extension
degree, algorithm capability, and normalization version. A cached
`frobenius_polynomial()` may serve all curve and Jacobian cardinality calls.
Do not cache mutable native pointers or let a backend-specific curve handle
become the public curve identity.

## Native boundary

The host-independent mathematical ABI should have separate plan/execute
operations only if measurement shows planning matters. The initial direct
operation can be conceptually:

```text
smalljac_lpoly_batch(
    checked_curve_model,
    start,
    stop,
    flags,
    output_capacity
) -> packed_batch
```

The Node adapter should expose one batched call returning packed host-owned
storage:

```text
genus: scalar
q: uint64[n]
good: uint8[n]
coefficient_count: uint8[n]
coefficients: int64[n * genus]
status: int32[n] or one batch status plus row statuses
```

Variable-sized group invariants use offsets plus one packed `uint64`/exact-
integer array. All numeric range checks happen before casts. On Windows, never
pass public upstream `long` through Node-API; preserve the fixed-width adapter
already used by the portability layer.

The C adapter may serialize calls while ffpoly owns global state. Any parallel
smalljac mode must first prove reentrancy or isolate independent contexts; it
must not race merely because the upstream API exposes `smalljac_parallel_*`.
Prime-splitting flags are an optimization after the single-threaded exact
contract passes.

This is a mature-library foreign binding and compact representation boundary,
which is an allowed handwritten-native use under `ARCHITECTURE.md`. The curve
API, normalization, reconstruction, fallbacks, and Jacobian mathematics remain
ordinary Python. All new native files/exports and changed dependency closures
must update the architecture inventories and audit decisions.

## Jacobian representation and group law

### Odd-degree models

For a curve `y^2+h*y=f` with one chosen rational point at infinity, use reduced
Mumford divisors `(u,v)` satisfying

```text
u monic
deg(v) < deg(u) <= g
u divides v^2 + h*v - f.
```

The identity is `(1,0)`, and negation is

```text
(u,v) -> (u, -h-v mod u).
```

Implement and document general Cantor composition and reduction in readable
Python. The constructor canonicalizes `u` and `v`, validates the divisibility
condition, and rejects divisors from another curve or field. Equality and
hashing use the canonical reduced representation.

### Even-degree models

A pair `(u,v)` alone does not represent every degree-zero divisor class
canonically when the model has two points at infinity. Follow the extended
Mumford representation used in Sage's split/inert Jacobian implementations,
with an explicit infinity component such as `(u,v,n)`, or transform through a
proved odd-degree model when a rational Weierstrass point exists.

This is a required design item, not a cleanup after shipping. P4 may release
odd-degree Jacobian arithmetic first, but degree-6/8 curve point counting must
not imply that its Jacobian group law is already supported.

### Characteristic 2

The general `h != 0` Cantor law is the correctness route. Completing the square
is unavailable. Characteristic-2 group arithmetic can follow after the
odd-characteristic law, but the public capability error and curve point-count
fallback must already be correct.

### Operations

The first complete slice includes:

- zero, equality, hashing, negation, addition, subtraction;
- doubling and integer scalar multiplication;
- validated construction from Mumford data;
- conversion of a rational curve point to its divisor class;
- random divisor-class generation over finite fields;
- element order when the Jacobian order or a multiple is known;
- a readable representation and stable pickling/serialization contract.

Start with ordinary polynomial arithmetic. After profiling, compile the actual
typed Cantor source with `@native` or add packed finite-field polynomial
primitives. Do not bind private smalljac `hecurve` functions as the public
group law: they are compile-time-genus, global-context internals rather than a
stable foreign-library API. They remain a valuable differential oracle inside
the native test harness.

## Jacobian order and group structure

`J.order()` is exact and nearly free once `L_q(T)` is cached:

```text
J.order() = L_q(1).
```

For extension degree `n`, derive the order from Frobenius roots or, preferably,
integer power-sum/recurrence arithmetic without introducing algebraic floating
point values.

Expose structure in stages:

1. `J.group_structure()` returns invariant factors
   `m_1 | ... | m_r`, with `1 <= r <= 2g` and product `J.order()`.
2. The smalljac backend uses its public `smalljac_group(s)` API only on its
   documented domain: curves over `QQ`, reduction modulo a prime, and
   odd-degree models.
3. A generic black-box fallback uses the Python group law, the known factored
   group order, Sylow decomposition, random sampling, element orders, and
   relation/discrete-log algorithms. It may be slow, but it must verify that
   the generated subgroup has the full known order before declaring invariant
   factors.
4. `J.abelian_group()` may return an embedded group with generators only after
   the generators and relation matrix are certified. Invariants without
   certified generators must not be dressed up as an embedding.

Use Sage's `AdditiveAbelianGroupWrapper` strategy and standard generic-group
algorithms as references. For large prime factors, explicitly report a
capability/resource limit rather than making an unbounded discrete-log call.

Smalljac's returned invariant factors are checked for positivity, divisibility,
rank at most `2g`, product equal to `L_p(1)`, and agreement with Magma/Sage on
the oracle corpus. The group-law implementation independently verifies that
sampled elements are killed by the reported exponent.

## Phased implementation

### P0 — contracts, source audit, corpora, and baselines

Before changing the product boundary:

- record the exact accepted smalljac curve grammar for quintic, sextic,
  septic, and octic models, including rational coefficients and nonmonic
  leading terms;
- map the complete transitive source/link closure for full genus-2
  `smalljac_Lpolys` and `smalljac_groups` on Unix and Windows;
- compile standalone genus-2 full-polynomial and group harnesses on all four
  hosts;
- audit the dormant genus-3 paths, version-3 dependencies, compile-time
  `SMALLJAC_GENUS`, integer bounds, and abort/exit paths;
- pin and audit the MIT-licensed rforest source and its separately licensed
  bundled `zz` code, including:
  - the low-level transition-matrix API and the exact Harvey--Sutherland
    curve-to-matrix construction needed above it;
  - supported odd/even-degree integral models, exceptional translations,
    excluded primes, output normalization, memory tuning, and interval
    semantics;
  - GMP `mpn` assumptions, 62-bit FFT arithmetic, signed/unsigned and LP64
    widths, GCC extensions, `-m64`, allocation failure, and abort paths;
  - native Windows x64 feasibility and exact output agreement on Linux x64,
    Linux arm64, and macOS arm64;
- prototype the genus-3 exact-completion decision tree on paper and in the
  oracle harness: lift `det(I-T*W_p)` under exact Weil constraints, enumerate
  every remaining `(c_2,c_3)` candidate, and measure how Jacobian orders,
  quadratic twists, group exponent tests, or stronger congruences eliminate
  them;
- make a genus-3 go/no-go decision among:
  - a separately named validated version-4 build profile;
  - a restored and pinned upstream-supported dependency closure;
  - rforest plus a certified exact completion algorithm;
  - another maintained exact backend, using rforest only as an accelerator or
    independent modular oracle;
  - reference-only genus 3 in this project, with acceleration split into a
    follow-up;
- freeze the normalization and API decisions above;
- establish exact Sage, Magma, PARI, standalone-smalljac, and exhaustive
  oracles;
- commit cold/warm benchmark harnesses before setting performance gates.

The offline corpus should include at least:

- genus-2 quintics and sextics, generic and special/CM/split Jacobians;
- genus-3 septics and octics, including cases for which smalljac refuses full
  coefficients;
- fixed genus-2/3 curves over `QQ` with exact Hasse--Witt matrices and
  `det(I-T*W_p)` residues for dense prime intervals;
- odd and even leading coefficient behavior, quadratic twists, and `h != 0`;
- ordinary, supersingular, and varied `p`-rank examples;
- tiny primes, primes around every smalljac crossover, and primes near native
  word limits;
- good primes and all excluded/bad statuses;
- extension fields and characteristic 2 for the reference path;
- Jacobians with cyclic, two-factor, and higher-rank group structure;
- LMFDB genus-2 local factors and independently generated random curves.

Every corpus row stores the curve model, field, genus, full `L_q(T)`, first
`g` coefficients, extension point counts through at least `g`, Jacobian order,
and invariant factors when available. Batched rational-curve rows additionally
store the Hasse--Witt matrix or its characteristic polynomial, the coefficient
residues modulo `p`, and the number of integer candidates before and after each
completion filter. Store provenance and exact hashes, not only printed
transcripts.

### P1 — public curve model and ordinary exact reference

- add a small public `HyperellipticCurve` bootstrap constructor;
- put substantial algorithms in a lazy CPython-parseable package;
- implement model validation, genus, base change, completion of the square,
  points at infinity, and exhaustive rational-point iteration;
- count over the first `g` extensions and reconstruct the full polynomial with
  Newton identities;
- implement finite-field `frobenius_polynomial`, `cardinality`, `count_points`,
  and `zeta_function` using only the reference path;
- add strict Pyright coverage for fully migrated modules;
- differentially test CPython, generated Sage.js, and Sage/Magma.

This phase establishes correctness before the smalljac boundary determines
public representations.

### P2 — production genus-2 smalljac L-polynomials

- extend the standalone harness from trace streams to full coefficient
  streams and exact hashes;
- remove `SMALLJAC_A1_ONLY` only in a new higher-genus call, leaving the
  elliptic boundary stable;
- add the packed batched ABI and Node adapter;
- reconstruct the degree-4 polynomial in ordinary Python;
- validate quintic and sextic results across optimized Linux, forced-portable
  Linux, macOS, Linux arm64, and Windows;
- cover parse failure, bad reduction, callback cancellation, allocation
  failure, range overflow, and mutex cleanup;
- run ASan/UBSan/leak tests on the Unix native harness and Windows arithmetic
  stress tests;
- make `algorithm="auto"` select smalljac only inside its proven capability.

The success gate is exact agreement for every corpus prime and byte-identical
portable/optimized coefficient streams, not merely agreement of `c_1`.

### P3 — derived local APIs and cache

- route all finite-field derived methods through one cached exact polynomial;
- implement extension cardinalities using exact recurrences;
- test the zeta identity and point counts over multiple extensions;
- add chunked materialization for large good-prime ranges;
- ensure unsupported smalljac cases use the reference implementation rather
  than Sage's inefficient pattern of bypassing an available polynomial;
- document polynomial conventions with explicit genus-2 and genus-3 examples.

### P4 — Jacobian group law

- implement odd-degree generalized Cantor composition/reduction;
- exhaustively verify closure, inverses, associativity, scalar multiplication,
  and unique reduction on small genus-2/3 fields;
- add point-to-divisor conversion and random elements;
- implement element orders using the known Jacobian order;
- benchmark ordinary Python and identify the actual packed/native bottleneck;
- add source-transparent native acceleration only after differential IR/target
  inspection;
- design and implement the even-degree infinity component, with separate
  split/inert tests;
- add characteristic-2 generalized arithmetic or retain an explicit
  capability boundary until it is complete.

### P5 — Jacobian order and basic structure

- implement `J.order()` and extension orders from the local polynomial;
- expose a packed smalljac invariant-factor call for supported odd-degree
  genus-2 reductions;
- verify every returned structure against the polynomial and oracle corpus;
- implement the generic group-structure fallback for bounded workloads;
- construct certified embedded generators where feasible;
- benchmark group law, scalar multiplication, structure computation, and
  generator construction separately.

### P6 — batched good-prime API over `QQ`

- normalize a checked rational curve model once;
- traverse a closed prime interval in one smalljac call for genus 2, and in
  one bounded backend workflow for any validated genus-3 accelerator;
- specify whether a remainder-forest implementation can begin at `start` or
  internally computes a prefix through `stop`, so its cost and interval
  semantics are not obscured by the public API;
- return exact local polynomials in deterministic prime order;
- expose bounded chunks for global-L-series consumers;
- skip and diagnose bad/excluded primes without inventing factors;
- allow residue-class splitting only as an explicit deterministic scheduling
  optimization;
- benchmark through at least `10^6` and one larger range chosen from actual
  global-L-series needs.

This is the primary downstream interface for future Dirichlet coefficients,
Sato-Tate experiments, endomorphism tests, and complex L-series.

### P7 — genus-3 completion and acceleration

The exact P1 interface ships independently of this performance phase.

If P0 validates a native route:

- build genus-3 code as a separately identified capability so compile-time
  constants and global tables cannot contaminate the genus-2 library;
- for the rforest route, expose an internal batched Hasse--Witt operation for
  one checked integral curve and a bounded prime interval; keep this modular
  artifact private or explicitly named, never mislabeled as an L-polynomial;
- convert `det(I-T*W_p) (mod p)` into an exhaustive, exact Weil-constrained
  candidate set and resolve it with the chosen certified group/order,
  higher-power, or exact-backend completion step;
- prove that the completion returns exactly one polynomial or report an
  explicit indeterminate/resource status; never choose the numerically nearest
  coefficient lift;
- return all three independent coefficients and reconstruct degree 6;
- validate every result against extension point counts, Sage/PARI, and Magma;
- set honest prime/model bounds from measurements and integer proofs;
- add genus-3 group structure only if the corresponding upstream path passes
  the same standard.

If no mature route survives P0, keep genus 3 exact but reference-only and write
a follow-up plan comparing Harvey/Kedlaya, PARI `hyperellcharpoly`, a maintained
smalljac revival, and rforest with a stronger completion algorithm. Do not
preserve a misleading `"smalljac"` algorithm name that returns only `c_1`, or
a misleading `"rforest"` algorithm name that returns only coefficients modulo
`p`.

### P8 — cross-platform hardening and upstreaming

- run exact final commits on `windows`, `m1`, `bench-arm`, and x86-64 Linux;
- test from empty native caches and in installed-package layouts;
- run architecture gates and refresh every reviewed native inventory;
- record raw benchmark samples with host/toolchain/native-profile identity;
- propose the fixed-width portability layer, missing includes, and any
  higher-genus closure fixes upstream to smalljac/ffpoly;
- keep downstream patches minimal and checksum-pinned until accepted upstream.

## Performance plan

Do not choose crossover constants from the 2010-era processor comments in
smalljac. Measure them on all supported architecture families.

Required workloads:

1. one genus-2 local polynomial at representative tiny, medium, and large
   primes;
2. all good genus-2 polynomials in `[2, 10^4]`, `[2, 10^5]`, and
   `[2, 10^6]`;
3. quintic versus sextic models;
4. optimized GNU x86-64 versus forced-portable x86-64;
5. genus-3 reference and every candidate native backend, separating:
   - a one-off prime;
   - complete intervals through `10^4`, `10^5`, `10^6`, and the largest
     practical rforest bound;
   - raw Hasse--Witt time, candidate enumeration, exact completion, and result
     construction;
6. curve construction, first call, warm repeated call, and cache hit reported
   separately;
7. Jacobian addition, doubling, 256-bit scalar multiplication, random element,
   element order, invariant factors, and embedded generator construction;
8. memory and boundary overhead for materialized versus chunked prime ranges.

Initial performance gates should be relative until baselines are committed:

- the packed Sage.js genus-2 batch should be within 15% of the standalone
  smalljac harness for the same exact stream after warm initialization;
- Node/Python result construction must be measured separately and must not
  force one host crossing or polynomial allocation per coefficient;
- the portable implementations must return byte-identical streams before
  speed comparisons matter;
- no supported host may silently fall back on the representative genus-2
  batch because of a packaging error;
- group-law acceleration must beat the same ordinary Python source by a
  meaningful measured margin before becoming the default.

Report elapsed time, CPU time, peak resident memory, number of primes, number
of good/bad rows, coefficients produced, curve/backend identity, warmup/sample
policy, and exact output hash.

## Test and oracle strategy

### Exact local identities

For every local polynomial:

- degree is `2g`, constant coefficient is 1 in `L_q(T)`, and leading
  coefficient is `q^g`;
- the reciprocal functional equation holds coefficient by coefficient;
- Weil bounds hold using exact or certified comparisons;
- Newton power sums reproduce stored point counts;
- `L_q(1)` is positive and equals the Jacobian order oracle;
- quadratic twists change coefficients according to the expected parity;
- native and reference normalization agree exactly.

### Jacobian law

For small fields, enumerate every reduced divisor class and test the full
Cayley table where feasible. Across the broader corpus test:

- canonical reduction is idempotent;
- `D + 0 = D`, `D + (-D) = 0`, and subtraction agrees with addition;
- associativity on exhaustive small groups and deterministic randomized large
  samples;
- scalar multiplication against repeated addition, including negative and
  huge scalars;
- every element is killed by `J.order()`;
- reported invariant factors multiply to `J.order()` and kill every sample;
- certified generators span a subgroup whose proven order is the full order.

### Independent systems

- `/home/user/sagelite` supplies Sage `frobenius_polynomial`, extension point
  counts, zeta functions, Jacobian orders, and abelian groups;
- `/home/user/bin/magma` supplies independent point counts, Euler factors,
  Jacobian orders/structures, and group-law checks;
- PARI `hyperellcharpoly` supplies an additional local polynomial oracle;
- LMFDB supplies versioned genus-2 Euler-factor fixtures;
- standalone optimized and portable smalljac harnesses verify the foreign
  library independently of Node and Sage.js;
- the pinned standalone rforest harness and independently computed
  Hasse--Witt matrices verify the modular batch independently of the
  completion algorithm.

No network lookup is part of a test. Oracle outputs and provenance are checked
in as compact data.

## Parallel work structure

When implementation begins, use narrow lanes:

- `hyperelliptic-reference`: curve model, exhaustive counts, reconstruction,
  and derived APIs;
- `smalljac-g2`: native full-polynomial/group boundary and portability closure;
- `jacobian-law`: Mumford representations and Cantor arithmetic;
- `rforest-portability`: pinned dependency build, fixed-width/word audit, and
  standalone exact modular streams on all supported hosts;
- `genus3-completion`: curve-to-Hasse--Witt construction, exact candidate
  lifting, and group/order or alternative completion algorithm;
- `genus3-audit`: dormant smalljac, rforest, and other candidate comparison;
- `oracles-benchmarks`: Sage/Magma/PARI/LMFDB corpus and performance harness;
- `integration`: public exports, shared package/build files, architecture
  inventories, cache policy, final cross-platform receipts, and documentation.

The integration lane owns shared addon registries and build/package files.
Native and mathematical lanes agree on packed schemas before editing them.

## Risks and explicit responses

### Genus 3 is not actually a supported smalljac 4 product

Treat this as a research/portability subproject, not a flag flip. The exact
fallback and public API proceed; optimization needs a separate evidence gate.

### A Hasse--Witt matrix is not a full local polynomial

rforest yields `L_p(T) mod p`, not all integer coefficients. Enforce exact
Weil-constrained candidate enumeration and a certified completion step. Keep
modular diagnostics separate from the public local-polynomial result, and
return indeterminate rather than selecting an arbitrary lift.

### rforest's algorithm is portable in principle, not yet in evidence

The upstream API depends only on GMP at the library boundary and is now
clearly open source, but its implementation uses GMP internals, a bundled FFT,
GCC-oriented flags, and 64-bit assumptions. Apply the same fixed-width,
forced-portable, sanitizer, and native-Windows standard used for ffpoly and
smalljac; retain a correct fallback on every unsupported host.

### Even-degree Jacobians are subtler than `(u,v)`

Make infinity data part of the representation design. Ship odd-degree group
arithmetic first if necessary, with an explicit capability error for even
degree rather than a mathematically incomplete group.

### Bad reduction is not solved by good-prime L-polynomials

Return status, skip in the batched good-prime API, and defer bad Euler factors
to the global genus-2 L-function project.

### Upstream code may abort on unsupported paths

Audit every reachable call, prevalidate inputs, and convert recoverable errors
to status codes in the adapter. A malformed user curve must not terminate the
Node process.

### Global state limits concurrency

Retain the mutex until a real context boundary is proven. Chunking and one
batched call provide large gains without unsafe threads.

### Generic group structure can hide expensive discrete logs

Separate abstract invariant factors from certified embedded generators, expose
resource limits, and benchmark prime-power components independently.

### Native coefficient widths have mathematical limits

Prove coefficient bounds for each admitted genus/prime range and check before
every fixed-width conversion. Use exact Sage integers outside those bounds.

## Primary sources for the rforest decision

- canonical MIT-licensed source:
  `https://github.com/edgarcosta/rforest`;
- David Harvey and Andrew V. Sutherland, *Computing Hasse-Witt matrices of
  hyperelliptic curves in average polynomial time*:
  `https://arxiv.org/abs/1402.3246`;
- David Harvey and Andrew V. Sutherland, *Computing Hasse-Witt matrices of
  hyperelliptic curves in average polynomial time, II*:
  `https://arxiv.org/abs/1410.5222`;
- the Sage/Cython `pyrforest` wrapper, useful as an API and differential-oracle
  reference but not as a Sage.js runtime dependency:
  `https://github.com/edgarcosta/pyrforest`.

## Out of scope

- bad-prime Euler factors and global conductor/root-number computation;
- complex analytic rank or general complex evaluation of genus-2/3 L-series;
- Mordell-Weil groups of Jacobians over `QQ`;
- Chabauty, Coleman integration, heights, and `p`-adic L-functions;
- general non-hyperelliptic plane-quartic point counting;
- cyclic/superelliptic covers `y^r=f(x)` with `r > 2`;
- Sato-Tate group identification, despite dormant smalljac APIs;
- private smalljac/ffpoly ABI exposure to mathematical Python.

Each is a plausible downstream project once this foundation is stable.

## Definition of done

The project is complete when:

- genus-2 quintic and sextic curves have exact full local polynomials through
  smalljac on all supported native platforms;
- genus-3 curves have the same exact public interface and a clearly documented
  validated accelerator or reference fallback; any rforest path includes a
  certified integer completion stage rather than exposing modular coefficients
  as a full polynomial;
- finite-field curve counts over extensions, Frobenius polynomials, zeta
  functions, and Jacobian orders all derive from one cached exact object;
- odd-degree genus-2/3 Jacobians have a canonical, tested group law, with the
  even-degree capability accurately represented;
- invariant factors are exact and checked against the Jacobian order, and any
  returned embedded generators are certified;
- curves over `QQ` can compute a large deterministic interval of good local
  polynomials in one batched/chunked workflow;
- the genus-3 batch reports separate raw Hasse--Witt, candidate-lifting, and
  exact-completion costs, demonstrating whether rforest improves the complete
  workflow rather than only its modular first stage;
- optimized and portable streams agree exactly with Sage, Magma, PARI, and the
  checked-in corpus;
- Linux x64/arm64, macOS arm64, and native Windows x64 pass focused and full
  architecture/native tests from reproducible dependency builds;
- benchmarks show that Sage.js boundary overhead is small relative to
  standalone smalljac and record honest genus-3 limitations;
- documentation states all model, field, prime, bad-reduction, and group-
  structure capability boundaries without implying global L-function support.
