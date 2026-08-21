# Plan for cached central weights, prepared `L`-functions, and GPU twist scans

## Decision

Implement these as two layers of one project:

1. build a specialized, cached CPU/Arb central-weight engine for the genus-2
   and genus-3 Hasse--Weil `L`-functions already supported by Sage.js;
2. use the same weight functions and coefficient contract in an optional GPU
   backend for high-throughput quadratic-twist screening;
3. after the central engine is stable, introduce a reusable `LFunctionInit`
   object that also prepares general complex evaluation.

The CPU engine is the mathematical foundation and the authoritative numerical
backend. The GPU is a throughput accelerator, not a replacement for Arb. A GPU
result must never be presented as an arbitrary-precision Arb ball, and a GPU
screen must never silently become a proof of analytic rank.

The first production target is central values, central derivative jets,
probable analytic ranks, leading derivatives, and coprime quadratic twists of
the existing genus-2/3 hyperelliptic curves over `QQ`. The current inverse-
Mellin theta evaluator remains the readable independent implementation and the
general-complex fallback throughout the project.

Do not add PARI, Magma, `lcalc`, or a standalone program as a runtime
dependency. PARI/Sage and Magma remain development oracles. FLINT Arb/Acb is
already a supported dependency on Linux x64/arm64, macOS arm64, and native
Windows x64 and remains the natural high-precision implementation layer.

## Why the projects overlap

For a curve of genus `g`, retain the existing normalization

```text
Lambda(s) = A^s Gamma(s)^g L(s),
A = sqrt(N)/(2*pi)^g,
Lambda(s) = w Lambda(2-s).
```

Let `K_g` be the inverse Mellin transform of `Gamma(s)^g`:

```text
integral_0^infinity K_g(x) x^(s-1) dx = Gamma(s)^g.
```

After splitting the Mellin integral at the central point and applying the
functional equation, define

```text
W_(g,k)(x) = integral_1^infinity K_g(x*t) log(t)^k dt.
```

Then the completed central derivatives are

```text
Lambda^(k)(1)
  = (1 + w*(-1)^k) * sum_(n>=1) a_n W_(g,k)(n/A).
```

This identity is the shared core:

- a single curve evaluation is a weighted dot product;
- all central derivatives share the same weight construction;
- functional-equation parity makes the wrong-parity derivatives exact zeros;
- for a coprime fundamental discriminant `D`, the twist coefficients are
  `a_n*chi_D(n)` and its scale is `A_D=A*abs(D)^g`;
- a twist family is therefore a batch of character-weighted dot products
  against the same universal functions `W_(g,k)`.

The GPU project should consume this contract. It should not reimplement the
current two-dimensional inverse-Mellin algorithm in a shader.

## Current baseline and the gap to close

The existing genus-2/3 evaluator is mathematically clean and portable. It
builds a theta grid by vertical inverse Mellin, then integrates that grid in a
second direction. It computes two independent coarse/fine plans and uses
FLINT Arb/Acb for finite arithmetic. This is an excellent differential oracle,
but it is much more general than a central value needs.

On the development Linux x64 host, for the conductor-713 genus-2 example:

- generating 5000 exact coefficients takes about 0.73 seconds;
- a 32-bit native central value takes about 0.23 seconds after coefficient
  generation;
- a 32-bit probable-rank calculation also takes about 0.24 seconds;
- PARI requests roughly the same number of coefficients for this small case,
  initializes derivatives through order four in about 14 milliseconds, and
  evaluates an already initialized object in substantially less than a
  millisecond.

The dominant numerical gap is therefore the transform architecture, not the
local-factor engine. The present native computation performs hundreds of
inverse-Mellin and outer-grid operations involving general Arb/Acb functions.
A central-weight engine should reduce the final stage to construction or reuse
of real weights plus one real dot product per permitted derivative.

The GPU opportunity begins only after that reduction. A one-off central value
that PARI computes in a few milliseconds is normally too small to amortize GPU
setup and transfer. Thousands of twists, however, provide the regular batch
needed for a GPU to help.

