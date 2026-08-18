# Plan for elliptic-curve `L`-series performance and complex plotting

## Decision

Do a focused second pass over the elliptic-curve `L`-series evaluator with
three deliverables:

1. make fresh single-point evaluation substantially faster, including a
   direct-series route for points far to the right;
2. make `L.values(...)` correct and efficient for large batches, and add the
   Sage-compatible `values_along_line` interface;
3. make `complex_plot(L, ...)` use a prepared batched evaluator instead of
   invoking `L(s)` independently for every pixel.

Retain the numerical contract of the first project. Public values remain
arbitrary-precision, non-rigorous approximations unless and until the missing
trapezoidal discretization proof is implemented. Performance work must not
weaken the independent-refinement check, silently return binary64 as an
arbitrary-precision value, or make a plotted image look trustworthy when the
underlying evaluation did not stabilize.

Do not add PARI, GP, Dokchitser, `lcalc`, or a standalone executable. Sage's
Dokchitser evaluator is a performance and correctness oracle. Sage.js should
continue to use exact smalljac coefficients and the existing FLINT/Arb/Acb
dependency on Linux x64/arm64, macOS arm64, and native Windows x64.

Very large imaginary height, zero searches, Hardy functions, and an
asymptotically optimal approximate functional equation remain a separate
project. This pass should improve the existing moderate-height algorithm and
dense low-height sampling without pretending to solve the high-height problem.

## Objectives

The ordinary single-point interface must continue to work:

```sage
E = EllipticCurve([1, 2, 3, 4, 999])
L = E.lseries()
L(1 + I)
# -0.00531031952602992 + 0.0990520277396782*I
```

Points far into the absolutely convergent half-plane should become both
supported and fast:

```sage
L(10 + I)
# 1.00075103016354 - 0.000623246375993084*I
```

The batched interfaces should be documented and Sage-compatible:

```sage
points = [1 + k*I for k in range(21)]
values = L.values(points)

samples = L.values_along_line(1, 1 + 20*I, 101)
# [(s_0, L(s_0)), ..., (s_100, L(s_100))]
```

The plotting interface should use one prepared regional computation:

```sage
complex_plot(L, (0, 2), (-20, 20), plot_points=100)
```

It must not lower that expression to 10,000 independent calls to `L(s)`.
Plotting should default to an adaptive visual-accuracy policy rather than
computing 53 accurate bits at every pixel. An explicit override such as
`plot_precision=32` may request a numerical floor, but the default
`plot_precision="auto"` should stop when refinement no longer changes the
rendered color perceptibly.

## Current implementation and measured gaps

The first project implemented a correct split-Mellin evaluator with:

- an ordinary-Python reference path;
- a batched Acb native kernel;
- exact coefficient generation through portable smalljac;
- explicit coefficient, local-grid, and outer-tail estimates;
- independent evaluations at `prec` and `prec+32` to estimate the unproved
  trapezoidal discretization error;
- a bounded cache for exact repeated points.

The main performance gap is architectural rather than a slow coefficient
oracle. For every previously unseen point or batch, Sage.js currently:

1. asks the native evaluator for a plan by passing a tiny coefficient list;
2. generates a coefficient prefix for the first precision;
3. builds and evaluates the first Acb Mellin grid;
4. asks for the refined plan, which may require a larger prefix;
5. regenerates that entire larger coefficient prefix;
6. builds and evaluates a second, unrelated Acb grid;
7. converts a JavaScript number array into an `fmpz` vector on every native
   call;
8. converts every result and diagnostic component through decimal strings.

The grid polynomial is also evaluated as successive powers plus
`arb_addmul_fmpz`, rather than a descending Horner loop. Each point weight is
recomputed with an Acb exponential and inverse at every grid node even though
the nodes are equally spaced.

### Observed single-point timings

For `E=[1,2,3,4,999]`, conductor `430250329`, at default precision on the
development x64 host:

| Point | Sage.js | Sage/Dokchitser | Ratio |
| --- | ---: | ---: | ---: |
| `1+3*I` | 0.556 s | 0.253 s | 2.2x |
| `1+4*I` | 0.574 s | 0.256 s | 2.2x |
| `1+10*I` | 1.362 s | 0.341 s | 4.0x |
| `1+20*I` | 3.183 s | 0.521 s | 6.1x |
| `3+I` | 0.832 s | 0.086 s | 9.7x |
| `4+I` | 0.988 s | 0.033 s | 30x |
| `10+I` | rejected | 0.005 s | n/a |

