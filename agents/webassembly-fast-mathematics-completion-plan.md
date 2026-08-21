# WebAssembly fast-mathematics completion plan

**Status:** implemented release candidate; external device activation remains
**Written:** 2026-08-20
**Completion recorded:** 2026-08-21
**Primary product boundary:** fast Sage-compatible mathematics in browsers,
Node.js, and application-owned WebViews
**Related plans:**
[`webassembly-production-parity-and-apps-plan.md`](webassembly-production-parity-and-apps-plan.md),
[`hyperelliptic-smalljac-genus2-3-plan.md`](hyperelliptic-smalljac-genus2-3-plan.md)

## Completion record

The locally verifiable program is implemented in release candidate
`b164bfafcf061ae1bc2d0abc398c87d7e68aae98`, production artifact
`sha256:ee239b992d3245b132b9cf6d507b81769ee5dc8842801ef2b7d46c69f72612e2`.
Its receipt identifies the exact source and pinned toolchain closure. The
machine-generated completion evidence records:

- 953 reviewed Wasm-relevant capabilities, including 514 available public or
  internal boundaries;
- 37 registered source-kernel families, 30 production families, 229 compiled
  functions, and zero unsupported production functions;
- 32 public release-parity workflows passing unchanged on Chromium, Firefox,
  and WebKit, with all 66 required route occurrences observed and no page
  errors;
- 20 heavyweight performance workloads with reviewed native and per-engine
  baselines;
- 44 of 44 heavyweight dashboard entries accelerated, with no observed
  `portable-computation` route;
- authenticated Node-Wasm CLI, website, and mobile asset consumers of the same
  artifact;
- 60 production assets totaling 126,892,806 raw, 18,837,149 gzip, and
  11,883,741 Brotli bytes, all within reviewed global and per-topology budgets.

The implemented surface includes mature smalljac/ffpoly elliptic and genus-2
coefficient generation, elliptic L-values and batched plots, modular symbols,
number-field order/ideal/zeta paths, exact and sparse matrices, M4RI, extension
fields and authenticated Conway data, algebraic matrices, graphs, group and
combinatorial kernels, multivariate resultants, MPFR/Arb/Acb numerical fields
and special functions, and bounded symbolic integration/root finding. The
Node-Wasm CLI accepts files, standard input, `-c`, and interactive input and
emits authenticated route diagnostics.

This completion is not a claim that every engine matches native speed.
Three-sample baselines preserve visible performance debt: Firefox remains
notably slower for Acb-heavy plotting and several algebraic/numerical kernels,
and modular-symbol startup is disproportionately expensive in every browser.
Those paths are nevertheless authenticated Wasm rather than Python fallback,
complete at their documented sizes without timeout, and remain explicit
optimization work rather than hidden compatibility work.

The release boundary is equally explicit. Linux validation prepared and
verified the Android/iOS offline asset closure, mobile TypeScript/lint/Jest and
contract suites, the live website's offline/cache/interrupt behavior, and the
WebKit memory and file-origin contracts. macOS/Xcode simulator builds, signed
physical current iPhone and iPad receipts, App Store provisioning, TestFlight,
and production DNS remain external activation gates. Genus-3 smalljac
certification and arbitrary native-extension/Unix compatibility remain product
exclusions, not silent fallbacks.

## Decision

Systematically make every computationally expensive supported Sage.js workflow
select a receipt-backed WebAssembly implementation. Retain ordinary Python as
the readable mathematical definition, correctness implementation, and
inexpensive orchestration layer. Do not turn this program into an attempt to
provide a Unix process, a general Node.js compatibility layer, or a complete
CPython extension ecosystem in a browser.

The enforceable product promise is:

> For every performance-critical public workflow in the reviewed production
> corpus, the normal supported input domain executes its hot mathematical
> kernels in authenticated WebAssembly, reports the selected execution route,
> agrees exactly or within its declared numerical contract with the desktop
> oracle, stays within reviewed memory and payload budgets, and does not
> silently run a comparably expensive Python algorithm.

This is deliberately stronger than “it works in a browser” and narrower than
“everything a desktop Unix installation can do.” A portable Python fallback is
still required by Sage.js architecture, but it is not evidence that a normal
performance-critical browser workflow is complete.

## Why this program exists

The current Wasm target is already substantial. At the time this plan was
written, the generated capability report classified 942 boundaries:

