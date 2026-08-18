# Plan for arbitrary-complex elliptic-curve `L`-series evaluation

## Decision

Implement numerical evaluation of `L(E,s)` for elliptic curves over `QQ`
inside Sage.js, using the exact `a_n` coefficients already produced by
`EllipticCurve.anlist()` and the existing FLINT/Arb/Acb native dependency.
The production algorithm will generalize the split-Mellin grid used by the
analytic-rank kernel from completed derivatives at `s=1` to completed values
at moderate arbitrary complex points.

This first project is deliberately **non-rigorous**. Acb will control rounding
error in the arithmetic, and the implementation will report coefficient-tail
and grid-omission estimates, but the discretization error of the Molin-style
trapezoidal grid will not initially be enclosed by a proved ball. Public values
must therefore be documented as arbitrary-precision numerical approximations,
not certified enclosures.

Do not add PARI, `lcalc`, Magma, a GP interpreter, or another executable or
runtime library. They are differential oracles only. FLINT has the complex
arithmetic required for this focused implementation, and smalljac now supplies
fast coefficients on all supported native platforms.

Very large imaginary parts, asymptotically optimized high-height evaluation,
Hardy functions, and zero searches are explicitly a separate future project.
This project may reject a request before beginning when its planned coefficient
or grid work exceeds documented resource limits.

## Objective

Support the ordinary Sage-style use case:

```python
E = EllipticCurve([1, 2, 3, 4, 999])
L = E.lseries()
L(1 + I)
# -0.00531031952602992 + 0.0990520277396782*I
```

and an explicit-precision interface:

```python
L.value(1 + I, prec=100)
L.completed_value(1 + I, prec=100)
L.values([1, 1 + I, 1 + 2*I], prec=100)
```

The implementation must:

- run in-process on Linux x64/arm64, macOS arm64, and native Windows x64;
- add no new runtime dependency or subprocess;
- accept real and complex Sage.js numeric inputs and return a
  `ComplexField(prec)` element;
- use exact conductor, root number, and `a_n` data from the curve;
- evaluate both raw `L(E,s)` and canonical completed `Lambda(E,s)` with a
  single documented normalization;
- adapt coefficient cutoff, grid spacing, grid extent, and Acb working
  precision to the requested point and output precision;
- detect excessive work before generating a large coefficient prefix;
- provide a readable ordinary-Python fallback and differential oracle;
- cache coefficient prefixes and exact repeated evaluations;
- support a batch of points without rebuilding the common Mellin grid for
  every point;
- retain structured internal diagnostics for numerical review;
- preserve all analytic-rank behavior and tests.

## Scope and non-goals

### Included in this project

- Single-point values `L(E,s)` for moderate complex `s`.
- Batched values in one bounded complex region.
- Explicit bit precision, initially at least 32 through 512 bits.
- Completed values `Lambda(E,s)` for diagnostics and functional-equation
  testing.
- Exact handling of conductor, root number, and coefficients.
- Numerical handling of trivial zeros using reciprocal gamma rather than
  division by a singular gamma value.
- Resource planning and clear failures for requests outside the supported
  workload.
- A reference evaluator and independent Sage/PARI and Magma comparisons.

### Explicitly deferred

- Proved enclosures for the complete analytic result.
- A public ball-valued return type or `proof=True` mode.
- Very large `abs(Im(s))` where the present grid becomes asymptotically poor.
- Riemann--Siegel-type or other specialized high-height algorithms.
- Zero searches, zero counts, Hardy `Z` functions, explicit-formula scans, or
  GRH verification.
- General motivic, modular-form, Dirichlet, number-field, or genus-2
  `L`-functions.
- General derivatives or Taylor series away from `s=1`. The internal design
  must leave room for these, but they are follow-up work.
- Twists and families as a special batched algorithm.
- Compatibility aliases which claim to use PARI, Dokchitser, or `lcalc` when
  Sage.js does not ship those implementations.