The current `10+I` rejection is caused by the split-Mellin real-offset limit,
not by a mathematical inability to evaluate the series.

### Observed internal work

Representative native timings from the same curve show the cost of doing two
full Acb passes:

| Workload | 53-bit pass | 85-bit pass |
| --- | ---: | ---: |
| `1+3*I` | 196 ms | 336 ms |
| `1+20*I` | 581 ms | 809 ms |
| six-point mixed batch | 767 ms | 997 ms |

For the six points
`[1+3I, 1+4I, 1+10I, 1+20I, 3+I, 4+I]`, one public `L.values` call took
about 3.45 seconds, versus roughly 7.5 seconds for independent calls. The
checked benchmark's five-point user-curve batch took about 1.21 seconds versus
3.67 seconds independently.

A native 16-by-16 rectangular batch spanning real parts `[-1,1]` and
imaginary parts `[-10,10]` took approximately:

- 288 ms to generate the maximum coefficient prefix;
- 742 ms for the 53-bit native pass;
- 976 ms for the 85-bit native pass.

Thus dense evaluation is already feasible when the grid is genuinely shared.
The present public layer took about 3.9 seconds for an 8-by-8 rectangle.

### Current batch correctness and scaling defects

These must be fixed before advertising plotting:

- `_evaluate` inserts every result into a 64-entry cache and reconstructs the
  return list from that cache. A batch larger than 64 both exceeds the cache's
  intended role and currently reaches an invalid map-deletion operation.
- Even after fixing deletion, reconstructing a large batch from a cache that
  has evicted its first entries is incorrect.
- The native adapter has a fixed 256-point cap although the separate
  point-grid operation limit would safely permit larger batches in many
  regions.
- `complex_plot` currently samples callable functions one point at a time and
  has no batch-evaluation protocol.
- Native batch results allocate many nested objects and decimal strings per
  point, which is appropriate for diagnostic values but wasteful for image
  pixels.

## Mathematical routes

### Route A: direct Dirichlet series in the right half-plane

For `s=sigma+i*t`, use

```text
L(E,s) = sum_{n>=1} a_n exp(-s*log(n)).
```

The existing implementation already relies on the elementary coefficient
bound

```text
abs(a_n) <= n.
```

For `sigma>2`, it gives the explicit absolute tail bound

```text
abs(sum_{n>K} a_n*n^(-s))
    <= sum_{n>K} n^(1-sigma)
    <= K^(2-sigma)/(sigma-2).
```

The direct planner should solve this inequality at the requested absolute
target, including guard bits and the stronger refinement target. It should
select the direct route only when the resulting coefficient and operation
counts are below declared limits. Otherwise it should transparently retain
the split-Mellin route.

This makes routing workload-based rather than a brittle fixed threshold. At
`10+I`, even a conservative refined cutoff is only in the thousands or tens
of thousands. At `4+I`, the elementary proved bound can demand too much work,
so the planner may correctly continue to choose Mellin.

Implement the readable direct sum first in ordinary Python. The production
native form should use Acb or a source-transparent compiled loop over packed
signed coefficients. It must return the same raw value schema and explicit
tail diagnostics as the Mellin route.

Do not use an empirically stable but unbounded direct sum as if it had a proved
tail. A later optional route may use the stronger Deligne/divisor bound or an
explicit Euler-product estimate, but that derivation and its cutoff must be
reviewed separately.

### Route B: optimized split-Mellin evaluation

Keep the established normalization

```text
A = sqrt(N)/(2*pi)
Lambda(E,s) = A^s Gamma(s) L(E,s)
Lambda(E,s) = integral_0^infinity F(u) *
    (exp((s-1)u) + w*exp(-(s-1)u)) du.
```

The following transformations preserve that exact formula.

#### Horner evaluation of the common real grid

At one grid node, replace successive powers

```text
q, q^2, ..., q^K
```

and repeated multiply-adds by

```text
S = a_K
for n from K-1 down to 1:
    S = q*S + a_n
S = q*S
F(u) = exp(u)*S.
```

This computes the identical finite polynomial with approximately one Arb
multiplication per coefficient rather than a power multiplication plus an
`arb_addmul_fmpz`. Compare ball accuracy as well as midpoint performance;
increase working guard bits only if the Horner dependency pattern measurably
widens the final balls.

#### Recurrence for point weights

For equal grid spacing `u_j=j*h`, put