- 428 available;
- 500 exact portable fallbacks;
- 14 desktop-only;
- 238 generated-Wasm boundaries;
- 35 shared mature-library cores;
- 31 compiled-source kernel families.

The production source-kernel report records 193 compiled functions and 25
unsupported production functions. The recent smalljac/ffpoly work demonstrates
the intended result: `EllipticCurve.anlist` and elliptic L-series coefficient
generation now use the real mature algorithms in Wasm rather than direct point
counting at every good prime.

Those counts are useful ratchets but are not themselves a backlog. Many of the
500 fallback records are cheap glue, error paths, or operations for which the
ordinary implementation is already appropriate. Conversely, one unaccelerated
loop under a popular public method can make an otherwise impressive capability
count irrelevant. Completion must therefore be measured from public workloads
and their observed hot call graphs, not by blindly maximizing exported symbol
count.

The current production distribution is also already large enough that payload
architecture matters. It is roughly 123 MB raw, 18 MB gzip, and 12 MB Brotli,
depending on the exact source receipt. New mature libraries must normally be
lazy specialist artifacts rather than unconditional additions to the eager
kernel.

All numerical counts and sizes above are a dated baseline, not acceptance
constants. The checked-in generated reports and final build receipts are the
authoritative values.

## Scope boundary

### In scope

This program owns the functionality necessary to run supported mathematical
workloads quickly and honestly:

- exact integer, rational, modular, finite-field, polynomial, matrix, and
  algebraic-number kernels;
- number-field arithmetic, orders, ideals, local data, factorization,
  certificates, and zeta coefficients;
- elliptic and hyperelliptic local data, coefficient generation, modular
  symbols, L-series values, and batched plots;
- graph, combinatorial, symbolic, and numerical kernels that dominate supported
  public workflows;
- source-transparent compiled mathematical functions;
- mature foreign libraries such as FLINT, Arb, Acb, M4RI, smalljac, ffpoly,
  eclib, LinBox/FFLAS, and igraph when their license, target assumptions, memory
  model, and measured value justify shipping them;
- host-neutral adapters, packed schemas, resource ownership, and deterministic
  cleanup required to use those kernels;
- bounded browser facilities needed to initialize, interrupt, reset, cache,
  authenticate, and observe the mathematical engine;
- Node-Wasm and real-browser command-line harnesses used for differential,
  profiling, and debugging;
- application-owned HTTP(S) WebView hosting required to execute the same
  artifact on mobile;
- exact route, boundary-crossing, copied-byte, time, and memory diagnostics;
- lazy loading and artifact splitting needed to keep the distribution viable.

### Explicitly out of scope

The following are not completion requirements and must not be smuggled in as
prerequisites for a mathematical port:

- a general Unix shell, PTY, process table, signals API, fork/exec, or subprocess
  compatibility;
- arbitrary POSIX filesystem semantics, mount emulation, device files, pipes,
  sockets, or unrestricted host filesystem access;
- general outbound networking or a package manager inside the evaluator;
- Node-API, V8, or Node.js built-in emulation merely to reuse a desktop adapter;
- loading arbitrary CPython extension modules, shared libraries, or user-supplied
  native binaries;
- compiling arbitrary C/C++ packages in the end-user browser;
- a complete CPython standard-library or PyPI compatibility promise;
- desktop GUI toolkits, notebook servers, LaTeX distributions, databases, or
  system daemons;
- preserving a library's CLI when only its mathematical core is needed;
- making all desktop-only development, benchmarking, or maintainer tools work
  in Wasm;
- server-side computation disguised as browser support.

When a mathematical library assumes Unix, the task is to isolate and port the
pure mathematical closure or replace it with an equivalent shared core. The
default answer is not to grow a Unix emulation layer.

### What Python may still do

Python is not prohibited. The following uses are expected:

- validate public inputs and construct Sage-compatible return objects;
- select algorithms using inspected capabilities and size thresholds;
- orchestrate a bounded number of coarse Wasm calls;
- implement inexpensive exceptional cases, including small bad-prime logic;
- provide the same-source correctness fallback for unavailable accelerators;
- express readable mathematical policy that is source-transparently compiled;
- format, serialize, and present results when that work is not the bottleneck.