## Scope

### Included

- Ordinary-Python reference definitions of `K_g` and `W_(g,k)` for `g=2,3`.
- A fast FLINT/Arb implementation of central weights and weighted sums.
- Central values and completed/raw derivatives through a configured order.
- Probable analytic rank and first nonzero raw derivative using exact parity
  and adaptive numerical isolation.
- Reusable in-memory and optional content-addressed on-disk weight caches.
- A general prepared `LFunctionInit` object that owns normalization,
  coefficient prefixes, central plans, and prepared general-value domains.
- A portable optional GPU backend, initially using WebGPU where available.
- Checkpointable coprime quadratic-twist screening with explicit CPU/GPU
  provenance and CPU refinement of interesting or ambiguous rows.
- Differential oracles, performance benchmarks, resource planning, and all
  four supported native platforms.

### Explicitly deferred

- Proof of the Birch--Swinnerton-Dyer conjecture or a proof of a reported
  analytic rank.
- A GPU implementation of Arb or general arbitrary-precision arithmetic.
- GPU acceleration of isolated one-off values by default.
- Non-coprime twist conductor/sign formulas not already supported by the exact
  local-data layer.
- Bad reduction at primes outside the current certified envelope.
- A general-purpose replacement for every PARI `lfuninit` gamma-factor shape.
- Very high imaginary height, zero searches, Hardy functions, or GRH
  verification.
- Family algorithms that beat the ordinary approximate-functional-equation
  length asymptotically.
- A mandatory GPU dependency. CPU-only installations must retain the complete
  correct API.

## Numerical and honesty contract

The existing distinction must remain visible:

- exact coefficients, conductor, root number, and functional-equation parity
  are exact;
- Arb balls rigorously enclose finite arithmetic performed with Arb;
- the complete numerical value is not a theorem-proving enclosure until every
  analytic truncation, interpolation, and quadrature error is proved and added;
- analytic rank remains probable and must raise on unresolved numerical
  isolation.

The central-weight route should improve this contract when practical. In
particular, coefficient tails and weight-table interpolation errors should be
bounded explicitly. If a remaining error is checked only by independent
refinement, diagnostics must continue to say `rigorous=False` and name that
error.

GPU results have a separate contract:

- a GPU screen is finite-precision approximate arithmetic;
- every final high-precision value and every probable-rank decision exposed by
  the ordinary `L`-series API is recomputed or verified by the CPU engine;
- a candidate-only family scan may retain a row as `gpu_screened`, but it must
  record the device, shader, precision strategy, error policy, and threshold;
- if a conservative GPU error bound cannot be established on a device, the
  GPU may propose candidates but may not be the sole reason a candidate is
  discarded in a mode promising candidate-safe screening.

## Mathematical design

### 1. A shared central-weight definition

Create one strict, CPython-parseable module for:

- the completed normalization;
- `K_g(x)` and `W_(g,k)(x)` reference evaluation;
- parity selection;
- conversion of completed derivatives to raw `L` derivatives;
- coefficient-tail bounds;
- immutable plan and diagnostics records.

Do not duplicate the gamma normalization from the current inverse-Mellin
engine. Add direct identity tests between the old central jet and the new
weighted central jet, including the exact factor in `A` and actual derivatives
rather than Taylor coefficients.

For raw derivatives, form the Taylor series

```text
G(z) = A^(1+z) Gamma(1+z)^g
Lambda(1+z) = G(z) L(1+z)
```

and divide truncated series. If `r` is the first nonzero derivative, the lower
terms vanish and the leading raw derivative is simply

```text
L^(r)(1) = Lambda^(r)(1) / A.
```

The general triangular series division should still be implemented and tested
so `central_jet(completed=False)` returns every requested derivative correctly.

### 2. Genus 2: use the Bessel formula directly

For `g=2`, use

```text
K_2(x) = 2 K_0(2*sqrt(x)).
```

For order zero, the integrated weight has the closed form