```text
r = exp((s-1)*h)
forward_0 = backward_0 = 1
forward_(j+1) = forward_j*r
backward_(j+1) = backward_j/r.
```

Then form `forward_j + w*backward_j`. This replaces one Acb exponential and
one inverse per point per grid node with one initial exponential/inverse and
two multiplications per later node. Acb balls continue to enclose arithmetic
rounding. Direct differential tests must include large permitted imaginary
parts so recurrence drift is visible.

#### Plan both refinements before coefficient generation

Make planning independent of coefficient marshalling. The adapter should be
able to return `requiredCutoff`, grid size, and work precision without parsing
or copying coefficient entries.

For one public request:

1. compute the `prec` and `prec+32` plans;
2. generate the maximum required coefficient prefix once;
3. pass the appropriate prefix view to each numerical pass.

An insufficient-coefficient result must be returned before the adapter loops
over a large JavaScript array. This removes a currently wasted conversion on
the refined planning call.

#### Packed coefficient boundary

The native L-series cutoff is currently capped at five million and the
implemented coefficient bound gives `abs(a_n)<=n`, so every accepted
coefficient fits safely in signed 32-bit storage. Replace the internal
JavaScript array of boxed numbers with a checked `Int32Array` or an equivalent
owned native coefficient resource.

The public `E.anlist(K)` must continue returning a Sage-compatible Python list.
Only the internal `_anlist_native`/L-series path should retain packed storage.
The native evaluator should consume the packed buffer directly and avoid
constructing an `fmpz` vector entry by entry. Validate length, byte width,
signedness, and ownership at the host boundary.

#### Nested refinement

The first project runs two unrelated grids. Replace them with a refinement
whose fine grid contains the coarse grid, normally by using `h/2` and an
appropriately extended endpoint. Coarse quadrature is then the sum over the
even fine-grid nodes and requires no second evaluation of those `F(u)` values.

The returned value still comes from the high-precision fine pass. The coarse
sum is only the non-rigorous discretization-stability witness. Coefficient and
outer-tail targets remain independently checked.

As a lower-risk intermediate milestone, a binary64 or low-precision Arb coarse
pass may be compared with the final Acb pass. Such a pass can safely cause a
false rejection, but it must never cause an unstable final result to be
accepted. The accepted-result tests must continue to inspect the final Acb
radii and analytic omission estimates.

### Route C: prepared regional batches

For a bounded point set, all values share:

- conductor and root number;
- requested precision;
- maximum imaginary height and real offset;
- coefficient cutoff;
- grid spacing and extent;
- the real sequence `F(j*h)` and local omission data.

Separate preparation from point accumulation internally:

```text
prepared = prepare(E, region, precision)
values = prepared.evaluate(points)
```

The public API need not expose a stable prepared-resource class in the first
version. An internal native resource or a single fused regional call is
sufficient. If a resource is introduced, it must have explicit ownership,
idempotent close, finalizer fallback, byte accounting, and architecture
classification consistent with `ARCHITECTURE.md`.

Prefer the simpler fused batch first: permit any point count whose
`point_count*grid_points` and output allocation satisfy the existing operation
and memory limits. Replace the unconditional 256-point cap with those explicit
limits.

Only add a long-lived prepared resource when measurements show repeated
chunks or related calls still rebuild a material amount of common grid work.

## Public batching and caching contract

### `L.values`

Retain:

```python
L.values(points, prec=53, algorithm="auto")
```

The implementation should:

- preserve input order and duplicates;
- evaluate only the unique uncached points;
- return the complete new batch directly, not reconstruct it from the LRU;
- cache at most the most recent 64 individual results after the return vector
  is already complete;
- bypass individual-result caching for large internal plot batches;
- preserve each result's requested `ComplexField(prec)` parent;
- expose batch diagnostics without storing them once per cache entry.

Fix map eviction through an explicit `sagejs.runtime` operation rather than a
method name that is mis-lowered as Python deletion.

### `values_along_line`

Add the Sage-compatible method:

```python
L.values_along_line(s0, s1, number_samples)
```

Use the Sage normalization whose critical-line center is one. Generate the
equally spaced points exactly in the requested complex field, call one batched
evaluation, and return `(point, value)` pairs. Add optional `prec` and
`algorithm` keywords only where they do not break Sage-compatible positional
semantics.

### User-facing diagnostics

Keep detailed diagnostics internal but add a stable, concise way to inspect
the last request, for example `L.last_diagnostics()` rather than relying on a
private attribute. It should identify:

- selected route: `direct` or `mellin`;
- point count and unique point count;
- coefficient cutoff and whether the prefix was extended;
- coarse/fine grid sizes;
- packed versus fallback coefficient backend;
- known analytic error estimate;
- refinement difference and status;
- elapsed phase timings when timing diagnostics are explicitly enabled;
- `rigorous=False` and the unproved discretization status for Mellin results.

Do not add routine timing overhead when diagnostics are not requested.

## `complex_plot` integration

### Batch protocol

Add a private plotting protocol rather than guessing from a public method
name. For example, a callable may provide:

```text
_plot_complex_batch(points, precision, region) -> packed or ordinary values
```

`Lseries_ell` implements this protocol. `complex_plot` should:

1. construct its flattened rectangular point grid;
2. pass the complete rectangle/envelope to the batch provider;
3. reshape returned values into rows;
4. retain `None` only for points whose evaluation explicitly failed;
5. perform the existing domain-color conversion unchanged.

Other callables retain the present scalar sampling behavior. Do not identify
an L-series by class name or by the existence of a generic `values` method.

### Precision policy for images

Pixels do not need a 53-bit `ComplexField` result plus decimal diagnostics per
sample. Two reliable decimal digits are often visually ample, but a fixed
two-decimal-place test is not the right contract: it is scale-dependent, and
phase is ill-conditioned near a zero. The acceptance criterion should instead
be stability of the final domain-color mapping.

Keep ordinary `L(s)`, `L.values(...)`, and `values_along_line(...)` at their
requested numerical precision. Only the private plotting protocol may use the
following adaptive visual policy:

1. Choose a low initial target from the image dimensions, rectangle, and color
   map. With the current native minimum, 16 target bits is a reasonable first
   implementation; it is already more conservative than a literal two-digit
   requirement.
2. Evaluate a coarse and fine version with guard precision, map both complex
   values through exactly the same phase/magnitude-to-color function, and
   compare the resulting display colors.
3. Accept a pixel when every rendered channel changes by at most one 8-bit
   color level by default. Make this perceptual tolerance explicit and
   configurable, for example as `color_tolerance=1/255`.
4. Re-evaluate only ambiguous pixel groups or tiles at successively higher
   targets such as 24 and 32 bits. Do not force the entire rectangle to the
   precision needed by a few difficult pixels.
5. If `abs(L(s))` is comparable to its numerical uncertainty, treat phase as
   undefined. Refine that pixel; if it remains unstable at the plotting
   ceiling, render it with an explicit missing/neutral policy rather than a
   plausible arbitrary hue. Never snap a near-zero value to zero.
6. For color maps with contour bands or discrete classifications, require the
   band/classification itself to be stable in addition to the RGB tolerance.

The rectangle and pixel dimensions should influence the initial target:
spatial sampling error normally dominates tiny numerical changes in a small
image. They do not by themselves certify a pixel, however; the coarse/fine
color comparison is the final acceptance check. Report aggregate counts of
pixels accepted at each precision and pixels left unstable so performance and
image quality remain inspectable.

The first implementation may reuse the arbitrary-precision batch and convert
its results. Measure before adding a specialized path. If object/string output
dominates, add a separate packed plotting result containing interleaved
binary64 real and imaginary components plus one aggregate diagnostic record.
Binary64 is only the transport representation in that design; it does not
imply that 53 accurate bits were computed internally.

A packed plotting path remains non-rigorous, but it must be derived from a
coarse/fine stabilized evaluation. Nonfinite or unstable pixels must be
reported or left blank; they must not silently become zero or a plausible
color.

### Symmetry and regular-grid opportunities

After the basic prepared batch works, optionally exploit:

```text
L(conjugate(s)) = conjugate(L(s))
Lambda(s) = w*Lambda(2-s).
```

For rectangles symmetric about the real axis or critical line, evaluate a
fundamental portion and reconstruct the rest. This is an optimization only;
the unsymmetrized batch remains the differential oracle.

Regular imaginary spacing also turns the point accumulation into a Fourier-
type transform. FFT/chirp-z acceleration is explicitly deferred until the
ordinary prepared batch is measured and found insufficient.

## Routing policy

For each request:

1. Normalize and deduplicate points.
2. Handle exact trivial zeros and exact functional-equation central zeros.
3. For each point or compatible subgroup, ask the direct-series planner for a
   proved, resource-bounded cutoff.