“Arbitrary-complex” in this plan means that the argument is not restricted to
the center or to the real axis. It does not mean constant-time evaluation at
unbounded height. The implementation must use explicit workload limits rather
than silently becoming unusable.

## Mathematical contract

For an elliptic curve `E/QQ` of conductor `N`, use the classical normalization

```text
L(E,s) = sum_{n>=1} a_n n^(-s)
A = sqrt(N)/(2*pi)
Lambda(E,s) = A^s Gamma(s) L(E,s)
Lambda(E,s) = w Lambda(E,2-s),  w in {-1,1}.
```

Put `a = 1/A = 2*pi/sqrt(N)` and

```text
f(y) = sum_{n>=1} a_n exp(-a*n*y).
```

Splitting the Mellin transform at one and applying the modular functional
equation gives

```text
Lambda(E,s) = integral_1^infinity
    f(y) * (y^(s-1) + w*y^(1-s)) dy.
```

After `y=exp(u)`, define

```text
F(u) = exp(u) * sum_{n>=1} a_n exp(-a*n*exp(u)).
```

Then

```text
Lambda(E,s) = integral_0^infinity F(u) *
    (exp((s-1)*u) + w*exp(-(s-1)*u)) du.
```

This is exactly the integral already specialized by the analytic-rank kernel.
At `s=1`, differentiating it gives the completed central moments and their
functional-equation parity. The new evaluator must share normalization tests
with that kernel rather than creating a second convention.

Convert to the raw value using

```text
L(E,s) = Lambda(E,s) * a^s * rgamma(s).
```

Use Acb's reciprocal gamma operation. This avoids division by a gamma pole and
correctly produces the trivial zeros at nonpositive integers. Never form
`1/Gamma(s)` by an ordinary division near those points.

### Independent reference identity

For validation and a slower reference path, termwise integration gives

```text
Lambda(E,s) = sum_{n>=1} a_n * (
    (a*n)^(-s)   * Gamma(s, a*n)
    + w*(a*n)^(s-2) * Gamma(2-s, a*n)
).
```

Here `Gamma(z,x)` is the upper incomplete gamma function. Mpmath and Acb both
provide the required operation. This representation is exponentially
convergent and valuable as an independent formula, but evaluating two complex
incomplete gamma functions for every coefficient is not expected to be the
fast production path.

## Numerical policy

### Public semantics

`L(E,s)` returns a numerical approximation in `ComplexField(prec)`. It does not
return a certified ball, even though Acb is used internally. Documentation must
say near the return value:

> This is an arbitrary-precision numerical approximation. The current
> implementation bounds coefficient truncation and tracks Acb rounding error,
> but does not provide a proved enclosure for the quadrature discretization
> error.

Do not describe the result as “probable” in the analytic-rank sense. Analytic
continuation and the functional equation for elliptic curves over `QQ` are
theorems; what is non-rigorous here is the claimed numerical error, not the
existence of the value. If a future `proof` keyword is introduced, `proof=True`
must reject the request until the missing analytic error proof exists.

### Precision and stability

- The default output precision is 53 bits.
- `prec` is the requested output precision in bits.
- The native planner must add guard bits for:
  - Acb arithmetic and summation;
  - conversion from completed `Lambda` to raw `L`;
  - decay of `Gamma(s)` as `abs(Im(s))` increases;
  - growth from `abs(Re(s)-1)` in the two Mellin weights.
- In particular, raw-value conversion near height `t` loses on the order of
  `pi*abs(t)/(2*log(2))` bits if this is not anticipated.
- The result must be recomputed with a refined grid/cutoff or higher work
  precision when diagnostics do not support the requested stable digits.
- A refinement mismatch raises a numerical-indeterminacy error with
  diagnostics; it must not silently return a value with a misleading parent
  precision.
- Relative accuracy is inappropriate at or very near a zero. Use an absolute
  target as well as relative stability.

The refinement check is a numerical safety policy, not a proof of the final
error bound.