```text
W_(2,0)(x) = 2 K_1(2*sqrt(x)) / sqrt(x).
```

FLINT already provides real Arb `K_nu` and scaled `K_nu` functions. Use the
scaled variant in the large-argument region to avoid underflow and unnecessary
loss, carrying the exponential scale explicitly in the summation.

For higher `k`, compare and document at least these approaches before freezing
the production implementation:

1. Arb integration of the Bessel kernel, batched over derivative orders;
2. differentiation with respect to an auxiliary Mellin parameter;
3. a recurrence or ODE for consecutive logarithmic moments;
4. piecewise Chebyshev/Taylor tables with certified interval remainders.

Choose based on measured construction cost, evaluation cost, ball quality, and
cache size. A table is attractive only if its construction is independently
checked against direct Arb evaluation and its interpolation remainder is
included in diagnostics.

### 3. Genus 3: a reusable Meijer-G/ODE weight table

For `g=3`, `K_3` is the real Meijer-G function

```text
K_3(x) = G^(3,0)_(0,3)(x | 0,0,0),
```

the inverse Mellin transform of `Gamma(s)^3`. There is no comparably simple
single-Bessel formula. Implement the readable reference via inverse Mellin or
high-precision real integration, then benchmark production alternatives:

- Arb inverse Mellin at a sparse set of seed points;
- the differential equation satisfied by the Meijer-G kernel, propagated on
  a logarithmic grid with interval control;
- asymptotic expansions for large `x` and convergent/logarithmic expansions
  for small `x`;
- piecewise polynomial approximation of `W_(3,k)(x)` rather than repeated
  evaluation of `K_3`.

The production table should be universal for fixed
`(genus, max_order, precision, x_range, algorithm_version)`. It must not depend
on curve coefficients. A curve-specific plan then samples it at `x=n/A`.

Do not make a double-only Meijer-G approximation the sole CPU implementation.
The reference and authoritative paths must support arbitrary requested Arb
precision, even if the fast common case has a specialized 53/100-bit table.

### 4. Truncation and work planning

Derive a coefficient-tail bound appropriate to the genus-`g` coefficients and
the decaying weight. Use the strongest simple bound already justified by the
Euler factors; do not silently reuse the elliptic bound `abs(a_n)<=n` when it
does not apply.

The planner must determine before allocation:

- coefficient cutoff;
- required weight-domain interval;
- target and working precision;
- requested derivative parity/orders;
- estimated coefficient, table, and dot-product work;
- memory for coefficients, weights, and batched twists;
- whether the request fits declared limits.

Refinement should increase precision and/or cutoff and compare nested results.
An unresolved derivative raises the existing numerical-indeterminacy error.

### 5. Weight-table representation

Use a representation that can be consumed by both CPU and GPU:

- partition the relevant `log(x)` interval into explicit segments;
- store scaled polynomial coefficients in a fixed documented order;
- store an absolute approximation-error bound per segment and derivative;
- include the genus, derivative order, precision, domain, scaling convention,
  construction algorithm, and source hash in the table identity;
- validate every lookup range and reject extrapolation;
- make serialization endian-independent and versioned.

The CPU Arb path may retain exact Arb coefficients/radii. The GPU copy may use
`f32`, paired-`f32` (double-single), or another explicitly described packed
format derived from the authoritative table. These are different
representations of one mathematical table, not independent algorithms.

## Cache architecture

Use three bounded caches rather than a single opaque cache:

1. **Universal weight cache** keyed by genus, order, precision, `log(x)` range,
   and algorithm version.
2. **Curve plan cache** keyed by the exact `L`-function identity, conductor,
   root number, coefficient cutoff, precision, and maximum derivative order.
3. **Coefficient-prefix cache** retaining the existing exact extendable
   coefficient provider.

The cache must obey these rules:

- repeated calls at lower order/precision may reuse a stronger plan;
- a stronger request may extend rather than discard compatible data;
- memory limits and eviction are explicit and testable;
- cached objects are immutable after publication, or synchronize extension;
- concurrent calls cannot observe partially initialized weights;
- failures and cancellation do not poison the cache;
- disk cache entries are content-addressed, checksummed, atomic on write, and
  safe to delete;