Python is not acceptable on the normal production route when it performs a hot
loop whose work is asymptotically or practically comparable to the mature
native algorithm. Examples include enumerating every point for thousands of
elliptic primes, dense cubic matrix multiplication, coefficient-by-coefficient
high-degree polynomial arithmetic, or evaluating a large complex plot one
point per host boundary.

The key distinction is **orchestration versus computation**, verified by
measurement and route tracing rather than by source-file extension.

## Completion units: public workflows, not functions

The atomic planning and release unit is a public workflow with a representative
input distribution. Each workflow record must define:

1. public Sage source that a user actually writes;
2. supported and exceptional input domains;
3. the desktop/native oracle and its mathematical contract;
4. expected Wasm capability routes;
5. a cold run and at least one warm batched run;
6. expected boundary crossings and copied-byte scale;
7. memory, timeout, and interrupt expectations;
8. a reviewed eager or lazy artifact owner;
9. an exact fallback policy;
10. Node-Wasm and real-browser receipts.

A private ABI smoke test is necessary but never sufficient. A capability is
production-available only when a public workflow proves that it actually
selected the capability and produced the expected result.

### Route taxonomy

Every observed route belongs to one of four classes:

| Class | Meaning | Production policy |
| --- | --- | --- |
| `wasm-library` | Mature library or shared C core running in Wasm | Preferred for expensive established algorithms |
| `wasm-compiled-source` | Actual reviewed Python source body lowered to Wasm | Preferred for project-owned kernels |
| `portable-orchestration` | Cheap Python/JS control, validation, or materialization | Allowed and expected |
| `portable-computation` | Python/JS performs substantial mathematical work | Allowed only for reviewed exceptional domains; forbidden silently on normal heavy cases |

Capability status alone cannot establish the route. Runtime instrumentation
must record fixed, non-forgeable capability identifiers, execution target,
call count, ingress bytes, egress bytes, total boundary crossings, and copied
bytes. Evaluated user code must not be able to fabricate these records.

## Normative implementation architecture

### One source of mathematical truth

Use the repository-wide implementation order:

1. ordinary CPython-parseable Python as the clear definition and fallback;
2. source-transparent `@native` compilation of the actual typed source body;
3. a mature external mathematical library;
4. a compact host-neutral shared core around such a library;
5. handwritten host adapters only for representation, validation, ownership,
   and transfer.

Do not independently reimplement mathematical policy in JavaScript, Node-API,
and Wasm wrappers. Do not map an unrelated compiled implementation to a public
function merely because their names resemble one another.

Every accelerated operation requires:

- a correct ordinary fallback;
- an independent or disabled-native differential oracle;
- inspectable source/IR/target provenance;
- a benchmark representative of the reason it was accelerated;
- explicit behavior when the accelerator is absent or rejects an input.

### Isolated kernels

After arguments are marshalled, a mathematical kernel must not call Python,
JavaScript, Node-API, or a host callback. Streaming algorithms must instead use
bounded chunks, resumable state, or an owned result buffer. This constraint
keeps the same core viable in native Node, browser workers, Node-Wasm, and
mobile WebViews.

### Flat packed ABIs

Boundaries may contain fixed-width scalars, checked offsets and lengths,
typed-array-compatible buffers, canonical arbitrary-integer/rational encodings,
generation-tagged resource handles, and bounded status records. They must not
expose foreign object layouts or retain host pointers.

Prefer one batched crossing over thousands of scalar calls. Each new boundary
must document:

- ownership and deterministic release;
- maximum lengths and allocation limits;
- Wasm32 conversion rules;
- memory-growth safety;
- error versus capability-unavailable status;
- cancellation points for long-running work.

### Ownership domains and artifact boundaries

A resource is owned by exactly one instantiated Wasm module. A pointer or
handle never crosses modules. Composition across specialist modules uses
canonical copied values, not shared foreign pointers.

The target artifact topology is:

- **bootstrap/runtime:** compiler frontend, evaluator, authenticated loader,
  serialization, and capability report;
- **eager exact core:** ubiquitous GMP/FLINT functionality whose load cost is
  justified by nearly every serious session;
- **lazy specialists:** algebraic numbers, smalljac/ffpoly, eclib/modular
  symbols, advanced number fields, M4RI/LinBox, graphs, or other large domains;
- **compiled-source packs:** grouped by ownership and public workflow, loaded
  before importing modules whose decorators resolve synchronously.