### Workload limits

Planning must happen before `anlist(K)`. At minimum limit:

- coefficient cutoff;
- total coefficient-node products;
- number of grid points;
- number of requested points in one batch;
- precision bits;
- `abs(Im(s))` for the first implementation.

Start with a conservative documented height limit such as `abs(Im(s)) <= 100`
in the critical region, together with stricter operation-count limits. The
operation-count limit is authoritative because conductor and precision can
make a modest height expensive. Do not promise that the initial numerical
limit is permanent or mathematically significant.

## Algorithm routing

### Production critical-region path

For points in or near `0 <= Re(s) <= 2`, use the split-Mellin grid:

1. Determine a domain containing all requested points.
2. Choose work precision, coefficient cutoff `K`, mesh width `h`, and grid
   extent `U` from the domain, conductor, and target precision.
3. Generate `a_0,...,a_K` in one `anlist(K)` call.
4. At each `u_j=j*h`, compute the real common value

   ```text
   F_j = exp(u_j) * sum_{n<=K_j} a_n exp(-a*n*exp(u_j)).
   ```

5. Reuse the same `F_j` for every requested `s` and accumulate the two complex
   weights.
6. Apply endpoint half-weight and multiply by `h`.
7. Convert completed values to raw values with `a^s*rgamma(s)`.
8. Return arithmetic balls plus separate analytic-error diagnostics to the
   Python policy layer.

Retain the variable local cutoff `K_j`, but generalize its omission estimate to
include the maximum modulus of the complex weights over the requested domain.
The fixed coefficient tail must likewise depend on the real extent of the
domain, not only on central derivative order zero.

The current analytic-rank planner hardcodes height zero. Do not simply insert
complex exponentials into that plan. Port and document the height- and
real-width-dependent terms from the general Molin/PARI analysis, specialized to
degree two, then validate them empirically with independent refinement.

### Far-right and far-left routing

The Mellin formula is valid everywhere, but it is wasteful far to the right.
Add an automatic direct-Dirichlet path when `Re(s)` is sufficiently large and
its conservative tail estimate predicts less work:

```text
L(E,s) = sum_{n<=K} a_n n^(-s) + tail.
```

Use a documented coefficient bound, not an assumed random-cancellation model,
for planning. Near the edge of absolute convergence the Mellin path will remain
preferable.

For points far to the left, reflect to `2-s` and use

```text
L(E,s) = w * A^(2-2*s) * Gamma(2-s) * rgamma(s) * L(E,2-s).
```

The initial implementation may defer the direct-series optimization if the
Mellin planner handles the requested moderate real range correctly. It must not
claim efficient unrestricted real-part support until this routing exists.

### Reference path

Add an ordinary CPython-parseable module using mpmath and deterministic
quadrature, with the incomplete-gamma formula available for small independent
checks. It should:

- share only normalization and coefficient-provider interfaces with native
  code, not its summation implementation;
- support the same complex inputs and output precision for the test range;
- use explicit cutoff and mesh refinements;
- return diagnostics identifying mpmath precision, cutoff, quadrature degree,
  and refinement differences;
- remain readable enough to audit against the displayed formulas.

The reference path is a fallback and oracle, not the performance target.

## Public API

Add a lightweight `Lseries_ell` object modeled on the useful Sage surface but
without pretending that the backend is Dokchitser or PARI:

```python
class Lseries_ell:
    def elliptic_curve(self): ...
    def __call__(self, s): ...                 # default 53 bits
    def value(self, s, prec=53, algorithm="auto"): ...
    def values(self, points, prec=53, algorithm="auto"): ...
    def completed_value(self, s, prec=53, algorithm="auto"): ...
```

and on rational elliptic curves:

```python
def lseries(self): ...
```

`E.lseries()` should be cached per curve. The `Lseries_ell` object should own a
reusable coefficient prefix and a bounded value cache keyed by the exact
coerced point, precision, algorithm, and completed/raw choice.

Supported algorithm names:

- `"auto"`: use the native Acb path when present, otherwise the reference path;
- `"native"`: require the Acb implementation;
- `"reference"`: require the ordinary-Python evaluator.

Do not initially add a method named `dokchitser()`. In modern Sage this is a
historical entry point which normally returns PARI's general `lfun` wrapper.
Sage.js should use an implementation-neutral name such as `value()` or a future
`evaluator()`. If compatibility later requires `dokchitser`, it must explicitly
document the intentional backend difference rather than accept misleading
algorithm names.

Input rules:

- exact integers/rationals and Sage.js real or complex field elements are
  accepted;
- default coercion is into `ComplexField(prec)`;
- NaN, infinity, invalid precision, and unbounded resource requests raise clear
  errors;
- real inputs still return a complex-field element for a stable API, matching
  the object being a complex `L`-series;
- conjugate points may share cached preparation but not be silently rounded to
  real values.

## Native boundary

Factor the existing elliptic `L`-function C source into shared planning/grid
code and two consumers: the central derivative jet and general complex values.
Do not duplicate the conductor normalization, coefficient Horner loop, resource
guards, or tail formulas.

Use stateless C entry points conceptually equivalent to:

```c
int sagejs_ec_lseries_plan(
    sagejs_ec_lseries_plan_t *plan,
    const fmpz_t conductor,
    const acb_srcptr points,
    slong point_count,
    slong target_bits);

int sagejs_ec_completed_lseries_values(
    acb_ptr completed,
    acb_ptr raw,
    mag_ptr analytic_errors,
    sagejs_ec_lseries_diagnostics *diagnostics,
    const fmpz *coefficients,
    slong available_cutoff,
    const fmpz_t conductor,
    int root_number,
    const acb_srcptr points,
    slong point_count,
    slong target_bits,
    slong work_bits);
```

The Node adapter should expose a batched function, tentatively
`ecLseriesValues`, returning:

- status: `ok`, `insufficient_coefficients`, or a resource-limit failure;
- target and work precision;
- required and actual coefficient cutoffs;
- grid step, grid point count, and total coefficient terms;
- per-point raw and completed real/imaginary midpoint strings;
- per-point Acb real/imaginary radii and accuracy bits;
- coefficient-tail and local-grid-omission estimates;
- refinement/domain diagnostics;
- `rigorous: false`;
- an exact status string such as
  `coefficient_and_grid_omission_only` explaining what is and is not bounded.

The native result must never widen only the displayed radius with an unproved
discretization estimate and then label the result rigorous. Keep arithmetic
balls and analytic estimates distinguishable.

Prefer decimal strings or existing native real/complex wrappers at the
JavaScript boundary; never route arbitrary-precision inputs through binary64.

## Reuse and refactoring

The analytic-rank implementation currently contains its own extendable
`CoefficientPrefix` and native cutoff bridge. Extract the reusable coefficient
prefix into an elliptic `L`-series support module so rank and value evaluation
share one policy. Preserve the existing rank cache and diagnostics.

The following behavior must remain shared and tested:

- canonical `Lambda=A^s Gamma(s)L(s)` normalization;
- conductor and `a=2*pi/sqrt(N)` construction;
- root-number convention;
- exact `a_n` indexing (`a_0` through `a_K` at the high-level boundary);
- variable per-node cutoff;
- native resource checks;
- host-independent FLINT/Acb arithmetic.

The general evaluator must reproduce the central rank kernel's order-zero value
at `s=1` within the reported arithmetic/refinement tolerance. This is a
cross-kernel invariant, not merely an external-oracle comparison.

## Validation corpus

Create a committed offline corpus containing:

- several small-conductor curves with both root signs;
- the existing analytic-rank rank-0 through rank-5 curves;
- the motivating rank-2 curve `[2,3,1,4,50]`;
- the user example `[1,2,3,4,999]`, conductor `430250329`;
- integral and nonintegral Weierstrass models representing isomorphic curves;
- points on the real axis, in the critical strip, and moderately high in the
  strip;