4. Evaluate feasible direct points through the direct route.
5. Group remaining points into Mellin batches with compatible regional
   envelopes; avoid letting one extreme point unnecessarily enlarge all
   ordinary points.
6. Plan coarse and fine work before coefficient generation.
7. Generate one maximum packed coefficient prefix and take zero-copy prefix
   views where possible.
8. Run the stabilized native or ordinary-Python fallback.
9. Reject excessive work before allocating the prefix or point arrays.

Batch grouping matters. A single `1+100*I` point should not force 1,000
low-height points to use its grid. Use deterministic height/real-offset buckets
or a cost model that compares one enlarged grid against two smaller grids.

`algorithm="reference"` retains the readable reference evaluator.
`algorithm="native"` requires the optimized native capability.
`algorithm="auto"` may choose `direct` or `mellin` as mathematical routes; it
must not silently substitute a numerically weaker algorithm after a stability
failure.

## Architecture

Follow the repository implementation order:

1. direct-series planning, routing, batching, cache behavior, and plotting
   integration live in ordinary strict Python;
2. use source-transparent `@native` compilation for a packed direct-sum loop
   if it supports the required complex operations and buffer types;
3. use the existing mature Arb/Acb operations for arbitrary-precision complex
   arithmetic;
4. extend the existing audited C primitive only for the shared Mellin grid,
   packed coefficient adapter, nested Acb accumulation, or a measured plotting
   boundary that cannot yet be expressed by the compiler.

Do not move public routing or cache policy into C. Keep the host-independent
core separate from N-API. Every changed native export, file classification,
audit hash, and consumer inventory must be regenerated and reviewed.

The packed coefficient representation should be host-independent. N-API may
borrow a typed buffer for one call, but the core ABI should accept a signed
fixed-width pointer and explicit length, making a future CPython or Wasm host
possible without extracting the algorithm from JavaScript glue.

## Validation corpus

Reuse the committed ten-curve, 261-value Sage/PARI corpus and twenty
independent Magma values. Add focused performance-route fixtures for:

- the user curve at `1+3I`, `1+4I`, `1+10I`, `1+20I`, `3+I`, `4+I`, and
  `10+I`;
- both root signs;
- ranks zero through five at and near the center;
- exact trivial zeros and the existing near-`-1` no-snapping point;
- conjugate pairs and functional-equation pairs;
- direct/Mellin crossover points on both sides of the routing decision;
- 53, 100, 200, and focused 512-bit requests;
- batches of 1, 2, 64, 65, 256, and more than 256 points;
- duplicate points and mixtures of cached and uncached points;
- a line sample matching Sage's `values_along_line`;
- 16-by-16 and 100-by-100 complex-plot rectangles.

### Mathematical differentials

- New Horner grid values versus the current power-sum formula at randomized
  cutoffs, `q`, and precision.
- Recurrent weights versus direct Acb exponentials at randomized complex
  points and the maximum supported height.
- Direct-series values versus Sage/Dokchitser, Sage/PARI oracle values, and
  the split-Mellin evaluator where both routes are feasible.
- Direct-series tail bounds against actual larger-prefix differences.
- Nested coarse/fine results versus the current two independent grids.
- Packed coefficient results versus the public Python-list `anlist`.
- Large batch results versus independent single evaluations.
- Batched `complex_plot` sample colors versus the scalar sampler on a small
  grid.
- Auto-precision plot colors versus a 53-bit scalar baseline, accepting only
  pixels within the configured rendered-channel tolerance.
- Difficult pixels near zeros and phase/color boundaries refine to a higher
  target or become explicitly unstable; ordinary pixels remain on the cheap
  low-precision path.
- Explicit `plot_precision` overrides retain their requested numerical floor
  without changing the precision contract of ordinary `L(s)` calls.

### Failure and resource tests

- A direct cutoff exceeding the resource limit routes to Mellin or raises
  before coefficient generation.
- A Mellin request outside the moderate-height limits raises a concise Python
  resource error, not a raw JavaScript stack.
- Invalid/nonfinite points fail before native allocation.
- A batch beyond memory or point-grid limits fails before allocating result
  objects.
- Cache eviction never changes the returned batch or leaks unbounded state.
- Unstable refinement never produces plot pixels or public numerical values.
- Native-disabled execution retains a correct ordinary-Python fallback for
  supported workloads.

## Benchmarks and targets

Add one reproducible benchmark that records phase timings and exact workload
identity for Sage.js and Sage/Dokchitser where available. Separate:

- curve/root-number preparation;
- coefficient planning and generation;
- coefficient boundary conversion;
- coarse and fine grid construction;
- point accumulation;
- public result coercion;
- process/module initialization;
- cached repeated calls.

Use an unloaded `bench-1` checkout for final x64 figures and record exact SHA,
CPU, Node, compiler, FLINT, GMP, and smalljac identities.

Initial goals at default precision for the user curve:

- support `10+I` through the direct route and return the pinned value;
- evaluate warm `10+I` in at most 25 ms on the reference x64 benchmark host;
- reduce each fresh `1+3I`, `1+4I`, `1+10I`, and `1+20I` Sage.js baseline by
  at least 35%;
- bring `1+3I` and `1+4I` within 1.5x of the matched Sage/Dokchitser host
  timing where the baseline is available;
- make five-point batching at least 3x faster than five fresh independent
  evaluations;
- make a 16-by-16 prepared rectangle complete in at most 3 seconds after
  process/module initialization;
- make a 100-by-100 default plotting rectangle complete in at most 10 seconds
  without unbounded cache growth;
- make the default adaptive visual-accuracy plot materially faster than the
  same rectangle forced to 53 target bits, with a goal of at least 2x on the
  reference x64 host;
- keep all accepted auto-precision pixels within one 8-bit channel level of
  the 53-bit baseline under the default color map;
- keep identical cached calls below 5 ms;
- keep analytic-rank central-kernel timing within 10% of its pre-project
  median, or improve it through the shared Horner grid.

The plotting targets include numerical evaluation and public result transfer,
but exclude browser rendering. Report medians and raw samples; do not weaken a
correctness check to meet a timing target.

## Implementation phases

### P0 — Freeze performance and route evidence

- Extend the benchmark with the user-provided point set, native phase timings,
  direct-series convergence, line batches, and rectangular batches.
- Record matched Sage/Dokchitser timings on the same host where possible.
- Add regression tests for the greater-than-64 cache failure and the `10+I`
  resource error before fixing them.
- Record native operation counts, coefficient cutoffs, grid sizes, work
  precision, and conversion cost.

Exit criterion: every claimed optimization has a reproducible baseline and an
unchanged numerical oracle.

### P1 — Public batch correctness and far-right routing

- Fix large-batch return construction and bounded cache eviction.
- Deduplicate input points without changing order or duplicates.
- Implement ordinary-Python direct-series planning, tail bounds, and values.
- Add the optimized native/compiled direct-sum loop if measurements require it.
- Route feasible right-half-plane points before applying Mellin domain limits.
- Translate resource errors into concise Sage.js exceptions.
- Add `values_along_line` and document `L.values`.

Exit criterion: `10+I` returns the pinned value quickly; batches above 64 are
correct; direct and Mellin crossover tests pass.

### P2 — Mellin hot loops and packed coefficients

- Replace the grid power sum with Horner evaluation.
- Replace per-node point exponentials with a recurrence.
- Make native planning return before coefficient marshalling.
- Plan both precisions before generating coefficients.
- Generate one maximum prefix and use checked prefix views.
- Replace boxed coefficient arrays and repeated `fmpz` conversion with packed
  signed storage.
- Preserve the ordinary Python-list public `anlist` API.

Exit criterion: native midpoint/radius differentials pass at all fixture
precisions and the fresh moderate-point timing falls by at least 35%.

### P3 — Fused or nested refinement

- Implement a nested fine/coarse grid or a reviewed cheap coarse pass.
- Reuse common `F(u)` work and the maximum coefficient prefix.
- Preserve explicit analytic omission estimates and final Acb radius checks.
- Compare acceptance/rejection decisions with the old independent policy over
  the entire corpus and randomized points.

Exit criterion: accepted values retain every pinned digit and refinement
diagnostic while total work approaches one fine evaluation rather than two
complete evaluations.

### P4 — Prepared dense evaluation and plotting

- Add the private `complex_plot` batch protocol.
- Permit large batches according to explicit point-grid and memory limits.
- Group ordinary point sets by compatible regional cost.
- Use one prepared/fused coarse-and-fine computation per plot region.
- Add `plot_precision="auto"`: begin at a low target (initially 16 bits),
  compare final rendered colors, and refine only unstable pixel groups.
- Add a configurable rendered-color tolerance and an explicit numerical
  precision override for reproducibility.