Every artifact is content-addressed and receipt-authenticated. Its manifest
binds toolchain versions, source and generated closure, exports, memory limits,
capabilities, compressed size, and dependencies. Loading a specialist must not
silently download another unrelated large domain.

### Target policy

The same host-neutral mathematical closure should execute in:

- browser Chromium, Firefox, and WebKit workers;
- Node.js through a supported Node-Wasm CLI/harness;
- the application-owned HTTP(S) origin used by mobile WebViews;
- native Node through the ordinary desktop adapter when appropriate.

Wasm32 word size is explicit. Never assume C `long`, `ulong`, `size_t`, or a
pointer has desktop width. Optimized assembly may remain a desktop path only
when a portable exact implementation of the same library core is selected and
measured for Wasm.

## Performance policy

### Measure before porting

For each workflow, collect profiles on native Node and at least Chromium before
selecting an implementation. Attribute time to:

- compilation and module initialization;
- mathematical kernels;
- Python orchestration;
- boundary marshalling and copies;
- public-object materialization;
- plotting/rendering;
- garbage collection and memory growth.

This prevents porting a low-level function that is not the bottleneck and
prevents blaming Python when the real cost is excessive copying or rendering.

### Performance acceptance

Each workflow gets reviewed per-engine baselines. Global gates are:

- the normal heavy case observes every required Wasm route;
- no unreviewed `portable-computation` route is observed;
- no timeout occurs at the documented interactive input size;
- warm performance and memory do not regress more than the checked-in budget;
- interrupt and reset recover within the engine-specific reviewed ceiling;
- boundary crossings and copied bytes scale with batches, not scalar elements;
- specialist payload is charged to first use and tracked separately from eager
  startup.

The improvement objective for CPU-bound non-rendering kernels is a warm browser
median within 3x of native after engine and word-size effects. This is a target,
not a license to falsify a baseline: current engine limitations and algorithms
may require a documented higher ceiling. Rendering-heavy plots report math and
render time separately. A slow but honest result remains an open performance
issue, not a completed port.

New baselines require human review. CI may enforce a bounded regression from an
accepted baseline but must never generate and accept a new baseline in the same
unreviewed step.

## Workstreams

### W0 — Workload inventory and fail-closed diagnostics

Build the authoritative performance map before expanding the binary surface.

- Enumerate supported public modules and nominate representative interactive,
  batch, and stress workflows.
- Add each accepted workflow to the shared Node/browser corpus.
- Record hot call graphs, selected routes, crossings, copies, time, and memory.
- Classify every fallback reached by a normal workload as orchestration,
  exceptional computation, or prohibited computation.
- Make missing route telemetry a gate failure, not “unavailable” success.
- Add a Node-Wasm CLI that runs the same evaluator and exact artifact, accepts a
  file or standard input, emits ordinary output, and can emit a JSON diagnostic
  receipt. It is a test/debug harness, not a Unix shell.
- Publish a generated dashboard grouped by public family, not just raw export.

**Exit:** every Tier 1 and Tier 2 workflow has an oracle, trace expectation,
profile, fallback disposition, and named owner.

### W1 — Close existing foundational resource gaps

Resolve the 25 currently unsupported production-kernel functions before
creating avoidable new handwritten layers.

- Add ownership-domain adapters for integer, rational, word-prime, polynomial,
  P1/Heilbronn, and sparse-resource functions where the resulting workflow is
  performance-relevant.
- Declare and generate the missing extension-field resources required by
  public finite-field workflows.
- Keep resources in one Wasm ownership domain or use canonical copied
  serialization between domains.
- For each unsupported function that is not useful, remove it from production
  selection or record a precise non-production disposition. Do not leave an
  ambiguous “fallback” count as permanent debt.
- Add large-value, memory-growth, missing-export, deterministic-close, and
  copied-lifetime regressions.

**Exit:** the production kernel coverage report has zero unexplained unsupported
functions; every residual fallback is reviewed against a public workload.

### W2 — Exact algebra and linear algebra foundation

Complete the high-reuse substrate used by higher mathematical domains.

- Dense and sparse matrices over `ZZ`, `QQ`, prime fields, binary fields, and
  extension fields: construction, serialization, echelon forms, rank,
  determinant, solve, inverse, kernels, characteristic/minimal polynomial,
  multiplication, and selected decompositions.
- Polynomial arithmetic and factorization over the same rings, including
  arbitrary-prime and extension-field resources.