- FLINT version, target ABI, representation version, and endianness participate
  where they affect bytes;
- no JavaScript object identity is used as the persistent mathematical key.

Report construction time separately from warm evaluation time. The main value
of a prepared engine is lost if benchmarks hide table construction or, in the
opposite direction, pretend a warm cache is a fresh call.

## Public API and `LFunctionInit`

### Convenience calls

Existing convenience methods continue to work and select the new central
route under `algorithm="auto"` when supported:

```sage
L = C.lseries()
L.value(1)
L.central_jet(4)
C.analytic_rank(leading_coefficient=True)
```

Keep the old inverse-Mellin route selectable for differential testing and
unsupported weight domains. Use mathematical algorithm names in diagnostics;
do not describe “native” as if it were a mathematical method.

### Prepared object

Add a reusable initialization interface conceptually like:

```sage
I = C.lseries().init(prec=100, max_order=6)
I.central_value()
I.central_jet(6)
I.analytic_rank()
I.leading_derivative()
I.diagnostics()
```

`LFunctionInit` should be an immutable prepared mathematical object with a
deterministic `close()` only if it owns native resources. It should retain:

- exact conductor, sign, center, gamma factors, and coefficient-provider
  identity;
- declared precision and resource policy;
- compatible coefficient prefixes;
- prepared central weights;
- prepared general-value regions as they are requested;
- diagnostics and normalization metadata.

The next phase generalizes it beyond the center:

```sage
I = C.lseries().init(prec=80, domain=(0, 2, -20, 20))
I(1 + 3*I)
I.values_along_line(1, 1 + 20*I, 1001)
```

Route a prepared request among:

- central weights at `s=1` and for central derivatives;
- a direct Dirichlet series in the absolutely convergent right half-plane;
- the existing prepared inverse-Mellin theta grid on moderate complex boxes;
- the functional equation for reflected points.

The first `LFunctionInit` release need only support the current self-dual
genus-2/3 data descriptor. Design the descriptor so gamma shifts and center are
explicit, but do not claim arbitrary PARI `L`-data support until it is tested.

## Native CPU boundary

Prefer ordinary strict Python plus declared FLINT functions or
source-transparent `@native` compilation. Handwritten C is justified only for
a measured representation/foreign-library limitation and must be classified
and audited.

The host-independent core should have batched operations conceptually
equivalent to:

```c
int sagejs_lfunction_central_weight_plan(...);
int sagejs_lfunction_central_weights(...);
int sagejs_lfunction_central_dot_products(...);
```

Inputs must be packed, exact where exactness matters, and explicitly sized.
Results must include actual derivatives, not silently switched Taylor
coefficients. The core does not call Node, Python, JavaScript, or callbacks.

Prefer two execution shapes:

- build/export a reusable weight plan;
- apply a plan to one or many packed coefficient/character rows.

Avoid per-weight N-API objects and decimal-string crossings. One call should
return a packed result array plus a compact diagnostics object. If an owned
native weight resource materially improves warm calls, introduce it through
the repository's declared-resource mechanism with deterministic cleanup and a
copied-byte serialization contract.

## GPU design

### Backend choice

Start with WebGPU because it is the only plausible common compute abstraction
for native Windows, macOS, Linux, and future browser use. Keep it optional and
capability-gated. Audit the size and packaging consequences of Node's available
WebGPU implementation before adopting a runtime dependency.

As of this plan, standard WGSL exposes `f32` and optional `f16`, but no shader
`f64` or general 64-bit integer type. Therefore the first portable backend
must use one of:

- `f32` for a coarse screening pass;
- paired `f32` double-single arithmetic for roughly 44--48 useful bits;
- exact split integer input converted under a documented error bound.

Do not add CUDA, Metal, or Vulkan implementations in the first pass. A later
vendor backend is worthwhile only after the portable kernel proves that the
workload is GPU-limited and the extra backend beats WebGPU materially.

