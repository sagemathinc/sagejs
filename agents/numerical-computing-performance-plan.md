# Numerical computing performance program

Status: implementation in progress, 2026-09-05. The initial inspection starts at
`d520ed4df1b4afbea3199964ffd27fc57efdc1e0` on `origin/main`.

## Execution checkpoint: N0–N1

[Draft PR #132](https://github.com/sagemathinc/sagejs/pull/132) contains the
first shared public-call corpus and incremental trace-accounting slice.
[Local evidence and explicit limitations](../bench/numerics/performance/results/n1-local-2026-09-05/README.md)
compare frozen baseline `cfbdb8a09` with source candidate `14fdd4117`.
Retained-history serialization is eliminated on append and ODE projection;
independent byte/retention/aliasing oracles pass under CPython and Sage.js.
The repeated local comparison shows large collection gains and roughly
2–2.6× gains on the selected iteration-traced public solvers, but **does not
meet the program's latency targets or complete N0/N1**.

The corpus, profiler, and generated optimizer dashboard are reused rather than
replaced by a separate benchmark service. N0 still lacks full scaling/failure,
automatic/library/#124 comparisons, phase/startup/payload/peak-memory evidence,
and persistent-host/browser confirmation. The initial 256-event baseline batch
is censored, never reported as a per-call median. Benchmark-host disk exhaustion
is an infrastructure gap, not authorization to delete another lane's work.

[Draft PR #140](https://github.com/sagemathinc/sagejs/pull/140) is the separate,
stacked result-binding fix: identical problem objects no longer need two hashes;
distinct objects still undergo content checks. Its
[local evidence and wider baseline](../bench/numerics/performance/results/n1-result-2026-09-05/README.md)
bind the built candidate `bd26cfefb`, including ordinary-source CPython
comparisons. The wider run still shows major statistics, dense and FFT gaps.
An initial coarse statistics diagnostic identifies both input/budget work and
stable reductions as large costs, so N2 must address the complete checked region,
not just its last arithmetic expression.

Next: source-transparent reduction/interpolation kernels in N2, alongside the
remaining N0/N1 qualification. Keep each source candidate and its measurements
distinct; the release owner and frozen product release remain untouched. N2–N6
and all acceptance criteria below remain open.

## Objective and scope

Make the **existing supported numerical laboratory** fast enough for interactive
mathematics and sustained agent workloads, while retaining independent result
validation, honest diagnostics, bounded traces, portability, and readable
mathematical source. Prioritize eliminating execution and representation costs
over adding numerical methods.

This is the performance follow-up to the
[product plan](numerical-computing-product-plan.md), not a replacement for its
contracts. Follow [ARCHITECTURE.md](../ARCHITECTURE.md) and the measured
[execution-tier guide](../architecture/EXECUTION-TIER-PERFORMANCE.md). Reuse the
[backend study](numerical-optimization-backend-strategy.md), existing domain
corpora, and qualification infrastructure. Do not build another independent
solver framework, benchmark service, or release pipeline.

The current release belongs to another agent. This program must not change its
frozen candidate, tags, publication, or performance thresholds. Deliver reviewed
incremental PRs on current `origin/main`; release scheduling is separate.
Deferred functionality in the product plan remains deferred. General Python
runtime optimization remains owned by the
[compiler/runtime program](python-compiler-runtime-value-and-performance-plan.md).

## Evidence motivating the work

The following are historical Linux x64 development observations, not timings of
the current candidate. The optimization receipt measures the same source under
CPython and Sage.js with native acceleration disabled, including callbacks and
validation. ODE and statistics records have their own sampling policies; do not
combine them into a cross-domain speed score.

| Workload | Sage.js dynamic | Same source under CPython | Evidence |
| --- | ---: | ---: | --- |
| Bounded scalar minimization | 95.8 ms | 0.83 ms | [Optimization receipt](../bench/numerics/optimization/results/performance-linux-x64.json) |
| Nelder-Mead, Rosenbrock 2D | 400 ms | 5.12 ms | Same receipt |
| BFGS, Rosenbrock 20D | 1,333 ms | 27.8 ms | Same receipt |
| Nonlinear least-squares example | 123 ms | 1.39 ms | Same receipt |
| ODE, 981 accepted steps | 3,489 ms | 65.3 ms | [Sage.js](../bench/numerics/ode/results/sagejs-linux-x64.json), [CPython](../bench/numerics/ode/results/cpython-linux-x64.json) |
| Describe 20,000 observations | 1,856 ms | 19.2 ms | [Statistics receipt](../bench/numerics/statistics/evidence-linux-x64.json) |

The optimization receipt also records iteration tracing increasing a roughly
0.4-second solve to 33 seconds, albeit with only one trace sample. Current
[`NumericalTrace`](../src/lib/sagejs/numerics/trace.py) supplies a concrete
profiling hypothesis: each retained append checks its byte budget by serializing the
entire retained event list. Before the cap is reached, that can accumulate
quadratic work. Measure its actual contribution before attributing the whole
slowdown to it.

There are already useful compiled paths. The separately lazy cminpack reactor
and explicit NLopt Nelder-Mead integration must be benchmarked through their
**public** APIs before proposing replacements. The old cminpack record reports
a 72,155-byte Wasm artifact, but its tiny adapter timings do not include all
public planning, validation, or presentation costs. See the
[P3 evidence](../bench/numerical-p3-backends/evidence.json) and the narrowed
[NLopt method contract](../src/lib/sagejs/numerics/optimization/backends/nlopt/README.md).
Historical backend-study recommendations do not override subsequent method
rejections: NLopt COBYLA remains excluded.

### Relationship to PR #124

[PR #124](https://github.com/sagemathinc/sagejs/pull/124), inspected at
`ad8a1b6a7a95d9b210d8657edd75843b48bae3ad`, improves dictionary construction
and primitive-key mutation without adding a numerical backend. Its provisional
microbenchmarks show substantial gains but retain sizeable CPython gaps.

Welcome those improvements: metadata, diagnostics, callbacks, and the dynamic
fallback benefit. Do not extrapolate dictionary speedups to complete solvers,
or wait for general Python optimization to make dense numerical loops fast.
Run this corpus on a fixed baseline and a separately built candidate including
#124. Once integrated, use that revision as the next baseline. Give each lane
credit for its own change; never compare stale generated JavaScript with newly
built source. Preserve Python subclass, mutation, exception, and callback
semantics when reporting runtime improvements.

## Execution strategy

Choose a complete computation region and storage model, not a language label.
The working preference is:

- **Readable typed Python compiled with `@native`** for owned callback-free
  arithmetic loops: reductions, interpolation batches, vector updates, error
  norms, matrix packing, and independently implemented residual checks.
- **Mature libraries at coarse boundaries** for established factorization,
  eigensystem, SVD, FFT, and selected iterative-solver algorithms. Do not write
  a competing LAPACK to preserve a superficial all-Python implementation.
- **Ordinary/guarded JavaScript execution** for orchestration, tiny operations
  where conversion dominates, and genuinely dynamic callbacks. Measure it
  alongside compiled paths; a Wasm crossing is not automatically profitable.

### Callback isolation is a hard boundary

An isolated `@native` call graph cannot invoke Python or JavaScript after
marshalling. Consequently, adding a decorator to a solver accepting arbitrary
user functions is not the implementation plan. Use one of these explicit paths:

1. Compile the complete solver/objective region only when the actual selected
   source, calls, effects, and captures are supported and certified isolated.
   General closure/callback compilation is not presumed available.
2. For owned methods, evaluate a bounded reverse-communication design: an
   isolated source-compiled step returns an evaluation request; the host calls
   the user function and resumes the state. Retain the same-source dynamic
   implementation. Proceed only if state/ABI support and end-to-end savings
   justify this addition; a simple dynamic driver plus packed kernels may win.
3. Use an explicitly classified external-library callback adapter, as the
   cminpack/NLopt paths already do. It is not an isolated `@native` kernel.

No hidden interpreter trampoline inside generated cores. Preserve callback
identity, exceptions, evaluation order, counts, and budgets. Batching arbitrary
callbacks requires an explicit batch/purity contract; never reorder side
effects to obtain a benchmark win. A compiled objective must be an observable
optional capability with a correct fallback.

### Packed storage and ownership

Use existing checked packed-buffer/foreign-resource facilities before adding a
new representation. Convert once at the public boundary, retain factors and
workspace across repeated solves when requested, and cross with vectors or
complete matrices rather than individual entries. Specify dimensions, layout,
strides, mutability, aliasing, lifetime, allocator ownership, checked size
arithmetic, and cleanup. No raw pointers in mathematical APIs. Copied transfers
are the safe default; zero-copy needs an explicit lifetime contract, including
Wasm memory growth and worker transfer.

Keep binary64 storage decisions local to the numerical API. Do not change Sage
exact arithmetic or ordinary Python numeric semantics. No unconditional FLINT,
PARI, plotting, or unrelated backend load for roots, statistics, or fitting.
Backend/result caches must be bounded, keyed by relevant source/data/policy
identity, and invalidated on mutation. Warm reuse cannot conceal first-use cost.

## Measurement contract: first deliverable

Extend the existing domain runners under [`bench/numerics/`](../bench/numerics/)
and evidence machinery under
[`bench/numerical-computing/qualification/`](../bench/numerical-computing/qualification/).
Reuse the [Python performance laboratory](../bench/python-compat/README.md) for
runtime attribution, without confusing its warm-throughput scope with solver
startup. Proposed new corpus/report files should live under
`bench/numerics/performance/`; that directory and its commands are deliverables,
not existing interfaces.

Each accepted comparison records:

- source/corpus/compiler/toolchain/artifact hashes; actual selected execution
  route and guard/fallback reason; host/CPU, runtime and engine versions;
- method, tolerances, derivative policy, initial data, seeds, dimensions,
  dtype/layout, output contract, trace policy, and correctness gate;
- separate parse/compile, import/pack load, first call, warm one-shot call,
  retained-plan/factor reuse, and batch/sweep throughput measurements;
- attribution to packing, callbacks/derivatives, kernel, independent checking,
  result construction, tracing, serialization, and visualization; instrumentation
  cost is measured separately from uninstrumented end-to-end timing;
- iterations, callback counts, boundary crossings, copied bytes, allocation/GC
  indicators, peak RSS/heap/Wasm memory, retained memory after reuse, and loaded
  and compressed transfer bytes. Label unavailable engine metrics explicitly;
- single-thread comparisons first; separately labeled threaded measurements
  with BLAS/worker thread counts and host load recorded.

Use at least three warmups and seven retained samples, paired/interleaved runs,
and an independent rerun on a quiet persistent host before calling a speedup
confirmed. Tiny operations need timed batches with verified checksums; include
loop/clock overhead controls. Report medians and variation, not best times.
For tail-latency claims collect enough observations explicitly for that purpose
(at least 100 requests), rather than presenting a seven-sample p95 as reliable.
Cold starts use fresh processes/workers and documented cache/network conditions.
Apply time/memory limits to slow baselines and report censored results honestly.

The comparison axes are: unchanged public Sage.js, forced dynamic same-source
Sage.js, compiled/external Sage.js, CPython same source, and a matched NumPy/SciPy
or library oracle. A lower-level library-only number is a ceiling on opportunity,
not the product result. Different algorithms are separate comparisons. Match
accuracy, not merely similarly named tolerances; report independently checked
residuals and work counts. Time the default structured result with validation
enabled; also show kernel-only and communication/animation modes separately.

### Corpus and provisional targets

Cover each implemented domain with tiny, interactive, and larger scaling cases,
plus a conditioned/failure case. Include existing scalar roots, bounded minima,
Rosenbrock 2D/20D, analytic and finite-difference fitting, both recorded ODEs,
statistics, spline queries, dense solves/eigen/SVD, FFT/convolution, and CSR
iteration. Suggested scaling axes are matrix sizes 16/64/256, tall-skinny fits,
FFT lengths from 256 to 65,536 including awkward lengths, and vector lengths
from 1,000 to 1,000,000, **within supported envelopes**. Reuse existing semantic
oracles. Add repeated jobs: 1,000 roots/fits, 100 ODE solves, and retained-factor
multiple-right-hand-side solves, with bounded retained outputs.

These are proposed warm public-call medians on quiet `bench-1`, with default
validation and summary/no iteration trace. They are product ambitions to ratify
in milestone N0, not retrospective pass thresholds or current achievements:

| Existing representative workload | Proposed first target |
| --- | ---: |
| Cheap scalar root or bounded minimum | 1 ms |
| Rosenbrock 2D Nelder-Mead | 10 ms |
| Rosenbrock 20D BFGS | 50 ms |
| Recorded small nonlinear fit | 10 ms |
| Recorded classroom / 981-step ODE | 5 ms / 200 ms |
| Describe 20,000 observations | 10 ms |
| 1,000 small fits in one reusable session | 10 seconds total |

For newly profiled dense/FFT cases, propose public-call targets within
`max(3 * matched_oracle_time, 1 ms)` on native hosts and
`max(5 * matched_oracle_time, 2 ms)` for same-host browser comparisons, with
matched thread counts and output scope. These ratios are investigation targets,
not claims that every method/backend will reach them. Freeze case-specific
targets after N0; publish misses and evidence-backed revisions openly. Keep
existing release gates unchanged. Portability passes and a fast average cannot
erase a slow workload or platform.

For typical bounded traces, target summary overhead below 10% plus 0.1 ms and
iteration-trace overhead below 25% plus 1 ms, measured against the identical
untraced solve with the same required validation. Include scaling/cap-overflow
tests: no rescanning/serialization of the whole retained history on each append.
Pin separate compressed-payload, first-use latency, steady-memory, and
cancellation-latency budgets in N0. Every subsequent backend addition reports
its incremental costs; fast arithmetic cannot silently enlarge startup budgets.

## Implementation sequence and exit criteria

### N0 — Current baseline and bottleneck map

Freeze a source/artifact baseline from main, refresh the above measurements,
record #124's inclusion status, and collect profiles on `bench-1`. Sample the
same artifacts in Chromium, Firefox, and WebKit and smoke all persistent hosts.
Inventory default versus explicit accelerated routes; prove them through
instrumentation. Separate core, validation, and callback-dominated cases with
Amdahl-style estimates before choosing the work order.

Exit: reproducible corpus, correctness checks, per-case targets, route evidence,
raw measurements, and ranked bottlenecks. No acceleration is claimed yet.

### N1 — Remove shared bookkeeping cliffs

Fix trace byte accounting by validating/sizing each immutable event once and
maintaining incremental retained-byte totals, including canonical UTF-8 and
array punctuation costs. Preserve deterministic retention, hard caps, drop and
observation counters, important events, and forced-event behavior. Avoid building
discarded payloads at call sites when the policy does not request them.

Profile repeated deep materialization, schema checks, hashing, result copying,
and per-scalar budget bookkeeping. Validate immutable construction once and
reuse trusted private representations; validate mutable/untrusted inputs when
required. Keep defensive public boundaries and final independent mathematics.
No removal of correctness checks or fabricated iteration/animation evidence.

Exit: adversarial trace/aliasing tests, subquadratic trace-scaling evidence,
bounded memory, unchanged required diagnostics and mathematical classifications,
and measured public improvements in at least roots, optimization, and ODEs.
Reconcile existing trace work such as
[PR #121](https://github.com/sagemathinc/sagejs/pull/121); preserve the restored
default scalar symbolic-root Wasm route instead of replacing it with a slower
structured route merely for API uniformity.

### N2 — First complete acceleration slice: statistics and repeated queries

Start with descriptive statistics and linear regression reductions, then spline,
Chebyshev, and interpolation batches. They exercise packed input, stable
arithmetic, retained state, and validation without arbitrary callback machinery.
Keep numerically stable summation/scaling algorithms and stress cancellation,
large offsets, subnormals, NaN/infinity policy, empty inputs, and aliasing.

Extract real typed source regions and compile through existing `@native`
facilities. Compare dynamic, native, and emitted Wasm on the same source; retain
generic execution when packing dominates. Do not simply decorate object-heavy
public result construction. Compiler limitations are explicit, measured tasks
for the compiler owner, not permission for handwritten mathematical C.

Exit: end-to-end target evidence on a public operation, retained-query/batch
coverage, correct forced fallback, actual browser execution, four-platform
smokes, and no incidental exact-arithmetic dependency load. This slice proves
shared storage and evidence contracts before parallel domain acceleration.

### N3 — Dense linear algebra and spectral kernels

Audit already linked numerical dependencies and reuse a suitable validated
prefix. Compare typed-source small-matrix kernels with a narrow mature-library
adapter for LU/Cholesky/QR, then eigen/SVD. Use independent backward-error,
orthogonality, reconstruction, rank/conditioning, and invariant-subspace checks;
do not require identical eigenvector signs or bases for clustered eigenspaces.

The first candidates are [LAPACK](https://www.netlib.org/lapack/) plus an
appropriate BLAS and [Eigen](https://libeigen.gitlab.io/) as a C++-source portable
contender. LAPACKE is an interface, not a way to avoid the underlying LAPACK
build. [OpenBLAS's Windows guidance](https://www.openmathlib.org/OpenBLAS/docs/install/)
distinguishes native MSVC/LLVM from MinGW builds: prove the supported native
Windows and Wasm artifacts early, including compiler/runtime redistribution.
Do not assume a host-tuned BLAS has a portable Wasm build or identical speed.

Select the smallest routine closure that wins the actual size regimes. Prefer
one maintainable portable backend; add a native tuned alternative only for a
material measured crossover. Reuse factorizations, batch RHSs, and account for
row/column-major conversions and thread startup. Cap threads across BLAS and
worker pools to prevent oversubscription. Eigen's unsupported modules are not
implicitly qualified by admitting its dense primitives.

Exit: guarded, inspectable per-operation selection with identical public
validation contracts; source/ABI/license/payload/build evidence; native and
browser target results; correct singular/ill-conditioned/fallback behavior.

### N4 — Callback-heavy optimization, roots, fitting, ODE, quadrature

Benchmark the existing cminpack `lmdif`/`lmder` and qualified NLopt Nelder-Mead
through public problem/plan/result APIs with cheap, moderate, and expensive
callbacks. Audit residual/Jacobian packing and repeated validation costs. Use
an explicitly vector-valued callback once per residual vector rather than one
host call per entry. Evaluate native-library versus Wasm adapters only when
the end-to-end gap justifies maintaining both.

For owned roots, BFGS, ODE stepping, and adaptive quadrature, move callback-free
state updates, error norms, and dense algebra to compiled packed regions first.
Pilot one bounded resumable driver only if profiles justify it. Test analytic,
finite-difference, dynamic, and certified compiled objective paths separately.
Reference algorithms remain available for teaching and fallback with explicit
method identities. This work must not silently replace BFGS with L-BFGS, or
damped Gauss-Newton with MINPACK, to improve a timing chart. Promote automatic
backend selection only under reviewed method, correctness, resource, and
performance envelopes; explicit requests remain explicit.
If an explicit library method has no method-faithful available fallback,
return a structured backend-unavailable result rather than silently running a
different algorithm. Preserve a usable documented alternative separately.

Cancellation is cooperative only at real polling boundaries. A long foreign
call or stuck user callback needs worker termination/recreation for a hard
deadline; a queued browser timer cannot interrupt synchronous Wasm. Publish and
test worst-case response and cleanup, including missing SharedArrayBuffer/COOP
capabilities. Preserve callback failures and usable worker state after recovery.

Exit: target-qualified public roots/fits/ODE workloads and repeated-job tests,
independent residual/failure oracles, honest iteration versus callback traces,
and tested budget exhaustion and cancellation on all selected execution tiers.

### N5 — Remaining existing breadth and sustained throughput

Evaluate [pocketfft](https://github.com/mreineck/pocketfft) for FFT/convolution
against the current implementation, including awkward sizes, normalization,
real/complex layouts, copying, plan reuse, and bounded plan caches. Compile
CSR sparse matvec and existing iterative updates where appropriate; preserve
the narrow supported sparse-eigen envelope. Optimize remaining approximation,
integration, and statistical hot paths identified in N0.

Only after single-solve costs are fixed, tune bounded worker pools for batches
and sweeps. Measure worker startup, resident pack sharing, cancellation,
backpressure, result streaming, and CPU/memory limits. Do not run competing
timing campaigns on one host. Refresh the representative multilingual and
animation gallery workloads through their real user paths.

Exit: every implemented domain has current performance evidence; retained
factor/plan reuse and sustained workloads meet declared time/memory limits;
misses are individually visible rather than averaged away.

### N6 — Qualification, defaults, and honest public claims

Pin a source candidate and use `ssh bench-1` (Linux x64), `ssh bench-arm`
(Linux ARM64), `ssh m1` (macOS ARM64), and `ssh windows` (native Windows x64).
Coordinate reservations through
[Discussion #104](https://github.com/sagemathinc/sagejs/discussions/104).
Run native and Node-Wasm differentials and real Chromium/Firefox/WebKit worker
workloads; Node-Wasm alone does not qualify a browser. Test the supported Node
floor (22.22.2) as well as the qualification version. Verify clean npm and SEA
installs, missing/corrupt resources, lazy loads, relocation, and no local
compiler/developer prefix dependency.

Before default selection, require independent correctness and adversarial
tests, generated-source/FFI provenance, resource/guard rejection tests, relevant
ASAN/UBSAN/leak checks, and route-enforcing performance regressions. Run strict
Python, architecture, relevant domain suites, and diff-selected checks. Qualify
new source/artifact identities after any changes; reuse evidence only when the
existing identity rules explicitly permit it. Iterate on persistent hosts;
GitHub CI confirms an already validated milestone.

Exit: checked-in human and machine-readable per-workload reports distinguish
`target-met`, `performance-gap`, `unsupported`, and `unmeasured`, separately by
platform and execution tier. Document actual defaults, cold costs, memory,
library identities, and reproducible comparisons. Every priority target must
be met for this program to claim completion. An approved deferral remains a
visible gap and requires an explicit scope decision, not a renamed pass.
Hand the qualified changes to the release owner under [RELEASE.md](../RELEASE.md).

## Decision and ownership discipline

Each proposed compiled/library backend gets a short decision record: existing
route; profiled bottleneck; source/library alternatives; exact method identity;
paired public and kernel timings; callback/ownership model; build/runtime
dependencies; license notices; artifact sizes; four-platform/browser evidence;
fallback; guard envelope; and ongoing maintenance cost. Pin revisions and
source hashes when evaluating, rather than depending on upstream HEAD.

No generic `fast` capability, name-based native substitution, fast-math blanket
flag, success-status-only validation, relaxed benchmark oracle, or unbounded
cache. Floating-point reassociation/FMA/SIMD needs an explicit numerical policy
and stress tests; reproducible seeded sampling retains its stated stream
contract. Testing a library's C API does not qualify its Sage.js public wrapper.

N0 and the shared N1/N2 boundaries are integration-owned. Thereafter dense and
spectral, callback solvers, and approximation/statistics can proceed as separate
narrow lanes using [PARALLEL-DEVELOPMENT.md](../PARALLEL-DEVELOPMENT.md). Shared
compiler, runtime, FFI, trace, registry, and packaging changes need coordinated
ownership; do not have domain agents invent incompatible buffers or collectors.
Commit/push coherent validated milestones and publish concise coordination
updates. Maintain the product support matrix without implying that performance
work implements deferred methods.

The immediate next deliverable is **N0 plus a measured N1 trace fix**, followed
by the statistics acceleration slice. That yields attributable product gains
and tests the architecture before investing in broad backend replacement.
