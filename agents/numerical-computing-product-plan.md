# Sage.js numerical computing: an agent-first mathematical laboratory

## Status

This is the product and implementation plan for numerical computing in Sage.js.
It deliberately treats Sage compatibility as a floor and frontend, not as the
limit of the product.

The measured optimization backend study, its 25-case corpus, and its
four-platform findings remain authoritative for optimization implementation:

- [`numerical-optimization-backend-strategy.md`](numerical-optimization-backend-strategy.md)
- [`../bench/numerical-optimization/`](../bench/numerical-optimization/README.md)

The existing plotting platform is also a foundation rather than adjacent work:

- [`sage-2d-plotting-coverage-plan.md`](sage-2d-plotting-coverage-plan.md)
- `src/lib/sagejs/plotting/`
- `docs/sage-compatibility/plotting/`

This document records product direction and the evidence required for future
backend choices. It does not by itself qualify a new backend: each addition
must still perform its own library survey, correctness study, portability work,
and performance evaluation.

### Implementation and qualification record

As of 2026-09-02, P0-P7 are implemented and validated for the published
supported surface. P8's fail-closed collection, authentication, and release
workflow are implemented, but this source document makes no final-candidate
release claim. Such a claim exists only after one frozen commit passes the
exact 16-row product matrix and six supplemental requirements represented by
eleven raw records, as described in
[`docs/numerical-computing/qualification/`](../docs/numerical-computing/qualification/).
Candidate SHAs and receipt identities belong in immutable qualification
artifacts and release notes. Editing them into source after qualification
would create a different candidate.

The implemented surface is generated from the live public registries. It
contains 59 classified capabilities: 49 implemented capabilities (41
`extension`, 8 `translated`) and 10 explicit `unsupported` entries. It also
contains 22 frontend operations (20 `translated`, 2 `extension`) and 17 stable
diagnostics. `pnpm architecture:numerics` rejects registry and classification
drift and checks 23 browser lazy roots covering 68 public numerical modules.
The ledger classifies claims that are actually public; deferred variants remain
in the reviewed domain support matrices rather than being manufactured as
callable registry entries.

The integrated implementation includes:

- versioned problem, plan, result, validation, diagnostic, resource-budget,
  trace-policy, event, bounded-trace, provenance, and receipt-binding records;
- four independently validated scalar-root methods and natural Sage, Python,
  MATLAB, and Wolfram views over the same operation;
- interpolation, cubic splines, Chebyshev approximation, finite differences,
  polynomial roots, and one-dimensional adaptive Gauss-Kronrod quadrature;
- dense real binary64 factorizations and solves, symmetric and general
  eigensystems, reduced SVD, FFT, convolution, explicit CSR iterative solves,
  and one narrowly certified sparse dominant-eigenpair path;
- transparent scalar and multivariate optimization, nonlinear systems,
  least-squares, curve fitting, affine fitting, and one explicit-only qualified
  NLopt Nelder-Mead Wasm reactor;
- explicit and stiff IVP solvers, dense output, events, invariants, and bounded
  ODE and generic parameter sweeps;
- descriptive and inferential statistics, reproducible sampling, regression,
  robust fitting, and retained validation evidence;
- a complete reviewed multilingual catalog with 62 Sage.js self-round-tripping
  and 26 explicitly unsupported target-emission cells, with external vendor
  runtime execution classified separately; and
- renderer-neutral explanations, PlotSpecs, animations, and checked teaching
  stories derived only from retained evidence.

Primary executable evidence by phase is retained in the repository:

| Phase | Executable evidence |
| --- | --- |
| P0 | [`common-contracts.cjs`](../test/numerics/contracts/common-contracts.cjs), [`capability-facade.cjs`](../test/numerics/capability-facade.cjs), and [`check-numerical-surface.cjs`](../scripts/check-numerical-surface.cjs) |
| P1 | [`numerical-root-laboratory.cjs`](../test/numerical-root-laboratory.cjs) and [`root-gallery.test.cjs`](../test/numerics/gallery/root-gallery.test.cjs) |
| P2 | The [approximation](../test/numerics/approximation/approximation-laboratory.test.cjs), [polynomial-root](../test/numerics/polynomial-roots/polynomial-roots.test.cjs), [integration](../test/numerics/integration/test.cjs), and [linear-algebra](../test/numerics/linear_algebra/linear-algebra.cjs) laboratories |
| P3 | [`optimization-laboratory.cjs`](../test/numerics/optimization/optimization-laboratory.cjs) plus the cminpack and NLopt backend suites under [`test/`](../test/) |
| P4 | The [explicit](../test/numerics/ode/ode-laboratory.cjs), [stiff](../test/numerics/ode/stiff-laboratory.cjs), and [sweep](../test/numerics/ode/ode-sweeps.cjs) ODE laboratories |
| P5 | The [spectral](../test/numerics/spectral/spectral-laboratory.cjs), [statistics](../test/numerics/statistics/test.cjs), and [bounded-sweep](../test/numerics/sweeps/bounded-sweeps.cjs) tests |
| P6 | [`numerical-catalog.cjs`](../test/numerics/multilingual/numerical-catalog.cjs) and the machine-readable [support matrix](../docs/numerical-computing/multilingual/support-matrix.json) |
| P7 | [`cross-domain-gallery.test.cjs`](../test/numerics/gallery/cross-domain-gallery.test.cjs) and the generated [gallery evidence](../docs/numerical-computing/gallery/evidence.json) |
| P8 | The 69-case [product corpus](../bench/numerical-computing/qualification/product.corpus.json), [campaign tests](../test/numerics/evidence/qualification-campaign.cjs), and [release-workflow tests](../test/numerics/evidence/release-workflow.cjs) |