### Batched twist formula

For coprime fundamental discriminants:

```text
a_n(D) = a_n chi_D(n),
A_D = A abs(D)^g,
Lambda_D^(k)(1)
  = (1 + w_D*(-1)^k)
    sum_n a_n chi_D(n) W_(g,k)(n/A_D).
```

The host prepares exact discriminants, conductors, signs, support status, and
the base coefficient prefix. The GPU processes rectangular tiles of
`(D,n)` and derivative order, then performs a deterministic hierarchical
reduction.

Prototype and benchmark two character strategies:

1. CPU construction of bit/byte-packed `chi_D(n)` tiles;
2. GPU evaluation of the Kronecker/Jacobi symbol from packed operands.

The first is simpler and less branchy but transfers more data. The second can
save bandwidth but may diverge heavily. Freeze the choice from end-to-end
measurements, not shader microbenchmarks.

Likewise compare:

- host-evaluated weight tiles transferred to the GPU;
- GPU evaluation of the shared piecewise weight approximation.

The latter is the likely production route for large families because `A_D`
changes with every twist, but only if its approximation and range checks match
the CPU table contract.

### Precision and deterministic reduction

Use a fixed reduction tree, fixed workgroup sizes for a selected device class,
and no unordered floating-point atomics. Record:

- adapter/vendor/device identifiers;
- driver and WebGPU implementation versions when available;
- shader source hash and specialization constants;
- numeric format (`f32`, double-single, or later `f64`);
- workgroup and reduction shape;
- coefficient and weight-table hashes;
- error bound or empirical-refinement policy.

Scale weights and partial sums to avoid subnormal underflow. Handle exact
functional-equation zeros on the CPU without launching a kernel.

### Screening modes

Expose two semantically distinct family modes:

1. **Values mode.** Return every requested central value/derivative at the
   stated precision. CPU/Arb remains authoritative; a GPU may help only when
   its result plus validated error budget meets the request.
2. **Candidate mode.** Use the GPU to identify small or potentially vanishing
   permitted derivatives, then refine those rows with the CPU/Arb engine.

Candidate mode is the initial GPU product. It should support thresholds such
as absolute central value, probable rank at least `r`, or normalized BSD-
motivated quantities. A row near any decision boundary is always retained for
CPU refinement.

The checkpoint record must distinguish:

- exact parity zero;
- GPU-screened and separated;
- CPU-refined numerical value;
- numerically indeterminate;
- unsupported exact local data;
- resource limit;
- cancelled before a safe boundary.

### The unavoidable conductor scaling

For these twists, the analytic conductor makes the ordinary central sum length
grow roughly like

```text
sqrt(N_D) = sqrt(N) abs(D)^g.
```

A GPU reduces the constant in the weighted sums; it does not remove this
growth. The planner must estimate

```text
sum_D cutoff(D)
```

before generating coefficients or allocating GPU buffers. It must reject or
segment work that exceeds CPU coefficient, GPU memory, transfer, or operation
budgets.

If coefficient generation dominates at the desired discriminant range, the
next project is a genuinely family-specific analytic algorithm (Poisson
summation, multiple Dirichlet series, or another research method), not a
larger shader dispatch. Do not hide this distinction in benchmarks.

## Twist scanner integration

Extend the existing checkpointable family scanner rather than creating a
second file format. Bump its schema only if new fields cannot be added under
the existing documented extension policy. Preserve deterministic
discriminant ordering, partial-line recovery, request verification, and safe
cancellation boundaries.

Recommended interface:

```sage
scan = C.quadratic_twists(
    -10^5,
    10^5,
    mode="candidates",
    backend="auto",       # "cpu" or "gpu" are explicit choices
    max_order=2,
    prec=53,
)
scan.export_jsonl("twists.jsonl", resume=True)
```

`backend="auto"` selects the GPU only after a measured crossover based on
twist count, total term count, requested order/precision, device capabilities,
and available memory. An explicit unavailable `backend="gpu"` raises a clear
capability error; `auto` falls back to CPU.