- M4RI for binary linear algebra and evaluated FFLAS/LinBox kernels for sizes
  where they beat FLINT or compiled source in Wasm.
- QQbar/AA arithmetic, exact roots, comparisons, enclosures, and matrix
  operations through a lazy algebraic artifact.
- Integer factorization and primality paths needed by downstream workflows.

Use differential matrices that include zero dimensions, singular and
rank-deficient cases, large arbitrary integers, large word primes, extension
fields, and memory growth. Avoid portable algorithms with severe intermediate
coefficient explosion on normal browser sizes.

**Exit:** higher domains can rely on a fast, owned, batch-oriented exact algebra
substrate without probing accidental backend methods.

### W3 — Arithmetic geometry and number theory specialists

#### Elliptic curves and modular forms

- Keep smalljac/ffpoly coefficient generation on the real Wasm algorithm for
  ordinary good-prime batches; direct `a_p` point counting remains only for
  explicitly bounded exceptional/bad-prime cases and fallback correctness.
- Port additional eclib/modular-symbol kernels after separating mathematical
  cores from host adapters and Unix assumptions.
- Accelerate conductors, local data, root numbers, Hecke data, modular symbols,
  and L-series setup where profiles show Python hot loops.
- Batch coefficient and value requests; a plot tile must not invoke one host
  crossing per point.
- Expose backend and direct-fallback counters in diagnostics.

#### Hyperelliptic curves

- Follow the separate genus-2/genus-3 plan: validated smalljac genus-2 local
  polynomials first, then certified genus-3 reconstruction rather than claiming
  that Hasse–Witt residues are full Euler factors.
- Port ffpoly/smalljac portable word arithmetic, not x86-64 assembly, and retain
  exact differential tests against optimized native builds.
- Make local-polynomial batches and Jacobian operations lazy specialists.

#### Number fields

- Move hot maximal-order, ideal, prime decomposition, local certificate, unit,
  class-group, and zeta-coefficient work to shared FLINT/PARI-derived or
  compiled-source kernels as licensing and architecture permit.
- Treat proof certificates as public outputs: Wasm and native must replay and
  authenticate the same canonical mathematical evidence.
- Batch prime and coefficient computations and avoid repeated object
  round-trips.
- Keep inexpensive orchestration and proof checking readable in Python.

**Exit:** the representative elliptic L-series plot, modular-symbol computation,
genus-2 local-factor batch, cubic number-field order/ideal workflow, and
number-field zeta batch all complete without a prohibited computation route.

### W4 — Graphs, combinatorics, symbolic, and numerical mathematics

Work from profiles and public demand rather than porting packages wholesale.

- Evaluate an igraph specialist for graph algorithms whose Python complexity
  dominates useful workloads.
- Source-compile project-owned combinatorial loops and recurrence kernels.
- Extend Arb/Acb batching for special functions, certified roots, numerical
  integration, and analytic continuation.
- Separate numeric kernel time from JavaScript plotting/layout time.
- Port symbolic polynomial/expression algorithms only when their canonical
  representation and memory behavior are bounded; do not attempt to transplant
  a complete desktop CAS process.
- Prefer compact domain-specific artifacts over a monolithic “everything”
  module.

**Exit:** every supported Tier 1/2 workflow in these families has either an
accepted accelerated route or a documented product decision that it is outside
the supported Wasm mathematical surface.

### W5 — Distribution, engines, and mobile evidence

- Produce clean, reproducible, exact-source artifacts twice in CI and compare
  identities.
- Run correctness and performance corpora in Chromium, Firefox, and WebKit.
- Run the same public corpus through the Node-Wasm CLI.
- Keep service-worker caching cryptographically bound to the production
  manifest and fail closed on forged or stale bytes.
- Verify actual memory constructors and ceilings, not only Wasm import
  declarations.
- Stage the exact artifact into Android and iOS shells; validate an
  application-owned loopback HTTP(S) origin, outer and nested workers,
  interruption, offline restart, lifecycle, and memory pressure.
- Keep physical iPhone/iPad and TestFlight evidence explicitly external until
  it exists.

**Exit:** a single artifact identity is traceable through Node-Wasm, all three
browser engines, website staging, and mobile asset receipts.

## Domain priority matrix