These domains are separate lazy source packages and their integrated modules
are in the strict CPython/Ruff/Pyright inventory. The backend-neutral product
corpus contains 69 P0-P8 cases across definition identities, differential
oracles, independent residuals, conditioned stress, metamorphic properties,
deterministic fuzz, and failure semantics. The source gallery contains ten
stories and 20 checked cases, including 15 bounded animations. Public
deployment is a separate release action
and must not be inferred from the source artifact.

Completion applies to this reviewed supported surface, not every aspirational
item originally listed below. Explicitly deferred or unsupported areas include
fixed-point iteration; nullspace and pseudoinverse APIs; multidimensional
quadrature; nonlinear constraints; Radau, BDF, LSODA, and SUNDIALS integration;
complex-state, mass-matrix, and DAE ODEs; multidimensional FFTs; full and
advanced sparse eigensystem and SVD variants; rigorous enclosure arithmetic;
arbitrary-precision numerical backends; GPU execution; and industrial-scale
solver guarantees. An available dependency routine never silently promotes
one of these claims.

Before release, the exact candidate must complete its four-platform Node, npm,
SEA, browser/Wasm, callback, portability, performance, memory, payload, and
artifact-integrity qualification without source changes. Any source change
creates a new candidate and requires fresh receipts.

## Product vision

Build the numerical tool I would want to use as both a mathematical programmer
and an agent:

> A portable numerical laboratory that solves standard scientific-computing
> problems, says exactly what it did, exposes enough structure to check and
> refine the result, and can explain the computation to a human with an
> interactive visual narrative.

It should be excellent for undergraduate numerical mathematics and useful for
exploration by working mathematicians. It should run in a browser, Node, and
the Sage.js executable with the same mathematical contracts. It should accept
natural Sage, Python, MATLAB, and Wolfram-language input without maintaining
four numerical implementations.

The likely primary authors are agents. The primary viewers of their results
are often humans. That changes the design priorities:

- machine-readable results are the primary result representation;
- concise mathematical display is a view of that representation;
- every automatic choice is inspectable;
- diagnostics and provenance are data, not prose scraped from logs;
- computations can be replayed or communicated without screenshots;
- plots and animations preserve mathematical intent; and
- unsupported or uncertain cases fail honestly and helpfully.

This is not a SciPy clone in JavaScript, a Sage compatibility exercise, or an
attempt to reproduce every MATLAB toolbox. It is a coherent numerical product
whose compatibility frontends are useful because they let agents communicate
in languages people already recognize.

## The central product decision

Separate five concerns that numerical systems too often conflate:

```text
Sage frontend ───────┐
Python frontend ─────┤
MATLAB frontend ─────┼──> NumericalProblem
Wolfram frontend ────┘          │
                                v
                      planner + capability registry
                                │
                    ┌───────────┼────────────┐
                    v           v            v
              Python source   Wasm pack   mature library
              implementation   backend       backend
                    └───────────┼────────────┘
                                v
                  NumericalResult + NumericalTrace
                         │                  │
                         v                  v
                text/JSON/code       domain visualizer
                                            │
                                            v
                                      PlotSpec/Plotly
```

The public mathematical contract, backend selection, execution, result model,
and explanation/visualization layer are independent. A solver does not emit a
Plotly object. A parser does not pick a C function. A backend's success string
does not become mathematical truth.

## Guiding principles

### 1. Sage is an authority and frontend, not the architecture

Sage's numerical history and examples are valuable, and Sage-named functions
should behave naturally. But Sage's numerical surface is often a historical
wrapper around another package. Reproducing every wrapper quirk would spend
scarce effort on the least interesting layer.

The historical move from direct GSL wrappers toward SciPy delegation is itself
useful evidence: the enduring value was the mathematical operation and familiar
Sage entry point, not permanent attachment to one backend. Sage.js should make
that separation explicit from the beginning.

Classify each Sage-facing operation as:

- **faithful** — meaningful Sage-visible semantics are deliberately preserved;
- **translated** — the mathematical intent is preserved through a better
  Sage.js result or backend;