Resume must not depend on GPU scheduling. A safe checkpoint boundary is a
completed deterministic discriminant tile, and rows within it are written in
canonical discriminant order.

## Oracles and test corpus

Build a checked-in offline corpus covering:

- both genera;
- signs `+1` and `-1`;
- analytic ranks 0 through the largest readily available examples;
- nonzero leading derivatives of both parities;
- small and medium conductors;
- supported bad primes and all current honest capability boundaries;
- positive and negative fundamental twists;
- twists with `gcd(D,N)>1`, retained as unsupported where appropriate;
- values with severe cancellation;
- cutoffs landing on every weight-table segment boundary.

For each available row store enough independent data to check:

- conductor, root number, and coefficient-prefix hash;
- completed derivatives and raw leading derivative from Sage/PARI or Magma;
- the current inverse-Mellin result;
- central-weight reference and native results at 53, 100, and 200 bits.

Tests must include:

- exact parity zeros;
- normalization and completed-to-raw conversion;
- Bessel closed-form identities for genus 2;
- genus-3 Meijer-G/ODE/table differential checks;
- tail and interpolation bound dominance on adversarial points;
- cache cold/warm/extension/eviction/concurrency behavior;
- serialized cache corruption and version mismatch;
- `LFunctionInit` equivalence with convenience calls;
- CPU packed batches versus individual evaluation;
- GPU versus CPU on every supported numeric mode;
- deterministic GPU results on repeated execution of one device;
- candidate-threshold boundary cases and mandatory CPU refinement;
- cancellation, device loss, out-of-memory, and checkpoint resume;
- absence of a GPU and explicit CPU fallback.

GPU tests in ordinary CI may use a deterministic software adapter only for
contract coverage. Performance acceptance requires named physical devices.

## Benchmarks and acceptance thresholds

Create one reproducible benchmark that reports cold and warm stages
separately:

1. exact global-data assembly;
2. coefficient-prefix generation;
3. universal weight-table construction/load;
4. curve-plan construction;
5. weighted dot products;
6. completed-to-raw conversion and rank policy;
7. GPU upload, kernel, download, and CPU refinement;
8. checkpoint serialization.

Always print exact commit, platform, compiler, Node, FLINT, GPU adapter/driver,
precision, conductor, cutoff, derivative order, and cache state.

### CPU acceptance

On the pinned corpus and development x64 host:

- new and old central jets agree to the requested accuracy;
- genus-2 central orders 0--4 improve by at least 8x over the current native
  double-Mellin path after coefficients are warm;
- genus-3 central orders 0--4 improve by at least 5x after coefficients are
  warm;
- a repeated evaluation from one `LFunctionInit` is at least 20x faster than
  the current fresh native path;
- small-conductor genus-2 initialization is within 2x of PARI `lfuninit` or
  the remaining gap is accounted for by a named stage;
- no supported workload regresses by more than 20% without a documented
  correctness or memory benefit.

These ratios are gates for the pinned machines, not universal promises.

### GPU acceptance

Do not enable GPU `auto` merely because a shader runs. Require:

- identical candidate sets after CPU refinement on the full oracle corpus;
- no missed CPU-ambiguous or known higher-rank row;
- at least 5x end-to-end speedup over the optimized single-thread CPU weighted
  batch above a recorded crossover workload;
- a material speedup over the optimized multicore CPU batch on at least one
  NVIDIA/AMD Windows or Linux device and one Apple Silicon device;
- transfer, table construction, and checkpoint costs included;
- bounded memory and graceful tiling at the largest accepted workload;
- CPU faster below the crossover and selected by `auto` there.

If WebGPU cannot meet these gates because of its numeric or dispatch limits,
ship the CPU engine and leave the GPU capability experimental rather than
weakening correctness or performance claims.

## Implementation phases

### P0 — Freeze baselines and conventions