- points on both sides of the functional equation;
- nonpositive integers testing trivial zeros;
- 53-, 100-, and 200-bit oracle values stored as decimal strings with source
  and normalization metadata.

At minimum include these point families:

```text
s = 2
s = 1 + i
s = 1 + 10*i
s = 1/2 + i
s = 3/2 - i
s = 0, -1, -2
s and conjugate(s)
s and 2-s
```

For `[1,2,3,4,999]`, pin the 100-bit Sage/PARI oracle

```text
L(1+i) =
-0.0053103195260299207325292689379
+0.099052027739678168544361108900*i.
```

Store enough additional digits that a lower-precision assertion never treats
display rounding as an oracle.

### Required identities and differential tests

- Native versus ordinary-Python reference evaluation.
- Sage/PARI versus Sage.js at every corpus point.
- Magma comparisons where the installed version supports the operation.
- `L(conjugate(s)) = conjugate(L(s))` for real elliptic coefficients.
- `Lambda(s) = w*Lambda(2-s)`.
- Direct Dirichlet summation agreement in a safe right half-plane.
- Exact or numerically stable trivial zeros at nonpositive integers.
- Order-zero general evaluation at `s=1` agrees with the central-jet kernel.
- Rank-zero `L(1)` agrees with the analytic-rank leading value.
- Increasing 53 to 100 to 200 bits preserves the stable prefix.
- Refined mesh/cutoff evaluations agree beyond the requested target.
- Insufficient coefficients produce a retry request, not an inaccurate value.
- Resource-limit and nonfinite-input tests fail before large allocation.
- Batch evaluation equals independent single-point evaluation.
- Repeated evaluation exercises the cache without changing the result parent.

Because the implementation is non-rigorous, tests should assert stable digits
against independent oracles and refinements. They must not assert that the Acb
radius contains the true mathematical value unless the missing discretization
bound has been supplied.

## Baselines and performance targets

Record reproducible cold, warm, repeated, and batched measurements on
`bench-1`, plus cross-platform smoke timings. Do not mix process startup or
native dependency compilation into warm evaluator timings.

Observed feasibility baseline on 2026-08-18 for
`E=[1,2,3,4,999]`, `N=430250329`, at 53 bits:

| Operation | Observed result |
| --- | ---: |
| Sage/PARI coefficient cost for a domain through `1+i` | 700,697 |
| Sage/PARI `L(1+i)` wall time | about 0.22 s |
| Direct split-Mellin prototype cutoff | 133,067 |
| Direct prototype grid points | 75 |
| Direct prototype coefficient-node products | 913,285 |
| Direct Python prototype total wall time | about 0.23 s |
| Sage.js `anlist(140000)` wall time | about 0.11 s |
| Sage.js `anlist(700697)` wall time | about 0.54 s |

The prototype agreed with the 53-bit Sage value to approximately `5e-14` at
`1+i`. It deliberately used binary64 for its inner sum and is evidence of
feasibility, not a precision oracle. At `1+10*i`, binary64 lost several more
digits through completed-to-raw conversion; this is a regression case for the
required Acb guard-bit policy.

Initial performance goals on an unloaded x86-64 Linux host:

- native `L(1+i)` for the example curve should be no slower than twice the
  Sage/PARI baseline after process initialization;
- cached identical calls should be dominated by coercion and formatting;
- a batch of several points in one domain should be materially faster than
  independent cold native calls;
- small-conductor values should not be dominated by repeated coefficient or
  root-number computation;
- the analytic-rank benchmark must not regress materially after shared-kernel
  refactoring.

These are engineering gates, not promises for all conductors or points.

## Implementation phases

### P0 — Freeze semantics, corpus, and benchmarks