- Track and expose aggregate accepted-at-16/24/32-bit and unstable-pixel
  counts in plot diagnostics.
- Treat near-zero phase and contour-boundary ambiguity explicitly; do not
  manufacture a stable-looking color from an unresolved value.
- Bypass the individual LRU for image pixels.
- Measure ordinary complex output first; add packed binary64 plotting output
  only if conversion dominates.
- Add optional conjugation/functional-equation symmetry after the basic path
  is correct.
- Document `complex_plot(L, ...)` with a reproducible example.

Exit criterion: a 100-by-100 plot uses bounded batched native calls, meets the
plotting performance target, and its accepted auto-precision pixels match the
53-bit scalar baseline within the declared rendered-color tolerance.

### P5 — Cross-platform and repository gates

- Run exact-SHA builds on Linux x64, Linux arm64, macOS arm64, and native
  Windows x64.
- Run direct, Mellin, batch, line, plot, analytic-rank, and smalljac focused
  tests on every applicable platform.
- Run formatting, strict Pyright, architecture inventories, native suites, and
  `pnpm test:changed`.
- Record exact-SHA benchmark receipts and honest unrelated load-sensitive gate
  results.
- Commit and push coherent changes with clean worktrees.

Exit criterion: all platforms return the pinned single/direct/batch values and
the supported plotting smoke produces the same bounded semantic result.

## Suggested parallel lanes

If implemented in parallel, use narrow lanes:

1. **Direct-route/API lane** — cache correctness, direct-series planner and
   fallback, `values_along_line`, user documentation.
2. **Mellin-kernel lane** — Horner grid, recurrent weights, nested refinement,
   focused Acb differentials.
3. **Coefficient-boundary lane** — packed anlist storage, plan-before-copy,
   one-prefix policy, Windows/ARM ABI validation.
4. **Plotting lane** — private batch protocol, rectangle preparation, packed
   pixel output if justified, semantic plot tests.
5. **Oracle/benchmark lane** — matched Sage timings, route corpus, profiling,
   exact performance receipts.
6. **Integration lane** — shared registries, architecture inventories,
   public exports, merge, broad gates, and cross-platform coordination.

Only the integration lane should edit shared addon registries, package/test
manifests, architecture inventories, or broad graphics/native policy files
unless explicitly coordinated.

## Main risks and mitigations

### Faster refinement weakens the non-rigorous safeguard

Nested or low-precision coarse work is correlated with the fine computation.

Mitigation: validate decisions against the old independent grids over the
full corpus and randomized boundary points. Keep final Acb and analytic-error
checks mandatory. Treat the coarse computation only as a stability witness.

### Direct-series routing becomes heuristic

Fast empirical convergence is tempting at `3+I` and `4+I`, but does not by
itself justify requested digits.

Mitigation: initially route only when the explicit `abs(a_n)<=n` tail meets the
target within resource limits. Add stronger bounds only with a reviewed
derivation and tests.

### Packed coefficients change public semantics

Typed arrays are representation objects, not Sage lists.

Mitigation: keep packed storage private to `_anlist_native` and the native
L-series core. Materialize a normal Python list at the public `anlist`
boundary.

### One extreme point makes a batch slower

The common plan is governed by maximum height and real offset.

Mitigation: use a deterministic cost-aware grouping policy. Compare estimated
coefficient and point-grid terms before merging regions.

### Plotting allocates thousands of arbitrary-precision objects

Even a fast mathematical kernel can lose to result marshalling.

Mitigation: bypass the individual LRU, measure output conversion separately,
and add one packed aggregate plotting result if needed.

### Prepared native resources leak or retain too much memory

Mitigation: prefer one fused call first. If a resource is justified, require
explicit ownership, close/finalizer tests, byte accounting, and bounded caches.

### High-height scaling remains poor

The current Molin-style work grows rapidly with `abs(Im(s))`.

Mitigation: publish the moderate-height scope and operation counts. Do not
weaken accuracy to meet a high-height benchmark. Leave approximate functional
equations and zero searches to the dedicated follow-up project.

## Completion criteria

The project is complete when:

- `L(10+I)` returns the pinned Sage value through a documented direct route;
- direct routing has an explicit tail bound and never performs an unbounded
  large prefix allocation;
- fresh moderate-point timings improve by at least the stated target without
  changing returned digits or parents;
- batches larger than 64 return correctly with bounded cache state;
- `values_along_line` matches Sage-compatible points and values;
- `complex_plot(L, ...)` invokes a bounded regional batch path rather than one
  independent L-series evaluation per pixel;