- Record current central-value/jet and twist-scan timings.
- Record PARI `lfuninit`, Sage, and Magma oracle values and timings.
- Freeze the `A`, gamma, center, sign, derivative, and coefficient conventions.
- Add the offline rank/derivative/twist corpus and coefficient hashes.

Exit criterion: one script reproduces numerical and timing baselines without
network access.

### P1 — Ordinary central-weight reference

- Implement strict-Python `K_g`, `W_(g,k)`, weighted sums, parity, and raw
  derivative conversion.
- Add explicit resource planning and tail diagnostics.
- Differentially compare with the current inverse-Mellin implementation.

Exit criterion: genus 2/3 central jets agree across the corpus at ordinary and
high precision under the reference algorithm.

### P2 — Fast genus-2 Arb weights

- Implement the Bessel `K_0/K_1` route.
- Select and validate the higher-moment recurrence/table strategy.
- Add packed batched dot products and cold/warm benchmarks.

Exit criterion: correctness gates pass and the genus-2 CPU performance target
is met or the remaining stage is explicitly isolated.

### P3 — Fast genus-3 Arb weights

- Implement the Meijer-G reference seeds and production ODE/series/table.
- Certify or explicitly estimate every interpolation region.
- Add packed batched dot products and resource guards.

Exit criterion: correctness gates pass and the genus-3 CPU performance target
is met.

### P4 — Prepared central API and caching

- Add universal, curve-plan, and coefficient caches.
- Add `L.init(...)` and central prepared methods.
- Route convenience central calls and analytic rank through the prepared plan.
- Preserve the inverse-Mellin implementation as an explicit differential
  algorithm.

Exit criterion: cold/warm, eviction, concurrency, and API-equivalence tests
pass; the repeated-evaluation target is met.

### P5 — General `LFunctionInit`

- Add the exact `L`-data descriptor and domain planner.
- Integrate direct series, prepared inverse Mellin, central weights, and the
  functional equation.
- Add batched complex values and line/plot reuse without rebuilding plans.

Exit criterion: one initialized object serves central and moderate-complex
workloads and agrees with the existing evaluators and PARI/Sage oracles.

### P6 — GPU feasibility kernel

- Add a capability abstraction and physical-device benchmark harness.
- Implement deterministic `f32` and double-single dot-product prototypes.
- Compare CPU/GPU character and weight generation strategies.
- Measure crossover, bandwidth, numerical error, and device-loss behavior.

Exit criterion: a written decision selects the portable representation and
shows an end-to-end speedup on at least two GPU families. Otherwise stop the
GPU work without affecting P1--P5.

### P7 — GPU twist screening

- Implement tiled discriminant/term/derivative dispatch.
- Add candidate-safe thresholds and CPU Arb refinement.
- Record full device/shader/numeric provenance.
- Integrate deterministic progress and cancellation.

Exit criterion: GPU and CPU produce the same refined candidate corpus and the
GPU acceptance thresholds pass.

### P8 — Checkpoint and research workflow

- Extend the JSONL schema and verifier.
- Add resume across changed process/device state when the mathematical request
  is identical.
- Add SQLite/JSONL examples for storing screened and refined records.
- Document how to rerun CPU refinement on GPU-screened candidates.

Exit criterion: interrupted scans resume without duplicate/missing rows and
researchers can independently audit every retained candidate.

### P9 — Portability and repository gates

- Run Linux x64, Linux arm64, macOS arm64, and native Windows x64 CPU tests at
  one exact commit.
- Run physical GPU receipts on representative Windows/Linux discrete GPUs and
  Apple Silicon; keep CPU fallback tests on every platform.
- Run formatting, strict Pyright, architecture checks, relevant native suites,
  sanitizer tests, and changed-test selection.
- Classify/audit every new native file and register every native export.
- Commit and push coherent changes with clean worktrees.

Exit criterion: all supported CPU platforms are green, GPU capabilities fail
closed, and `auto` never selects an unvalidated backend.

## Main risks and mitigations

### Weight normalization drift

A missing power of `A`, factor of two, or derivative factorial can produce
plausible values.