| Domain | Representative completion workload | Preferred acceleration | Artifact policy | Priority |
| --- | --- | --- | --- | --- |
| Integer/rational algebra | large factorization; dense solve/HNF | FLINT/GMP + compiled source | eager core | P0 |
| Prime/extension fields | polynomial factor/GCD; dense solve | FLINT, M4RI, FFLAS/LinBox if measured | eager common, lazy specialist | P0 |
| Algebraic numbers | `AA`/`QQbar` roots, compare, enclosure | FLINT qqbar/Arb shared core | lazy algebraic | P0 |
| Elliptic curves | `anlist`, local data, L-values, 100×100 plot | smalljac/ffpoly, Arb/Acb, eclib cores | lazy curves | P0 |
| Modular symbols | weight 2 Hecke/cuspidal workflow | compiled P1/Heilbronn + eclib where useful | lazy curves/modsym | P0 |
| Number fields | cubic maximal order, ideals, zeta(1000) | FLINT/shared cores + compiled proof kernels | lazy number-fields | P0 |
| Hyperelliptic | genus-2 local factors to a large bound | smalljac; certified later algorithms | lazy hyperelliptic | P1 |
| Sparse linear algebra | representative rank/kernel workload | compiled source/LinBox after measurement | lazy linear-algebra | P1 |
| Analytic functions | zeta/L/gamma batches | Arb/Acb shared cores | eager small core or lazy analytic | P1 |
| Graphs | large shortest path/components/isomorphism case | igraph or compiled source | lazy graphs | P2 |
| Combinatorics | selected enumeration/recurrence batches | compiled source | small compiled packs | P2 |
| Symbolic/numerical | profiled supported public cases | compiled source, FLINT/Arb/Acb | domain specialists | P2 |

Priority indicates execution order, not an assertion that lower-priority
mathematics is unimportant. Dependencies and measured user impact may promote a
workflow.

## Parallel execution model

Run the program as narrow half-day to two-day lanes using
`pnpm parallel:new`. A lane owns a coherent mathematical closure and its focused
tests. The integration lane owns shared registries, package layout, release
receipts, corpus manifests, and final artifact production.

Recommended persistent lane families are:

1. `wasm-inventory-performance` — workload catalog, profiles, trace audits, and
   dashboard;
2. `wasm-resource-closure` — outstanding generated resource ownership and ABI;
3. `wasm-linear-algebra` — matrices, polynomial foundations, M4RI/LinBox;
4. `wasm-curves-modsym` — smalljac, eclib, modular symbols, L-series;
5. `wasm-number-fields` — orders, ideals, certificates, zeta and class/unit
   groups;
6. `wasm-hyperelliptic` — genus-2/3 local factors and Jacobians;
7. `wasm-symbolic-numeric-graphs` — demand-driven later specialists;
8. `wasm-toolchain-artifacts` — pinned builds, lazy artifacts, receipts, payload;
9. `wasm-browser-node-ci` — Node-Wasm CLI, browser engines, security, offline,
   performance;
10. `wasm-mobile-evidence` — exact asset staging and device receipts;
11. `wasm-integration` — shared manifests, conflict resolution, full builds, and
    release candidate.

Do not assign a lane all of `src/baselib` or all of `packages/flint-wasm`.
Claims should name the smallest modules, adapters, and tests. Shared edits are
handoffs to integration, not opportunistic lane expansion. Each lane contract
must record public consumers, unsupported domains, fallback behavior, artifact
impact, validation receipts, and risks.

## Required task template

Every acceleration task must answer these questions before implementation:

1. **Public case:** Which exact public source and input size is too slow?
2. **Profile:** Where are time, crossings, copies, and memory spent?
3. **Semantics:** What is the Sage-compatible result and error contract?
4. **Oracle:** Which independent native/dynamic computation establishes it?
5. **Implementation:** Source-transparent kernel or which mature library core?
6. **Portability:** What 32-bit, endian, alignment, assembly, global-state,
   thread, or Unix assumptions exist?
7. **ABI:** What bounded packed input/output and ownership protocol is used?
8. **Fallback:** When may the ordinary implementation run, and how is that
   observable?
9. **Artifact:** Eager or lazy; expected compressed delta and dependency graph?
10. **Evidence:** Which Node-Wasm, browser, memory, interrupt, and differential
    receipts close the task?

If the task cannot answer these yet, it is an investigation lane, not an
implementation claim.