- default plots use adaptive visual accuracy, preserve ordinary evaluation's
  precision contract, and refine or explicitly mark pixels whose phase,
  contour class, or rendered color is unstable;
- accepted default-plot pixels match the 53-bit color baseline within one
  8-bit channel level, and diagnostics report how many pixels required each
  precision tier;
- 16-by-16 and 100-by-100 plotting benchmarks meet their targets or record a
  reviewed, quantified blocker rather than silently shipping a slow path;
- Horner, recurrence, packed-coefficient, and nested-refinement differentials
  pass against the original formulas;
- all existing 261 Sage/PARI and 20 Magma oracle comparisons remain green;
- analytic-rank, smalljac, functional-equation, conjugation, and trivial-zero
  tests remain green;
- public documentation states the non-rigorous and moderate-height limits;
- Linux x64/arm64, macOS arm64, and native Windows x64 pass on one exact code
  revision;
- architecture, strict-Python, formatting, native, and changed-test gates are
  clean or any unrelated load-sensitive failures are isolated and recorded;
- all implementation and validation changes are committed and pushed from
  clean worktrees.

## Deferred follow-up projects

Keep these outside this bounded optimization pass:

1. proved Molin/trapezoidal discretization bounds and public ball values;
2. high-height approximate functional equations;
3. Hardy functions, zero location/counting, and critical-line scans;
4. FFT/chirp-z acceleration for very dense regular height grids;
5. derivatives and Taylor series at arbitrary complex points;
6. twists and family-wide prepared evaluators;
7. higher-genus and general motivic `L`-functions.

## Implementation receipt

Implemented on the `ell-lseries` branch in August 2026.

- Added an explicit-tail direct Dirichlet-series route for far-right points,
  including native Acb evaluation and independent refinement.
- Reworked the split-Mellin kernel around a descending Horner grid,
  recurrent point weights, packed signed coefficients, plan-before-copy, and
  a nested coarse/fine refinement witness.
- Fixed batches larger than the 64-entry LRU, preserved order and duplicates,
  raised the native batch ceiling under operation limits, added
  `values_along_line`, and exposed concise last-request diagnostics.
- Added a private regional plotting protocol. `complex_plot(L, ...)` now uses
  bounded batches, conjugation symmetry, adaptive 16/24/32-bit visual
  refinement, rendered-channel comparison, and explicit unstable pixels.
- Retained the readable arbitrary-precision reference implementation and the
  public non-rigorous numerical contract.

On the development x86-64 host, the user curve's warm `L(10+I)` direct call is
about 12--14 ms, a 16-by-16 rectangle is about 0.76 s, a 101-point line is
about 0.72 s, and a default 100-by-100 adaptive plot is about 3.1 s. The same
plot forced to 53 bits is about 5.6 s: materially faster, though the measured
1.8x ratio is below the aspirational 2x target. Every accepted adaptive pixel
in the regression grid is within one 8-bit channel level of the 53-bit
baseline, and unresolved phase is never rendered as a plausible hue.

### Follow-up optimization receipt

A subsequent low-hanging-fruit pass removed the remaining fixed public batch
ceiling and reduced dense-plot marshalling overhead:

- `L.values(...)` now divides arbitrary request sizes into bounded native
  chunks, merges diagnostics and results in input order, and reconstructs
  exact conjugate pairs from one canonical evaluation.
- The existing native `ecLseriesValues` boundary gained an explicit plan-only
  mode. Plotting can determine its coefficient cutoff and point-grid budget
  before copying a large coefficient prefix or allocating value results.
- Plot batches now return one packed binary64 coarse/fine/error buffer instead
  of thousands of nested decimal objects. Ordinary `L(s)` and `L.values(...)`
  retain their arbitrary-precision decimal/Acb result contract.
- Adaptive plots coalesce the former 10,000-point tiles into prepared regions
  of up to 100,000 canonical points, subject to the existing dynamic
  point-grid work budget. Oversized regions are subdivided transparently and
  retain the shared coefficient prefix.
- The benchmark now records a 300-by-300 adaptive plot and whether the packed
  prepared-grid path was used.

On the development x86-64 host, the focused 10,001-point native packed test
takes about 0.09 seconds. A 142-by-142 public complex plot evaluates 10,082
canonical points after conjugation in one prepared region and takes about 3.8
seconds in the focused integration test. These timings exclude a cold Sage.js
module compilation.