Mitigation: share normalization code, compare actual completed derivatives,
test the genus-2 closed forms, and require central identity checks against the
existing inverse-Mellin engine and PARI/Magma.

### Genus-3 table instability

The Meijer-G kernel has different numerical behavior at small and large
arguments.

Mitigation: use separate series/asymptotic/ODE regions with overlaps, interval
checks at every boundary, and direct high-precision reference evaluations.

### Cache returns a mathematically incompatible plan

A key missing conductor, gamma factor, precision, or algorithm version can
quietly corrupt results.

Mitigation: make the complete immutable `L`-data descriptor part of the key,
content-hash serialized entries, and test near-collision descriptors.

### GPU false negatives near zero

Cancellation and low precision are worst exactly where twist searches are most
interesting.

Mitigation: exact parity on CPU, conservative thresholds, double-single or
scaled accumulation, deterministic reduction, and mandatory CPU refinement
for every near-boundary row. Do not advertise candidate-safe mode on a device
without a validated error policy.

### GPU overhead exceeds arithmetic

Small workloads can be slower after device setup and transfers.

Mitigation: retain persistent pipelines/buffers, tile large batches, benchmark
end to end, and select GPU only above a measured crossover.

### Coefficient generation dominates

At large `abs(D)`, the `abs(D)^g` sum length can overwhelm either processor.

Mitigation: plan total terms first, share and extend one base prefix, expose
the resource limit honestly, and separate future family-asymptotic research
from this constant-factor acceleration.

### Optional GPU dependency harms portability or package size

Mitigation: keep the GPU behind a capability boundary, audit any WebGPU runtime
dependency and native artifacts, and make all tests/API behavior correct with
no GPU installed.

## Completion criteria

The project is complete when:

- central values, jets, probable ranks, and leading derivatives use the cached
  weight engine under `auto` for supported genus-2/3 curves;
- all results agree with the old evaluator and independent CAS oracles at 53,
  100, and 200 bits;
- the CPU performance gates pass and cold/warm costs are reported honestly;
- `LFunctionInit` reuses prepared central and general-complex state;
- the twist scanner has a documented CPU batch path and optional GPU candidate
  path with deterministic checkpointing;
- GPU-refined candidate results match CPU across the full corpus;
- no GPU result is mislabeled as an Arb or rigorous analytic enclosure;
- resource limits account for `abs(D)^g` scaling before large allocations;
- Linux x64/arm64, macOS arm64, and native Windows x64 pass the CPU contract;
- GPU absence and device failure have tested CPU fallbacks;
- architecture, formatting, strict-Python, native, and changed-test gates pass;
- documentation includes reproducible examples and benchmark methodology;
- all changes are committed and pushed, with a clean worktree.

## References and implementation inputs

- Current Sage.js implementation:
  `src/lib/sagejs/hyperelliptic_curves/lseries.py`,
  `src/lib/sagejs/hyperelliptic_curves/twists.py`, and
  `packages/flint/src/elliptic_lfunction.c`.
- Current Sage.js user documentation:
  `docs/hyperelliptic-lseries.md`.
- PARI general `L`-function documentation:
  <https://pari.math.u-bordeaux.fr/dochtml/ref/_L_minusfunctions.html>.
- PARI source algorithms: `src/basemath/lfun.c` and
  `src/basemath/mellininv.c` in the pinned PARI source release.
- Tim Dokchitser, *Computing special values of motivic L-functions*:
  <https://arxiv.org/abs/math/0207280>.
- FLINT real Arb Bessel functions:
  <https://flintlib.org/doc/arb_hypgeom.html>.
- FLINT Arb/Acb ball representation:
  <https://flintlib.org/doc/index_arb.html>.
- Current WebGPU specification:
  <https://gpuweb.github.io/gpuweb/>.
- Current WGSL specification and numeric types:
  <https://www.w3.org/TR/WGSL/>.
- Existing Sage.js performance plan for the related elliptic evaluator:
  `agents/elliptic-curve-lseries-performance-and-plotting-plan.md`.