- **extension** — Sage.js provides useful behavior beyond Sage; or
- **unsupported** — rejected explicitly, with a reason and useful alternative.

There is no “probably works” state. Compatibility claims are qualified by
method, numeric type, options, and validated envelope.

### 2. The canonical API is designed for agents

An agent should never need to parse a status sentence, inspect private fields,
or infer which algorithm ran. The API needs stable schemas, exhaustive status
codes, capability discovery, compact structured documentation, deterministic
serialization, and explicit resource budgets.

Agent-first does not mean hostile to people. It should produce better human
results because an agent can reliably turn structured facts into a clear
explanation.

### 3. Mathematical truth is separate from solver termination

Every result records both:

- what the solver reported; and
- what Sage.js independently checked.

For example, an optimizer can terminate successfully while violating a
constraint. A root finder can exhaust its budget while returning an excellent
approximation. The result must preserve both facts.

When possible, validation includes residuals, backward error, feasibility,
stationarity, condition estimates, refinement comparisons, or interval/ball
enclosures. These are labeled accurately: a small residual is not a proof of a
small forward error on an ill-conditioned problem.

### 4. Explainability is recorded during computation

A final answer is insufficient for teaching and often insufficient for
debugging. Numerical algorithms should optionally emit a bounded semantic
event stream. The stream is inspectable as data and can be replayed as a table,
text explanation, static plot, or animation.

Do not reconstruct an algorithm's history from its final answer, and do not put
rendering calls inside its inner loop.

### 5. One semantic operation can have several language frontends

MATLAB, Wolfram Language, Sage, and Python differ in syntax, defaults, array
orientation, indexing, state, and result presentation. Preserve those frontend
semantics where supported, then lower to the same `NumericalProblem` operation.

Do not translate every language into fictional Sage source. Do not implement
separate solvers for each parser.

### 6. Correct readable mathematics remains the foundation

Follow `ARCHITECTURE.md`:

1. ordinary CPython-parseable Python;
2. source-transparent compilation where appropriate;
3. mature external mathematics;
4. handwritten native code only for explicit boundaries and measured gaps.

A high-performance backend requires a correct fallback and independent oracle.
Pedagogical traces must not fork the mathematical implementation into an
unmaintained “teaching version.”

### 7. Portability and payload are part of correctness

Browser, Linux x64, Linux ARM64, macOS ARM64, and Windows x64 are product
targets. The same Wasm artifact is preferable when performance is adequate.
Platform-specific native code needs a measured gain that justifies extra
release, numerical-divergence, and support surface.

## What the tool should feel like

### Simple by default

An introductory use remains concise:

```python
r = find_root(cos(x) == x, 0, 1)
r.value
```

The rich result should display naturally:

```text
0.7390851332151607

Brent root on [0, 1]
residual: 0.0
converged: yes, 7 iterations / 8 evaluations
validation: bracket preserved; binary64 result
```

The exact API spelling is a later design decision. The important point is that
the scalar-looking display does not throw away the structured computation.

### Deep when asked

```python
r.method
r.backend
r.residual
r.error_estimate
r.condition
r.diagnostics
r.provenance
r.trace
r.to_json()
r.explain()
r.plot()
r.animate()
r.replay(step=12)
r.refine(tolerance=1e-13)
r.verify(method="bisection")
```

Not every property exists for every domain. The schema says what is available
instead of returning invented values.

### Plan before spending

Agents should be able to inspect automatic selection without running it:

```python
plan = numerics.plan(problem)
plan.method
plan.backend
plan.numeric_type
plan.estimated_resources
plan.rejected_alternatives
plan.capability_record
```

This is especially important for large matrices, stiff ODEs, stochastic
methods, arbitrary precision, or a browser memory limit.

### Discover capabilities without guessing

```python
numerics.capabilities(domain="least_squares")
numerics.describe("solve_ivp")
numerics.supports(problem, method="radau")
```

The response is structured and versioned. It identifies supported dimensions,
numeric types, callbacks, derivatives, constraints, platforms, trace levels,
and fallbacks.

## Core semantic objects

### NumericalProblem

An immutable problem description should contain only mathematical and
execution-relevant intent:

```text
schema_version
domain
operation
numeric_type
variables and shapes
objective / residual / operator / RHS
derivative information and its provenance
initial data
bounds and constraints
tolerances
method request or automatic policy
resource budget
trace policy
random seed policy
source-language intent
```

Arbitrary callbacks are live resources and cannot magically become portable
JSON. Serialization distinguishes:

- fully replayable expressions/data;
- a stable module/function reference;
- source text with a content hash;
- and an opaque live callback that is explicitly non-replayable.

Never claim reproducibility when the objective was an unrecorded closure over
mutable state.

### NumericalPlan

The planner resolves a problem to an explicit execution contract:

```text
canonical operation
selected method and reason
backend and source revision
precision and storage format
scaling / finite-difference policy
validated capability envelope
fallback
expected allocations and callback pattern
warnings before execution
```

Automatic method selection is useful; invisible method selection is not.

### NumericalResult

All domains share a small result envelope:

```text
schema_version
problem digest
success
status code
value / state / parameters / solution
mathematical validation
error and condition information
diagnostics
method
backend and artifact digest
precision
iterations and evaluation counts
elapsed and resource measurements
trace reference
provenance
reproducibility record
```

Domain-specific payloads remain typed: an ODE trajectory is not forced into an
optimizer's `x`; an eigensystem is not a generic dictionary. The common
envelope supports agents, logging, display, and cross-language communication.

### NumericalDiagnostic

Diagnostics have stable codes, severities, structured fields, and suggested
actions. Examples:

- `ill_conditioned`
- `loss_of_significance`
- `constraint_violation`
- `maximum_evaluations`
- `stagnation`
- `rank_deficient`
- `step_rejected_repeatedly`
- `event_location_uncertain`
- `backend_fallback`
- `non_replayable_callback`
- `trace_truncated`

Human text is localized display, not the identity of the diagnostic.

### NumericalTrace

The trace is an append-only, versioned sequence of semantic events:

```text
sequence
kind
iteration / evaluation
accepted or rejected
current state or bounded summary
objective / residual / error estimate
step, bracket, trust radius, simplex, or interval
constraint and stationarity metrics
event-specific data
elapsed time
diagnostics raised at this event
```

Trace levels control cost:

- `none` — final counts only;
- `summary` — phase changes and logarithmically sampled progress;
- `iterations` — every accepted iteration;
- `evaluations` — objective/residual evaluations where feasible; and
- `debug` — backend-specific details, explicitly unstable.

Every level has byte, event, and sampling budgets. If full history exceeds a
budget, retain the first events, last events, important transitions, and a
deterministic decimated middle; emit `trace_truncated`.

## Visual explanation and Plotly animation

The numerical system should integrate with the existing semantic `PlotSpec`,
not bypass it with ad hoc Plotly dictionaries.

```text
NumericalTrace
    │
    ├── root visualizer ─────── bracket, graph, residual
    ├── optimizer visualizer ── path, simplex, contours, constraints
    ├── ODE visualizer ──────── trajectory, phase portrait, step/error
    ├── linear visualizer ───── elimination, spectrum, residual
    └── fit visualizer ──────── data, model, residuals, confidence
                    │
                    v
             PlotSpec animation
                    │
                    v
                Plotly frames
```