- Commit Sage/PARI oracle values at 53, 100, and 200 bits.
- Add a persistent Sage/PARI harness and optional Magma/lcalc comparisons.
- Record conductor, root number, coefficient-prefix hashes, and normalization.
- Add benchmark scripts for single, repeated, and batched evaluation.
- Freeze the public and native diagnostic schemas before parallel work begins.

Exit criterion: the example value, functional-equation pairs, trivial zeros,
and moderate-height cases have reproducible independent oracle data.

### P1 — Ordinary-Python reference evaluator

- Add the `Lseries_ell` object and `E.lseries()`.
- Extract/share the exact coefficient-prefix cache.
- Implement complex split-Mellin quadrature with deterministic refinement.
- Add the incomplete-gamma formula for focused independent checks.
- Implement raw/completed conversion and complex-field return coercion.
- Implement resource planning and structured diagnostics.
- Add strict Pyright coverage for fully migrated mathematical modules.

Exit criterion: the public example and full corpus pass under
`algorithm="reference"` in CPython and Sage.js.

### P2 — General Acb kernel

- Refactor the current central-jet kernel around a shared plan and real `F_j`
  grid builder.
- Add Acb point parsing and batched complex accumulation.
- Implement domain-sensitive work precision and resource planning.
- Generalize coefficient and local-grid-omission estimates.
- Compute both completed and raw values with `acb_rgamma`.
- Return the agreed diagnostics without claiming rigorous enclosure.
- Add focused native normalization, precision, and resource tests.

Exit criterion: focused native tests pass and order-zero evaluation agrees with
both the central jet and reference evaluator.

### P3 — Adaptive production policy and caching

- Wire `"auto"`, `"native"`, and `"reference"` algorithms.
- Add cutoff/mesh/work-precision refinement and stability checking.
- Add bounded result caching and coefficient-prefix reuse.
- Implement batched values with one shared native grid.
- Add far-right direct-series and far-left reflection routing if required by
  the agreed real-part scope.
- Produce clear resource-limit and capability errors.

Exit criterion: the public corpus passes at all precisions and deliberate
underplanning either refines successfully or raises, never silently degrades.

### P4 — Cross-platform and repository gates

- Build and test on Linux x64, Linux arm64, macOS arm64, and native Windows x64.
- Run focused elliptic `L`-series, analytic-rank, smalljac, and real/complex
  arithmetic tests.
- Run `pnpm format:python`, `pnpm test:baselib:strict`,
  `pnpm architecture:check`, relevant native suites, and `pnpm test:changed`.
- Add every new native file or changed kernel classification to the architecture
  inventories.
- Record exact-SHA receipts and benchmark provenance.
- Update user-facing help and examples with the non-rigorous and moderate-height
  scope.

Exit criterion: all supported platforms return the pinned example value and
the repository-wide native and architecture gates are clean.

## Suggested parallel lanes

If implemented as a parallel project, use narrow lanes:

1. **API/reference lane** — `Lseries_ell`, coefficient cache, mpmath evaluator,
   strict Python tests.
2. **Native lane** — shared C planner/grid, Acb value kernel, Node boundary,
   focused native tests.
3. **Oracle/benchmark lane** — Sage/PARI and Magma corpus, functional-equation
   fixtures, performance harness.
4. **Integration lane** — shared registries, architecture inventories, public
   exports, merge, full tests, and documentation.
5. **Cross-platform lane** — exact integration SHA on Windows, macOS arm64, and
   Linux arm64 after the integration lane stabilizes.

Only the integration lane should edit shared addon registries, architecture
inventories, package manifests, or broad CI configuration unless explicitly
coordinated.

## Main risks and mitigations

### Completed-to-raw loss at height

`Gamma(s)` is exponentially small on vertical lines. A result can have a
high-accuracy completed value and still lose most raw-value digits.

Mitigation: plan from the raw target, add height-dependent guard bits, inspect
the final raw Acb accuracy, and refine or reject.

### Incorrect reuse of the central planner

The present central kernel assumes `tmax=0` and exploits derivative parity.
Those assumptions do not hold at a general point.