## Validation ladder

Each completed mathematical lane runs the narrowest applicable subset, then
integration runs the aggregate gates.

### Per-kernel

- strict Python type/format checks;
- native enabled-versus-disabled differential;
- direct real Wasm link and execution;
- malformed, overflow, zero-size, singular, memory-growth, and cleanup cases;
- representative benchmark and generated code/closure inspection.

### Per-public-workflow

- identical public source in native Node, Node-Wasm, and browser;
- exact output or declared ball/error contract;
- required route observed and counterfeit route rejected;
- fallback forced deliberately and compared;
- cold and warm timings, memory, crossings, and copied bytes;
- interruption followed by successful reset and rerun.

### Per-artifact

- frozen pinned toolchain and dependency lock;
- two clean builds with identical identity;
- exact source, generator, configuration, lazy-module, compiler-cache, and
  foreign-library closure in the receipt;
- finite memory and export inspection;
- compressed eager and specialist sizes against reviewed budgets;
- no checkout paths, undeclared imports, Node-API symbols, or host callbacks;
- adversarial cache and receipt-binding tests.

### Per-release candidate

- `pnpm architecture:check` and `pnpm test:portable`;
- production receipt and independent artifact validation;
- complete public parity corpus on Chromium, Firefox, and WebKit;
- Node-Wasm oracle/CLI corpus;
- browser security, offline/cache, dynamic-code, serialization, and memory
  gates;
- heavyweight performance suite with required baselines;
- website offline/session/interrupt proof;
- Android static build and exact asset validation;
- iOS simulator and physical-device evidence when making those claims.

Generated or ignored artifacts are evidence only when their receipt identifies
the exact committed source revision under review.

## Milestones

### M0 — Freeze the boundary and measurements

- Ratify this scope.
- Add the Node-Wasm CLI.
- Define Tier 1/2 public workflows and gather native/browser profiles.
- Classify all observed fallback computation.
- Establish reviewed performance and payload baselines.

### M1 — No silent fallback in the existing heavyweight suite

- Every current heavyweight performance case observes its intended Wasm route.
- Elliptic coefficients, L-values, number-field zeta, exact matrices, and plots
  have no normal-case Python hot loop.
- All current route and timing regressions fail closed in CI.

### M2 — Foundational exact closure

- Resolve or explicitly retire all 25 unsupported production functions.
- Complete operation-specific matrix/polynomial/resource dispatch.
- Close extension-field, algebraic-number, and sparse/binary prerequisites.
- Split large specialists and keep eager payload within its reviewed budget.

### M3 — Desktop mathematical surface review

- Review every desktop public mathematical family by workload.
- Accelerate all accepted Tier 1/2 cases.
- Mark genuinely unsupported families with a mathematical/product reason and a
  clear capability result; do not let them silently run for minutes.
- Add representative hyperelliptic, graphs/combinatorics, and advanced
  number-theory cases.

### M4 — Cross-engine and mobile release

- One exact artifact passes Node-Wasm and all browser engines.
- Website execution is offline, interruptible, and cache-authenticated.
- Mobile shells stage that artifact and produce simulator/device receipts.
- External DNS, signing, TestFlight, and physical-device claims remain separate
  activation gates.

## Definition of done

This program is complete only when all of the following are true:

1. Every supported performance-critical public workflow has an authoritative
   corpus entry, oracle, required route, fallback disposition, and reviewed
   performance budget.
2. Every normal Tier 1/2 workflow observes `wasm-library` or
   `wasm-compiled-source` for its hot kernels and observes no prohibited
   `portable-computation` route.
3. The production-kernel report contains no unexplained unsupported function;
   every residual fallback is tied to an exceptional domain or an explicit
   product exclusion.
4. Desktop-only mathematical capabilities have been reviewed individually.
   None is desktop-only merely because its current adapter uses Node-API,
   x86-64 assembly, a CLI, or a Unix build system.
5. Native, Node-Wasm, Chromium, Firefox, and WebKit results agree under the
   declared exact or numerical contract.
6. Performance receipts show no timeout at documented sizes, no unreviewed
   regression, bounded crossings/copies, and engine-specific memory safety.
7. The eager artifact and every specialist are reproducible,
   content-addressed, source-closed, finite-memory, and within reviewed
   compressed-size budgets.
8. Long computations are interruptible and a reset leaves the next computation
   correct with no leaked resources.