[Plotly's animation API](https://plotly.com/javascript/animations/) already
supports named frames, frame sequences, sliders, playback controls,
transitions, and fast no-redraw updates. Its documented limitation that only
scatter traces transition smoothly is acceptable: many numerical stories
naturally use scatter/line traces, while heatmaps, contours, and surfaces can
advance discretely.

The visualizer—not the solver—decides:

- which semantic events deserve frames;
- how to decimate a long run;
- whether interpolation between states is mathematically honest;
- which axes must remain fixed to avoid misleading motion;
- how to show accepted versus rejected steps;
- what hover data explains each state;
- and which warning or stopping reason appears in the final frame.

Animations need play, pause, step, restart, speed, and iteration-slider
controls. They must also have a static fallback and alt-text/description for
accessibility and non-browser hosts.

Examples worth building:

- bisection/Brent: function curve, endpoints, midpoint/interpolation point,
  shrinking bracket, and residual history;
- Newton/secant: tangent/secant construction and convergence/failure;
- Nelder-Mead: simplex reflection, expansion, contraction, and shrink over
  objective contours;
- constrained optimization: path plus feasible region, active constraints,
  and violation history;
- least squares: evolving model, residual sticks, parameter path, and cost;
- Gaussian elimination: row operation and pivot growth;
- QR iteration: evolving subdiagonal magnitude and eigenvalue estimates;
- adaptive quadrature: interval subdivision and local error allocation;
- interpolation: nodes, interpolant, error curve, and Runge phenomenon;
- ODE integration: trajectory, phase portrait, adaptive step sizes, rejected
  steps, and located events; and
- FFT: time samples, frequency bins, and reconstruction/filtering.

Animation is not decoration. It is a view of a durable computation record and
therefore useful for agents, tests, debugging, education, and communication.

## Multilingual frontends and communication

### Canonical semantics, not canonical syntax

Each parser should produce frontend intent plus a canonical numerical problem.
The intent retains meaningful differences:

- MATLAB one-based indexing, column orientation, mutable workspace, option
  structures, and multi-output conventions;
- Wolfram symbolic equations, rules, arbitrary-precision requests, option
  precedence, and replacement-rule results;
- Sage parents, exact/inexact coercion, symbolic expressions, and familiar
  names; and
- Python callables, array protocols, keyword arguments, and exceptions.

The backend sees typed arrays, callbacks, expressions, constraints, and
options—not parser tokens.

### Results should translate outward too

Communication is bidirectional. A frontend-wrapped result, which retains the
source-language intent, should be able to request:

```python
frontend_result.to_code("sage")
frontend_result.to_code("python-scipy")
frontend_result.to_code("matlab")
frontend_result.to_code("wolfram")
r.to_markdown()
r.to_plot_spec()
```

Generated code includes the method, tolerances, seed, and relevant data. It
must say when a target language lacks an exact equivalent and label the
translation. Code generation is tested by parsing it back and comparing the
canonical problem where possible.

A canonical domain result deliberately does not implement `to_code`: without
frontend intent it cannot know which language conventions, shapes, option
names, and return form to preserve. It remains the language-neutral evidence
record nested inside the frontend wrapper.

This feature is particularly valuable for agents: Sage.js can compute in a
portable browser environment, then communicate a reproducible MATLAB or
Mathematica-flavored account to a human collaborator.

## Product scope

The target is the durable core of undergraduate and early graduate scientific
computing, not every specialized toolbox.

### Tier A: foundational release surface

#### Scalars and nonlinear equations

- bisection, Brent, secant, and Newton root finding;
- fixed-point iteration with convergence diagnostics;
- nonlinear systems with finite-difference or supplied Jacobians;
- scalar minimization and robust one-dimensional searches.

#### Dense linear algebra

- solve and least-squares solve;
- LU, QR, Cholesky, and pivoted factorizations;
- determinant, inverse where explicitly requested, rank, nullspace, and
  condition estimation;
- symmetric/Hermitian and general eigenproblems;
- singular value decomposition and pseudoinverse; and
- residual and backward-error reporting.

#### Approximation, interpolation, and integration

- polynomial and piecewise interpolation;
- cubic splines;
- polynomial approximation and numerical polynomial roots;
- finite differences with step/error diagnostics;
- composite and adaptive quadrature; and
- basic multidimensional integration only where a clear bounded method exists.

#### Differential equations

- explicit adaptive Runge-Kutta IVP methods;
- dense output and event location;
- one defensible stiff method;
- systems, higher-order reduction, and complex states where supported; and
- trajectory and phase-portrait results.

#### Optimization and fitting

- unconstrained, bounded, and basic nonlinear constrained local optimization;
- linear and nonlinear least squares;
- curve fitting with parameter diagnostics;
- supplied and finite-difference derivatives; and
- a few explicitly named global methods later, not as opaque defaults.

### Tier B: practical breadth

- sparse matrices and core direct/iterative linear solves;
- sparse eigenvalue and singular-value subsets;
- FFTs and basic convolution/window/filter operations;
- descriptive statistics, common distributions, random sampling, regression,
  and standard hypothesis tests;
- robust fitting and robust losses;
- boundary-value ODEs if a mature portable backend fits; and
- batch/parameter sweeps with bounded concurrency and reproducible seeds.

### Explicit non-goals for the initial product

- industrial-scale nonlinear programming;
- a complete sparse/PDE/FEM ecosystem;
- GPU array computing;
- deep learning or an automatic-differentiation framework;
- complete control, signal, econometrics, or statistics toolboxes;
- full MATLAB/Mathematica/SciPy compatibility;
- novel research-level numerical algorithms; and
- pretending binary64 approximations are rigorous enclosures.

These can become separate projects when compelling users and evidence exist.

## Domain architecture

### Shared binary64 and complex storage

All domain packs need a coherent typed storage boundary:

- packed contiguous `Float64Array` and interleaved or explicitly structured
  complex storage;
- checked shapes, strides, and ownership;
- matrix layout made explicit at every foreign boundary;
- no object-per-scalar callback protocols;
- zero-copy views only with explicit lifetime contracts; and
- predictable conversion from Sage.js vectors and matrices.

Do not invent a second public matrix class solely for numerics. Extend the
existing matrix/vector contracts with appropriate inexact storage and lazy
numerical algorithms.

### A small number of dependency packs

Avoid both extremes: one enormous native module and dozens of separately
duplicated addons. A plausible eventual grouping is:

```text
numerical-core.wasm      scalar/nonlinear/optimization/interpolation/quadrature
linear-algebra.wasm      dense BLAS/LAPACK-class operations
ode.wasm                 IVP/stiff/event machinery if separately justified
fft.wasm                 transforms if not efficiently shared elsewhere
```

This is a hypothesis to test with linked sizes and startup measurements, not a
mandated file list. Merge packs when they duplicate large dependencies; split
them when lazy loading materially improves browser startup.

### Backend choice is per operation

For every domain:

1. write the semantic contract and correctness corpus;
2. survey maintained libraries and their licenses;
3. establish established-package or textbook oracles;
4. prototype the real callback/storage boundary;
5. compile and test on all supported targets;
6. measure payload, cold start, warm computation, memory, and callbacks;
7. select methods individually; and
8. retain an honest dynamic fallback.

The optimization study showed why this discipline matters: the broadest
library did not contain the best implementation of every method, a tempting
C++ BFGS failed a routine higher-dimensional case, and a solver reported
success on an infeasible problem.

### Reference and production modes share one algorithm record

Some foundational algorithms are short enough to implement transparently in
Python and compile from the same source. For education, traces instrument that
same algorithm.

For mature external solvers, do not write a simplified duplicate and call it
the teaching mode. Instead:

- expose its semantic events when the backend supports them;
- provide a separate explicitly named reference algorithm where pedagogically
  valuable; and
- let users compare results and traces without implying identical iterations.

For example, `method="bisection"` may be ideal for explanation while
`method="brent"` is the robust default. Both solve the same root problem but
remain honestly named.

## Automatic choices

Good defaults are part of the product. They should be conservative and
explainable:

- inspect shape, scale, symmetry/Hermitian claims, bounds, sparsity, derivative
  availability, and requested precision;
- validate structural claims cheaply when possible;
- select a method only within a qualified envelope;
- record every normalization, scaling, finite-difference, and fallback choice;
- warn before a dangerous inverse, ill-conditioned solve, huge dense
  eigensystem, or unlikely global-search budget; and
- allow the caller to freeze the generated plan for exact replay.

An agent can usually make a better choice when given diagnostics. The library
should not conceal information in an attempt to look effortless.

## Numeric truth policy

Every numeric result identifies one of these evidence levels:

- **exact** — exact arithmetic or symbolic identity;
- **rigorous enclosure** — a certified interval/ball result;
- **backward-validated approximation** — residual/backward error checked;
- **convergence-supported approximation** — refinement or independent methods
  agree within a declared tolerance;
- **heuristic approximation** — useful but without a strong validation claim;
  or
- **indeterminate** — the requested conclusion is unsupported by the evidence.

The level is machine-readable. A binary64 optimizer result normally belongs to
one of the approximation categories, not “exact,” even if the printed value is
an integer.

For linear algebra, prefer backward-error and conditioning language. For ODEs,
report local error control without pretending it is always a global error
bound. For optimization, report feasibility and stationarity separately from
global optimality. For stochastic methods, report seed and empirical success
evidence rather than certainty.

## Correctness and benchmark program

Each domain gets a backend-neutral corpus like the new optimization corpus.

### Correctness layers

1. **Definitions and identities:** exact small examples and algebraic
   invariants.
2. **Independent residuals:** evaluate the result outside the backend.
3. **Differential oracles:** SciPy, NumPy, LAPACK references, MATLAB/Wolfram
   fixtures, Sage, or another mature system as appropriate.
4. **Conditioned stress cases:** scaling, near singularity, stiffness,
   cancellation, clustered roots/eigenvalues, and active constraints.
5. **Failure semantics:** invalid inputs, NaN/infinity, budget exhaustion,
   callback exceptions, cancellation, allocation failure, and indeterminacy.
6. **Metamorphic tests:** scaling, permutation, similarity, coordinate changes,
   refinement, and problem decomposition where mathematically valid.
7. **Cross-platform tests:** exact same Wasm artifact plus any selected native
   variants on Linux x64/ARM64, macOS ARM64, Windows x64, and browser engines.

### Performance layers

Measure separately:

- parse/lowering and problem construction;
- cold pack load and initialization;
- storage conversion;
- callback boundary and derivative construction;
- solver/kernel time;
- post-validation;
- trace collection and decimation;
- PlotSpec lowering and browser animation;
- peak memory and transfer size; and
- compressed and installed payload.

Every comparison uses the same mathematical method or clearly labels the
difference, the same tolerance, derivative policy, initial data, seed, host,
and result gate. Function-evaluation count is reported alongside time.

### Workload tiers

Do not define “fast” with one Rosenbrock problem. Maintain at least:

- **instant classroom:** small problems expected to feel immediate;
- **interactive exploration:** medium problems suitable for live parameter
  changes and plots;
- **substantial local:** larger browser/desktop work where progress and
  cancellation matter; and
- **out of scope:** problems that need an industrial or distributed package.

Set numeric time and memory budgets only after measuring representative
hardware. The category is still useful before exact thresholds exist.

## Documentation as an interactive numerical text

The documentation should teach the mathematics and the product simultaneously.
Each method page should contain:

- the problem it solves and assumptions it makes;
- a minimal example;
- the automatic-selection policy;
- a trace table and optional animation;
- a normal success and an instructive failure;
- diagnostics and how to respond;
- complexity and scaling expectations;
- backend/provenance inspection;
- equivalent Sage, Python, MATLAB, and Wolfram snippets where meaningful; and
- links to the corpus cases that support the claim.

A gallery should include convergence and failure, not only attractive answers.
Runge interpolation, Newton divergence, ill-conditioned Hilbert systems,
constraint infeasibility, stiffness, aliasing, and overfitting are core product
examples.

## Implementation roadmap

### P0 — Product contract and inventories

1. Define the `NumericalProblem`, `NumericalPlan`, `NumericalResult`,
   `NumericalDiagnostic`, and `NumericalTrace` schemas.
2. Inventory Sage, current Sage.js, MATLAB-parser, Wolfram-parser, NumPy/SciPy,
   and current plotting numerical surfaces.
3. Classify the intended product matrix as faithful, translated, extension, or
   unsupported.
4. Define numeric truth levels, status codes, and serialization rules.
5. Establish routine versus release evidence requirements.

Acceptance: an agent can inspect the intended surface and schemas without
reading implementation source; CI rejects unclassified claimed functionality.

### P1 — One complete root-finding vertical slice

Implement bisection, Brent, secant, and Newton through the complete platform:

1. ordinary Python problem/result/trace contracts;
2. robust dynamic algorithms and qualified acceleration;
3. independent residual/bracket validation;
4. Sage, Python, MATLAB `fzero`, and Wolfram `FindRoot` frontend slices;
5. replayable trace and PlotSpec animation;
6. `plan`, `explain`, `verify`, `refine`, and code emission;
7. browser, Node, SEA, and four-platform receipts; and
8. normal, flat, multiple, discontinuous, invalid-bracket, and divergence
   cases.

Acceptance: this slice proves the architecture from four languages to one
semantic problem and back to structured/visual human communication.

### P2 — Numerical methods foundation

Add dense linear systems/factorizations, interpolation/splines, finite
differences, and adaptive quadrature. These are central to undergraduate
courses and exercise arrays, conditioning, diagnostics, and trace
visualization without requiring the entire optimization stack.

Acceptance: complete semantic and performance corpora, cross-platform behavior,
and interactive documentation for each family.

### P3 — Optimization, nonlinear systems, and fitting

Execute the linked optimization backend plan:

- callback-capable numerical Wasm boundary;
- cminpack LM only after complete Wasm cross-checks;
- individually qualified NLopt methods;
- exact method identity and dynamic fallbacks;
- nonlinear systems and Jacobian handling;
- post-validation independent of solver status; and
- path/simplex/fit/constraint visualizers.

Acceptance: the supported local optimization and fitting surface is more
coherent and inspectable than Sage's wrappers and remains mathematically honest
across all runtimes.

### P4 — ODE initial-value laboratory

1. Survey SUNDIALS, portable Runge-Kutta implementations, and other mature
   candidates rather than writing a solver suite blindly.
2. Implement explicit adaptive IVP methods, dense output, events, cancellation,
   and one stiff path.
3. Add standard nonstiff, stiff, oscillatory, conserved-quantity, event, and
   failure corpora.
4. Build trajectory, phase, step-size, local-error, and event animations.
5. Support parameter sweeps with deterministic bounded concurrency.

Acceptance: a student can solve and understand standard ODE course problems;
the result does not overstate global error or conservation.

### P5 — Spectral, statistical, and practical breadth

Add eigen/SVD completion, FFT/convolution basics, common probability and
statistics operations, regression, sparse core operations, and robust fitting.
Each domain repeats the survey/corpus/backend process; none inherits a backend
merely because another domain uses it.

Acceptance: representative undergraduate scientific-computing notebooks run
without leaving Sage.js, with structured results and language-front-end
examples.

### P6 — Multilingual completion and translation

1. Expand MATLAB and Wolfram numerical surface ledgers.
2. Preserve frontend-specific state and result conventions above canonical
   operations.
3. Implement tested outward code generation and round trips.
4. Add offline reference fixtures from proprietary systems where legally and
   practically appropriate.
5. Clearly diagnose every unsupported construct.

Acceptance: supported multilingual programs produce the same canonical
problem/result evidence, while their human-facing syntax remains natural.

### P7 — Teaching and explanation layer

1. Finish domain trace visualizers and PlotSpec animation controls.
2. Add reference-method comparisons and “why this failed” narratives.
3. Build the interactive numerical-methods gallery.
4. Add accessible static descriptions and exportable HTML/Plotly JSON.
5. Measure trace and rendering overhead and enforce budgets.

Acceptance: explanations are derived from structured computation evidence, not
fabricated after the fact, and remain useful without animation.

### P8 — Production hardening

1. Cross-platform release corpus on persistent hosts.
2. Browser-engine coverage, worker recovery, cancellation, and memory pressure.
3. Sanitizers, fuzzing, lifecycle, callback exception, and corruption tests.
4. Pack grouping, tree shaking/lazy loading, startup, and payload budgets.
5. Capability receipts bound to source and artifact hashes.
6. Long-duration and repeated-run numerical stability campaigns.

Acceptance: published capabilities are reproducible and fail closed outside
their validated envelopes.

The implemented P8 evidence boundary now treats the differential SciPy oracle
as a release artifact rather than an ambient host package. A checked four-host
catalog selects exact standalone CPython 3.14.4, NumPy 2.5.1, and SciPy 1.18.0
bytes and exact normalized prefix closures. A source-bound provisioner verifies
and safely parses those inputs, materializes internal archive links as unique
regular files, RECORD-verifies wheels without `pip`, and rejects traversal,
hardlinks, special members, case collisions, `.data` members, and expansion
bombs. All 16 matrix subjects bind and reauthenticate one per-platform oracle
snapshot before and after execution. Receipt verification also pins the exact
platform/subject memory method, scope, and interval rather than accepting a
different globally known collector method. This leaves the final measurements
honestly absent until the frozen candidate is exercised on every declared
runtime; catalog qualification is input/source closure, not a fabricated
product receipt.

## The first three demonstrations I would build

### 1. Root-finding story

Input `cos(x) = x` in any supported language. Show automatic planning, Brent's
answer, residual validation, a bisection verification, and an animation of the
shrinking bracket. Export equivalent MATLAB and Wolfram code.

This is small enough to expose every architectural flaw quickly.

### 2. Nonlinear fit story

Fit noisy exponential-decay data. Show parameters, residuals, covariance or
conditioning diagnostics where justified, method/backend provenance, and an
animation of model refinement. Compare a poor initial guess and an
unidentifiable parameterization.

This exercises callbacks, arrays, LM, statistics, plotting, and honest
diagnostics.

### 3. ODE story

Solve a pendulum or predator-prey system with adaptive steps and an event. Show
the trajectory, phase portrait, accepted/rejected step sizes, local error
estimates, and conservation drift. Let a slider change a parameter and rerun
with bounded cancellation.

This is the clearest demonstration that browser-native numerical mathematics
can be more communicative than a conventional console wrapper.

## Repository organization

A likely shape, refined through vertical slices:

```text
src/lib/sagejs/numerics/
  problem.py
  plan.py
  result.py
  diagnostics.py
  trace.py
  capabilities.py
  scalar/
  linear_algebra/
  approximation/
  integration/
  optimization/
  ode/
  fft/
  statistics/
  visualization/

packages/numerical-wasm/
  upstream/
  src/
  licenses/
  capabilities.json

docs/numerical-computing/
  surface.json
  result.schema.json
  trace.schema.json
  diagnostics.json
  oracle/
  gallery/
  performance/
```

Do not create this entire tree speculatively. The P1 root vertical slice should
establish the smallest useful contracts first, just as PlotSpec vertical slices
did for plotting.

## Risks and controls

### Building a framework instead of mathematics

Control: every schema field must be exercised by a complete vertical slice.
Reject speculative abstraction. Users must be able to solve a real problem at
the end of each phase.

### Attractive animations that mislead

Control: visualizers consume semantic events, fix meaningful axes, distinguish
interpolation from computed states, expose decimation, and always retain a
static quantitative view.

### Too many backends

Control: select per method but group dependencies into a small number of packs.
Every additional core must win a correctness/portability/size/performance
decision, not merely add a capability checkbox.

### False compatibility

Control: exhaustive frontend ledgers and faithful/translated/extension/
unsupported classifications. Record method identity and translation in every
result.

### False confidence

Control: numeric truth levels, independent post-validation, condition and
residual reporting, refinement, explicit indeterminacy, and instructive failure
examples.

### Agent-generated resource explosions

Control: planning estimates, hard allocation/evaluation/trace/frame budgets,
cancellation, backpressure, bounded parameter sweeps, and actionable
diagnostics before the browser becomes unresponsive.

### Payload and startup growth

Control: measure installed and compressed size, group by dependency, use lazy
packs, share support libraries, and require a demonstrated workload before
adding native variants or a heavyweight runtime.

## Definition of success

This project succeeds when:

- an agent can discover supported numerical operations without trial and
  error;
- it can plan, run, validate, refine, serialize, and explain a computation
  through stable structured interfaces;
- the same canonical operation is reachable naturally from Sage, Python,
  MATLAB, and Wolfram frontends;
- common undergraduate numerical-analysis, ODE, linear-algebra, optimization,
  fitting, FFT, and statistics work is pleasant and fast;
- every result states its method, backend, precision, validation, limitations,
  and reproducibility evidence;
- a human can receive a concise explanation, code in a familiar language, and
  a useful interactive plot or animation;
- browser, Node, and SEA use the same mathematical contracts; and
- unsupported research/industrial workloads are rejected honestly rather than
  answered unreliably.

The goal is not to beat MATLAB or SciPy by feature count. It is to combine
portable computation, mathematical honesty, agent-readable structure, and
human communication unusually well. That is a product Sage.js can plausibly
make distinctive.