Mitigation: derive and test a domain-aware planner; share only the parts whose
mathematical assumptions remain valid.

### Unproved quadrature error being mistaken for an Acb proof

Acb encloses arithmetic performed on the chosen finite grid; it does not by
itself prove the infinite integral or trapezoidal discretization error.

Mitigation: keep `rigorous=false`, distinguish error categories, use independent
refinement, and make the limitation prominent in documentation.

### Work explosion at high imaginary part

Grid spacing must resolve increasingly rapid oscillation while coefficient
requirements and gamma guard bits also grow.

Mitigation: plan and cap work before coefficient generation. Defer high-height
algorithms and zeros to a dedicated project.

### Duplicate kernels drift in normalization

Separate analytic-rank and value implementations could acquire a factor of two
or a conflicting gamma convention.

Mitigation: factor shared code and require central-value cross-kernel tests.

### Large conductor and fallback coefficient speed

Even moderate `s` may require millions of coefficients for a large conductor.

Mitigation: use the portable smalljac path where available, retain the correct
fallback, expose the plan before work starts, and enforce cutoff limits.

### Cache growth

Plots and exploratory computations can evaluate many distinct points.

Mitigation: use a small bounded LRU for final values; cache coefficient prefixes
and prepared batches separately; provide an internal cache-clear hook.

## Completion criteria

The project is complete when:

- the exact user example works through `E.lseries()(1+I)`;
- native and reference paths agree with pinned Sage/PARI values across the
  corpus at 53, 100, and 200 bits;
- conjugation, functional equation, trivial-zero, direct-series, and central
  kernel identities pass;
- batched evaluation reuses one grid and agrees with single evaluation;
- non-rigorous status and moderate-height/resource scope are visible in public
  documentation;
- no code path labels an incomplete Acb radius a rigorous enclosure;
- excessive work is rejected before a large `anlist` allocation;
- analytic-rank and smalljac tests remain green;
- Linux x64/arm64, macOS arm64, and native Windows x64 pass at one exact commit;
- repository architecture, strict-Python, formatting, native, and changed-test
  gates pass;
- implementation and validation changes are committed and pushed with clean
  worktrees.

## Follow-up projects

Keep these separate so the first evaluator stays achievable:

1. Proved Molin/trapezoidal discretization and tail bounds with a public complex
   ball result.
2. General derivatives and Taylor series around arbitrary complex points.
3. Prepared rectangular evaluator objects for plotting and dense sampling.
4. High-height approximate functional equations and asymptotically appropriate
   evaluation.
5. Hardy functions, zero location/counting, and explicit-formula verification.
6. Generalization from elliptic curves to higher-genus and other motivic
   `L`-functions once their local factors and gamma data are available.

## Primary references

- Sage elliptic `L`-series implementation:
  `/home/user/sagelite/src/sage/schemes/elliptic_curves/lseries_ell.py`
- Sage PARI `LFunction` wrapper:
  `/home/user/sagelite/src/sage/lfunctions/pari.py`
- PARI general `L`-function implementation: `src/basemath/lfun.c` and
  `src/basemath/mellininv.c` in PARI 2.17.4.
- PARI `L`-function documentation:
  <https://pari.math.u-bordeaux.fr/dochtml/ref/_L_minusfunctions.html>
- Tim Dokchitser, *Computing special values of motivic L-functions*:
  <https://arxiv.org/abs/math/0207280>
- FLINT Acb complex and gamma functions:
  <https://flintlib.org/doc/acb.html>
- FLINT complex incomplete gamma functions:
  <https://flintlib.org/doc/acb_hypgeom.html>
- FLINT rigorous complex integration, for the future proof-producing project:
  <https://flintlib.org/doc/acb_calc.html>
- Rubinstein `lcalc`, as a comparative oracle and high-height design reference:
  <https://gitlab.com/sagemath/lcalc>
- Existing Sage.js analytic-rank plan:
  `agents/elliptic-curve-analytic-rank-plan.md`