9. Public diagnostics and `sagejs_capabilities` state what is accelerated,
   which route actually ran, and why a fallback or rejection occurred.
10. Documentation tells users the supported domains, limits, artifact costs,
    and exceptional fallback thresholds without describing an unmeasured path
    as native-speed.
11. CI prevents a new expensive native-only or Python-fallback public workflow
    from landing without an explicit Wasm disposition and benchmark.
12. No completion claim depends on providing a general Unix environment,
    arbitrary native extensions, or a remote computation server.

“All 942 capability records are available” is not required. “Every supported
expensive public computation is fast, observable, tested, and honestly bounded”
is required.

## Initial ordered backlog

The first integration cycle should execute these tasks in order:

1. Land a Node-Wasm CLI around the production evaluator and exact artifact.
2. Generate the public workflow acceleration dashboard from corpus, capability,
   kernel-coverage, and performance receipts.
3. Add fail-closed detection for unreviewed portable computation on heavyweight
   cases.
4. Profile all current browser examples and documentation fences, including
   boundary crossing and copy attribution.
5. Close the existing 25 unsupported production functions or approve precise
   exclusions.
6. Finish extension-field and operation-specific matrix/polynomial resource
   closure.
7. Expand smalljac/eclib/modular-symbol coverage using the real algorithms and
   documented direct-fallback thresholds.
8. Complete the number-field maximal-order/ideal/zeta hot paths and canonical
   certificate parity.
9. Establish lazy artifact boundaries and compressed budgets for curves,
   algebraic numbers, number fields, and advanced linear algebra.
10. Add genus-2 local-polynomial and Jacobian workloads from the hyperelliptic
    plan.
11. Profile and prioritize graph, combinatorial, symbolic, and numerical public
    families.
12. Produce one exact-source cross-engine release candidate and stage it into
    website and mobile receipts.

Tasks 1–4 are governance with executable evidence, not paperwork: they prevent
the program from optimizing the wrong code or declaring a fallback-based demo
finished. Tasks 5–10 provide the reusable mathematical substrate and the first
high-value vertical slices.

## Risks and controls

| Risk | Control |
| --- | --- |
| Capability laundering: manifest says available but public call falls back | Private fixed-ID runtime tracing; required-route assertions per case |
| Payload grows into an unusable monolith | Lazy specialist artifacts; compressed delta budget per task |
| Thousands of crossings erase native speed | Packed batch ABIs; crossing/copy distributions in performance gates |
| Wasm32 truncation or upstream 64-bit assumptions | Fixed-width boundary types; portable word-arithmetic differentials; large-value cases |
| Foreign-resource lifetime bugs | Single ownership domain, generation-tagged handles, copied output, deterministic close tests |
| Browser engine variance | Separate Chromium/Firefox/WebKit baselines and memory receipts |
| Fallback is exact but unexpectedly slow | Normal/exceptional domain split; timeout and route gates; clear capability diagnostics |
| Port duplicates mathematical policy | Source-transparent compilation or shared mature core; thin host adapters |
| Build provenance omits generated/lazy sources | Exact compiler dependency closure and mutation tests in receipt |
| Optimizing private ABI misses public bottleneck | Workflow-first profiles and public corpus acceptance |
| Unix assumptions expand project scope | Port isolated math closure; reject shell/process/filesystem emulation as a solution |
| Parallel lanes conflict or overclaim | Narrow file claims, integration-owned shared registries, receipt-bearing handoffs |
| Baselines legitimize poor performance | Human-reviewed initial baseline plus explicit improvement target and open debt |

## Governance

The integration owner maintains this plan, the workflow inventory, and the
generated status dashboard. At each release milestone:

1. regenerate capability and kernel reports;
2. compare workload acceleration coverage and fallback classifications;
3. inspect payload and per-engine performance deltas;
4. review every new exclusion or raised budget;
5. publish completed workflows and remaining high-impact gaps;
6. select the next lanes by measured user-visible time saved.

Changes to the scope boundary require an explicit edit to this document. A
single mathematical port may add a narrowly necessary runtime primitive, but
it may not silently redefine the target as a Unix or Node-compatible operating
environment.

The durable architectural endpoint is a Sage-compatible mathematical system
whose readable Python layer expresses semantics and orchestration while its
expensive kernels execute through verified, high-performance Wasm closures.
