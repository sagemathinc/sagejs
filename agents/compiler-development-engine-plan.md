# Plan: a proven compiler-development engine for Sage.js

**Status:** proposed

**Date:** 2026-08-28

**Baseline:** `main` at or after `d5c9ad27`

**Depends on:**

- [`optimizing-mathematics-compiler-rfc.md`](optimizing-mathematics-compiler-rfc.md)
- [`optimizing-mathematics-compiler-parallel-program.md`](optimizing-mathematics-compiler-parallel-program.md)
- [`../docs/optimizer-opportunities.md`](../docs/optimizer-opportunities.md)
- [`../docs/optimizer-machine-evidence.md`](../docs/optimizer-machine-evidence.md)
- [`../ARCHITECTURE.md`](../ARCHITECTURE.md)

## Executive decision

Build a closed-loop compiler-development engine that turns measured Sage.js
workloads into independently verifiable optimization projects.

The engine must connect five things that currently exist separately:

1. authentic workload execution and phase-resolved profiling;
2. source- and compiler-owned region identities;
3. the static optimization-opportunity dashboard;
4. machine-readable optimization dossiers suitable for humans and agents; and
5. promotion gates proving semantics, route, resource behavior, and inclusive
   performance.

It is not complete when it prints profiles or ranks loops. It is complete only
after it has driven at least one previously unavailable, general compiler
optimization from discovery through production acceptance and has rejected a
known attractive-but-slower candidate.

The required proof-of-operation is:

```text
authenticated workload
        |
        v
measured hot source region
        |
        v
verified compiler rejection / selected route
        |
        v
machine-readable optimization dossier
        |
        v
general proof + representation + target implementation
        |
        v
exact differential and adversarial validation
        |
        v
inclusive workload improvement
        |
        v
updated dashboard, profile, and promotion receipt
```

## What problem this solves

Python source describes observable behavior very well, but normally leaves
representation, ownership, aliasing, range, effect, parent, and method-stability
facts dynamic. Those missing facts are why a mathematically simple operation
may allocate objects, dispatch methods, invoke coercion, and cross boundaries
inside every iteration.

The dashboard already provides a static census:

- 415 source modules compile at `O2`;
- 11,454 functions and methods are analyzed;
- 10,259 loops occur inside functions;
- 43 loops currently select an optimization;
- 2,739 loops have compiler rejection evidence;
- 7,477 loops are not yet claimed by a mathematical-domain pass; and
- 232 loops are one-reason compiler near misses.

Those numbers do not identify hot code. A large cold loop can rank above a
three-operation recurrence executed a billion times. Conversely, a measured
hot phase can be algorithmically deficient rather than compiler-limited. The
engine must join static proof evidence with runtime evidence without confusing
either for the other.

## Meaning of “proven to work”

This plan uses four distinct kinds of proof. They must not be conflated.

### 1. Semantic admissibility

An optimization is legal only when the compiler establishes every fact its
transformation consumes, an independent verifier recomputes the critical
claims, runtime guards authenticate dynamic assumptions before effects, and an
untouched same-source fallback remains available.

Differential and adversarial testing are required evidence. They are not a
formal proof of all Python semantics. Lean, SMT, or a translation validator may
later strengthen individual obligations, especially exact range proofs, but
they are not prerequisites for the first engine.

### 2. Evidence integrity

Profiles, compiler decisions, routes, outputs, and benchmark receipts must be
bound to exact source, workload, artifact, engine, host, and configuration
identities. Evaluated user code must not be able to forge compiler or route
telemetry.

### 3. Performance causality

The selected change must improve the complete measured workload, not merely a
detached arithmetic microbenchmark. A profile before and after the change must
show where time moved. Conversion, copying, materialization, compilation,
loading, cleanup, and public result construction remain inside the accounting
boundary.

### 4. Development-engine effectiveness

The engine itself is successful only when its dossier leads to a safe,
general optimization that passes promotion, improves an authentic workload,
and applies beyond the motivating source location. A manually selected
benchmark followed by a hard-coded emitter rule does not satisfy this proof.

## Normative invariants

The implementation MUST preserve these constraints:

- Mathematical source remains ordinary CPython-parseable Python.
- A compiler opportunity is identified by source provenance and semantic
  structure, never by a Python function name.
- Runtime measurements are observations, not semantic facts.
- Dashboard heuristics are labeled separately from compiler rejection codes.
- An agent may propose facts or code; only deterministic validators may admit
  them.
- Profiling instrumentation must not run inside every arithmetic operation.
- A target comparison includes entry, conversion, boundary, residency,
  materialization, and cleanup costs.
- V8, Wasm, `@native`, a mature library, and the generic runtime remain
  independent candidates.
- A failed guard runs the untouched fallback before visible optimized effects.
- Optimization contracts assert a proved route; they do not make an unproved
  transformation legal.
- No generated patch is merged automatically.
- The integration lane alone owns catalogs, shared schemas, pass ordering,
  evaluator telemetry, shared runtime guards, and promotion policy.
- Browser startup and compiler latency budgets remain enforced.
- Windows x64 and the three browser engines retain their existing support and
  fallback requirements.

## Non-goals

The first engine will not:

- infer that every slow function needs compilation;
- replace algorithm selection or mathematical profiling;
- build a general Python JIT;
- run a stochastic autotuner during ordinary evaluation;
- claim precise per-line time from an unsupported browser profiler;
- treat source operation counts as runtime allocation counts;
- optimize all 10,259 loops;
- use an LLM judgment as route authentication;
- require Lean before compiler work can proceed;
- turn `@optimize` into an unsafe hint; or
- favor V8, Wasm, or native code independently of measured complete costs.

## System architecture

The engine has seven components with versioned boundaries.

### A. Workload catalog

The catalog defines authentic computations rather than isolated source
snippets. Each workload record contains:

- stable workload and corpus IDs;
- public or internal entry point;
- exact input serialization or deterministic generator;
- expected output digest and independent oracle;
- phase labels where the algorithm exposes meaningful phases;
- warmup, repetition, timeout, and reset policy;
- required capabilities and execution targets;
- expected correctness, proof, and resource modes;
- allowed host/platform matrix; and
- ownership and review status.

Initial catalog classes are:

1. positive compiler controls already known to select V8 regions;
2. a negative control known to be slower when lowered to generated JavaScript;
3. the cubic class/unit-group corpus and its phase profiler;
4. one public polynomial or matrix workload outside number fields; and
5. one browser-relevant numerical or finite-field workload.

The catalog must distinguish microbenchmarks, representative public workloads,
and held-out application workloads. A microbenchmark can explain a mechanism
but cannot alone promote an optimization.

### B. Profile and runtime-evidence collector

The collector produces source-attributed observations while minimizing
observer effects.

For Node discovery it should combine:

- V8 sampling profiles mapped through compiler source maps;
- existing phase timers and mathematical boundary telemetry;
- evaluator-owned optimization route and guard/fallback counts;
- copied-byte, materialization, resource, and boundary counters; and
- optional allocation sampling for investigations where object churn is a
  plausible bottleneck.

The profiler must not insert a clock into every loop iteration. Optional
region-entry counters are permitted only outside the lowered hot loop and must
have a measured overhead calibration. Sampling is the primary attribution
mechanism for fine-grained Node discovery.

Chromium, Firefox, and WebKit do not expose one uniform trustworthy sampling
API. The first engine therefore uses Node for source-level discovery and uses
the browser engines for route, correctness, resource, and inclusive workload
validation. Browser-specific sampling may be added only with explicit
capability and accuracy labels.

Every profile records:

- warm and cold samples separately;
- inclusive and exclusive phase time where available;
- sample count and confidence/coverage;
- compilation, initialization, and first-target-load time;
- exact selected optimizer route and guard outcomes;
- dynamic boundary crossings and copied bytes;
- resource live/high-water counts;
- profiler overhead calibration; and
- unmatched samples rather than silently dropping them.

### C. Stable source and region identity

The compiler already emits stable optimizer region identities. The engine must
extend the same discipline to every profile-attributable function and loop.

An identity contains:

- normalized repository path;
- lexical qualified function name;
- exact source range;
- semantic structure fingerprint;
- compiler/frontend schema identity; and
- predecessor identity when a source edit changes the range but preserves a
  recognized region.

Source maps and emitted profile anchors carry these identities without
creating user-visible globals. Mapping is many-to-one when several generated
instructions implement one semantic operation. Ambiguous or unmatched profile
records remain explicit.

Function names aid display and querying but are never sufficient authority.

### D. Dashboard and hotness join

The current dashboard remains the complete static inventory. A new join layer
adds observations without mutating compiler truth.

For each workload/region pair it records:

- observed call or entry count;
- sampled inclusive/exclusive time and confidence;
- fraction of complete workload wall time;
- selected or rejected compiler decisions;
- stable compiler and heuristic reason codes;
- static object-result, allocation, coercion, access, and call sites;
- dynamic boundaries, copies, resources, and guard outcomes;
- plausible eliminable fraction as an interval, not a fabricated scalar;
- candidate target costs; and
- whether the region is algorithmic, representational, boundary-dominated,
  proof/certificate-dominated, or currently unclassified.

The join fails closed when source, compiler, or workload identities do not
match. A profile may remain useful as historical evidence, but it cannot rank
the current checkout.

### E. Optimization dossier generator

The dossier is the primary interface for a human or Codex agent. It is a
detached, immutable projection of verified static evidence and authenticated
runtime receipts.

Each dossier contains:

- exact source and semantic region identity;
- source excerpt and owning function;
- workloads in which the region is observed;
- phase and wall-time contribution with uncertainty;
- current optimizer IR and selected/rejected decisions;
- proven, guarded, unknown, and invalidated facts;
- stable rejection reasons and remediation descriptions;
- estimated and observed allocations, coercions, boundaries, and copies;
- candidate representations and targets;
- the smallest unresolved proof set;
- a proposed `@optimize(require=...)` contract, when meaningful;
- an automatically minimized or curated witness;
- required CPython/O0/independent mathematical oracles;
- adversarial cases implied by the missing facts;
- cold/warm/compile/size/resource benchmark obligations;
- a generality hypothesis naming other possible consumers;
- negative evidence and rejected approaches;
- claimed files and shared integration requirements; and
- explicit promotion criteria.

The dossier generator may recommend a category of transformation. It may not
claim that the transformation is legal or profitable before the relevant
proof and benchmark exist.

### F. Campaign and parallel-work generator

Once an integration owner approves a dossier, the engine can create a campaign
manifest and narrow parallel task templates.

Possible lanes are:

- workload and independent oracle;
- semantic recognition and canonicalization;
- effect/alias/escape/range analysis;
- representation planning;
- V8 target;
- resident or fused Wasm target;
- source-transparent native or mature-library target;
- independent verifier and malformed-plan corpus;
- generated/adversarial differential evidence; and
- integration, cross-engine validation, and promotion.

Parallel work starts only after versioned interfaces and file claims are
frozen. Domain lanes return exact registration patches instead of editing
shared catalogs. The integration lane chooses among competing candidates and
owns the final evidence receipt.

The generator should use the existing `pnpm parallel:new` contract rather than
introducing a second worktree system.

### G. Promotion and longitudinal evidence

Promotion produces a content-addressed campaign receipt containing:

- baseline and candidate commits;
- workload, source, compiler, artifact, engine, and host identities;
- exact output and oracle results;
- before/after compiler decisions and reasons;
- selected target and authenticated runtime route;
- full timing samples and comparison method;
- compiler, emitted-code, startup, copy, boundary, and resource costs;
- neighboring workload results;
- dashboard diff;
- resolved and newly introduced opportunities;
- fallback/adversarial results; and
- a machine decision of accepted, rejected, or inconclusive.

The receipt validator, not an agent, applies the reviewed promotion policy.

## Versioned data contracts

The first implementation should define these schemas.

### `sagejs.optimizer-workload/v1`

Defines exact workload identity, inputs, oracle, phases, repetitions,
capabilities, and permitted platforms.

### `sagejs.optimizer-profile-receipt/v1`

Contains authenticated run identity, source-mapped samples, phase timings,
route/guard telemetry, boundary/copy/resource counters, and profiler overhead.

### `sagejs.optimizer-hotness-overlay/v1`

Joins one or more current profile receipts to the static opportunity dashboard.
Every measurement retains its workload and receipt identity.

### `sagejs.optimizer-dossier/v1`

Contains the complete bounded optimization task described above. All compiler
claims are copied only from verified optimizer IR.

### `sagejs.optimizer-campaign/v1`

Declares lanes, file claims, hypotheses, targets, oracles, acceptance metrics,
and required promotion platforms.

### `sagejs.optimizer-promotion-receipt/v1`

Records the exact before/after evidence and validator decision.

Unknown fields, schema versions, reason codes, identities, and target claims
fail validation. JSON outputs are deterministic and detached from compiler
objects before publication.

## Opportunity classification

Before code is changed, every hot dossier must be assigned one primary class.

| Class | Typical response |
| --- | --- |
| Algorithmic | Improve the mathematical algorithm or use a mature library |
| Repeated proof/state construction | Reuse or lazily construct authenticated state |
| Representation | Prove and retain a compact scalar, tuple, buffer, or resource form |
| Dynamic dispatch/coercion | Establish known-call/effect provenance or fuse the region |
| Boundary dominated | Batch calls or keep data resident |
| Allocation/materialization | Scalar replace, stream, borrow, or publish transactionally |
| Compiler rejection | Resolve the smallest missing fact or supported operation |
| Target mismatch | Compare complete V8/Wasm/native/library costs |
| Cold/startup dominated | Cache or reduce compilation/loading; do not enlarge hot code blindly |
| Unknown | Improve measurement before implementation |

This classification prevents the compiler from being used to hide an
algorithmic deficiency. The class/unit-group profiler remains a mandatory
held-out control because prior work repeatedly showed that duplicated proof
and representation state, rather than arithmetic kernels, can dominate.

## Ranking policy

Do not rank solely by static source size or one opaque score. Use eligibility
gates followed by a transparent lexicographic ranking.

### Eligibility gates

A candidate enters the actionable queue only when:

- it appears in an authenticated current workload profile;
- attribution coverage exceeds a reviewed threshold;
- it contributes a material amount of inclusive or exclusive time;
- exact workload output is known;
- its primary opportunity class is assigned;
- the proposed work does not duplicate a mature algorithm without reason; and
- there is a plausible same-source fallback-preserving transformation.

### Ranking dimensions

Retain each component separately:

1. conservative lower bound on removable wall time;
2. number and importance of affected workloads;
3. compiler near-miss distance;
4. generality across source locations/domains;
5. availability of an existing fact, representation, or target component;
6. semantic and resource risk;
7. expected compilation and code-size cost; and
8. evidence quality.

The displayed priority may combine these dimensions, but the raw components
must remain inspectable. Changing weights cannot change underlying evidence.

### Near-miss definition

A compiler near miss means one rejected pass has exactly one stable unresolved
reason and no other pass already selected the loop. Dashboard heuristics do not
count as compiler near misses.

An observed near miss still requires profiling. A hot region rejected only for
`bounded-integer.mutable-buffer-access` is promising; a cold region with the
same reason is not automatically work.

## Developer and agent interfaces

Initial commands should be developer interfaces rather than immediate stable
public APIs. Provisional shapes are:

```bash
# Static inventory already implemented.
pnpm optimizer:opportunities
pnpm optimizer:opportunities:query -- path/to/module.py:LINE

# Proposed measured workflow.
sagejs optimize profile --workload cubic-class-groups --output /tmp/profile.json
sagejs optimize explain path/to/module.py:LINE --profile /tmp/profile.json
sagejs optimize dossier path/to/module.py:LINE --profile /tmp/profile.json
sagejs optimize campaign --dossier /tmp/dossier.json --output agents/campaigns/...
sagejs optimize compare --baseline BASE --candidate HEAD --workload ID
sagejs optimize verify-receipt /tmp/promotion.json
```

Before stabilizing names, scripts under `scripts/` may provide the same
functionality. The commands must support JSON output and concise human output.

For notebook and agent use, `explain` should answer:

- Was the source compiled at `O2`?
- Which region contained the selected line?
- Which pass selected or rejected it?
- Which facts are missing?
- Did runtime guards succeed?
- Was this region actually hot in the supplied workload?
- Which costs dominate?
- What evidence would be required to change it safely?

## Codex operating protocol

Codex should follow this protocol for every campaign.

### Discovery

1. Run the authentic workload without modifying compiler code.
2. Verify output and profile receipt identity.
3. Query the joined dashboard.
4. Classify the bottleneck.
5. Produce or review the dossier.
6. State a falsifiable optimization hypothesis.

### Design

1. Identify reusable facts and consumers.
2. Choose the smallest semantic domain.
3. Define representation and ownership explicitly.
4. Compare complete V8, Wasm, native, library, and generic costs.
5. Specify guards, fallback, exceptions, interruption, and publication.
6. Define an independent verifier before target lowering.
7. Define promotion and rejection conditions before benchmarking.

### Implementation

1. Add or reuse target-neutral IR and facts.
2. Implement the verifier independently from transformation analysis.
3. Preserve source provenance and fallback identity.
4. Implement candidate targets in isolated lanes where useful.
5. Generate differential and adversarial cases.
6. Make `@optimize(require=...)` fail if the intended route disappears.

### Evaluation

1. Validate CPython/O0/independent mathematical results.
2. Inspect IR and target output.
3. Verify runtime route and guards.
4. Measure cold, warm, compile, copy, boundary, allocation, and resource costs.
5. Re-run the authentic workload and neighboring cases.
6. Regenerate the dashboard and profile.
7. Let the receipt validator decide accepted, rejected, or inconclusive.

### Prohibited shortcuts

Codex must not:

- add an application- or function-named backend rule;
- optimize only the dossier witness;
- report a microbenchmark speedup as application improvement;
- convert an unsupported operation into silent generic work inside an alleged
  optimized region;
- trust annotations without runtime authentication;
- treat a profiler sample as proof of aliasing, range, purity, or ownership;
- omit losing target candidates;
- widen a pass merely to increase the dashboard selected count; or
- modify the benchmark after seeing an unfavorable result without recording
  the original result.

## Phased implementation

Each phase has an exit gate. Later phases do not begin merely because code has
been written.

### Phase 0 — Freeze evidence and identity contracts

Deliverables:

- workload, profile, overlay, dossier, campaign, and promotion schemas;
- source/region identity and predecessor rules;
- trust-boundary document for evaluator-owned telemetry;
- deterministic schema validators and malformed-receipt tests;
- positive, negative, and stale-identity fixtures; and
- exact ownership of shared registries and generated artifacts.

Exit gate:

- every fixture is accepted or rejected deterministically;
- evaluated code cannot counterfeit compiler/route fields; and
- the same clean checkout generates byte-identical identities.

### Phase 1 — Source-attributed profiling

Deliverables:

- Node sampling-profile collection;
- source-map/region-anchor mapping;
- phase and evaluator telemetry merge;
- unmatched/ambiguous sample reporting;
- instrumentation overhead benchmark; and
- exact workload receipt generation.

Exit gate:

- known hot control regions are attributed to the correct source ranges;
- an intentionally shifted/stale source map fails closed;
- total attributed plus unmatched samples equals the original profile; and
- instrumentation overhead is below a reviewed bound or explicitly corrected.

### Phase 2 — Hotness overlay and dossier generation

Deliverables:

- deterministic dashboard/profile join;
- transparent ranking components;
- opportunity classification;
- human and JSON query output;
- dossier generation; and
- dossier tests covering selected, rejected, unrecognized, cold, stale, and
  ambiguous regions.

Exit gate:

- a known optimized control is reported as selected and hot;
- a known cold near miss is not promoted over a measured hotspot;
- the known slow generated-JavaScript class-group candidate remains negative
  evidence; and
- two independent agents given the same dossier identify the same proof and
  acceptance obligations, even if they propose different implementations.

### Phase 3 — Campaign automation and parallel boundaries

Deliverables:

- campaign manifest generator;
- `pnpm parallel:new` templates for evidence, proof, representation, target,
  verifier, and integration lanes;
- file-claim collision tests;
- central registration handoff format; and
- campaign status and evidence aggregation.

Exit gate:

- a synthetic campaign can be executed in parallel without shared-file edits;
- malformed or stale lane evidence cannot enter the promotion receipt; and
- integration can choose one target while preserving losing evidence.

### Phase 4 — Calibration campaign

Run the engine on existing understood cases without seeking new speed.

Required controls:

- the closed-ring or strict-float hot-loop control;
- one fixed-extension or modular-batch control;
- the packed-container fact provider, which must not appear as an executable
  route; and
- the class-group generated-JavaScript negative control.

Exit gate:

- profiles, static decisions, dossiers, and authenticated routes agree;
- the engine recommends no implementation for the already optimized controls;
- the packed fact provider is described as a missing consumer/lowering rather
  than a selected target; and
- the negative candidate is rejected on inclusive evidence.

### Phase 5 — First prospective optimization campaign

Profile the authentic class/unit-group corpus and one independent public
workload. Choose the top eligible opportunity from measured evidence.

The current static dashboard makes packed HNF loops a plausible candidate, but
the campaign must not force that conclusion. If resident HNF work has moved the
bottleneck, the profile chooses the next opportunity.

The implementation must:

- resolve a stable compiler reason or introduce a reusable missing domain;
- use no application-named recognition;
- apply to the motivating loop and at least one held-out source shape or
  independent consumer;
- retain exact fallback and independent verification;
- compare every plausible target inclusively; and
- preserve or improve neighboring workloads.

Exit gate:

- all semantic, adversarial, resource, and route tests pass;
- the authentic workload meets the pilot performance criterion below;
- the dashboard and profile show the resolved opportunity and remaining time;
- a promotion receipt validates independently; and
- the change is production-ready on every required platform.

### Phase 6 — Independent replication

Use the same engine on a workload from another mathematical area without
changing the schemas or ranking policy.

Good candidates include:

- packed polynomial evaluation;
- a dense/sparse matrix workflow;
- finite-field batch arithmetic;
- graph traversal with packed state; or
- strict binary64 array computation.

Exit gate:

- the second campaign reuses the infrastructure;
- it does not add workload-specific dashboard logic; and
- the first campaign's accepted route and performance remain within ratchets.

### Phase 7 — Scaled parallel program

Only after Phases 0–6 pass should multiple proof-family campaigns run at once.

Group work by reusable missing capability, for example:

- known-call and effect provenance;
- packed ownership and alias proofs;
- richer canonical iterators;
- transactional indexed output;
- nested fixed-shape loops;
- exact bounded integer/control-flow regions;
- resident Wasm storage and lifetime; and
- compiler/library coarse-boundary selection.

The program prioritizes clusters with several measured consumers rather than
opening one lane per dashboard row.

## Pilot performance criterion

The first prospective campaign is considered materially successful when one
of these reviewed conditions holds on the primary reference host:

1. at least a 10% median end-to-end improvement on an authentic workload, with
   exact output and a confidence interval or repeated-sample separation that
   excludes no change; or
2. at least a 2x reduction in a phase consuming at least 10% of the authentic
   workload, producing at least a 5% end-to-end improvement, and the same
   compiler feature improves at least two additional held-out consumers.

In both cases:

- neighboring corpus cases may not regress by more than the reviewed noise
  allowance without an explicit tradeoff decision;
- cold/startup/compiler/artifact budgets must pass;
- generic `O0` execution may not regress materially;
- browser-relevant routes must pass Chromium, Firefox, and WebKit; and
- losing targets and inconclusive measurements remain in the receipt.

These thresholds prove that the engine can create practical value. They are
not universal performance promises for later campaigns.

## Required test matrix

### Identity and security

- stale source, compiler, artifact, corpus, and workload identities;
- forged user output resembling telemetry;
- copied or mutated optimizer decisions;
- source-map ambiguity and unmatched samples;
- malformed counters and negative/overflowing quantities; and
- detached immutable snapshots.

### Profiling

- known hot/cold ordering;
- recursion and nested functions;
- inlined and non-inlined generated JavaScript;
- zero-trip and guard-fallback regions;
- sampling conservation;
- profiler on/off exact output; and
- measured observer overhead.

### Dossiers

- selected, rejected, and unrecognized loops;
- one-reason and multi-reason rejections;
- algorithmic and representation classifications;
- missing independent oracle;
- unavailable target;
- stale dashboard/profile join; and
- deterministic Markdown and JSON.

### Compiler campaign

- CPython, O0, and independent mathematical differentials;
- aliases, mutation, callbacks, shadowed builtins, exceptions, interrupts, and
  reset/recovery;
- exact range boundaries and representation overflow;
- malformed IR and target plans;
- route selection and guard failure;
- resource lifecycle and high-water marks;
- cold/warm/compile/size/boundary/copy measurements; and
- held-out source shapes and workloads.

### Platforms

- Node 22 minimum and the current release Node;
- Linux x64 and ARM64;
- native Windows x64 and macOS ARM64 when target-relevant;
- Chromium, Firefox, and WebKit for browser-relevant routes; and
- production artifact identity before browser claims.

## CI and ratchets

Fast routine checks should validate schemas, checked-in identity, generated
dashboard/dossier projections, and focused fixtures. Full profile regeneration
belongs in a separate deterministic workflow because sampling and authentic
workloads are more expensive.

Promotion CI must enforce:

- exact current input identities;
- selected pass, representation, target, and route;
- no missing fallback or unhandled operation;
- benchmark result equivalence;
- minimum performance/evidence thresholds;
- compiler and artifact size budgets;
- boundary/copy/resource ceilings;
- no unexpected new dashboard rejection for named witness regions; and
- no disappearance of the promoted region's `@optimize(require=...)`
  contract.

Do not ratchet the raw number of selected loops. That metric can be improved by
unsafe widening or useless cold optimizations. Ratchet named semantic regions,
proof obligations, representative workloads, and inclusive results.

## Initial implementation layout

Exact filenames remain an integration decision, but responsibilities should be
separated approximately as follows:

```text
architecture/
  optimizer-workloads.json
  optimizer-opportunities.manifest.json
  optimizer-campaigns/
  optimizer-promotion-receipts/

tools/python/optimizer/
  identity/
  telemetry/
  dossier/
  campaign/

scripts/
  optimizer-profile.cjs
  optimizer-opportunity-dashboard.cjs
  optimizer-dossier.cjs
  optimizer-campaign.cjs
  optimizer-promotion.cjs

bench/optimizer-workloads/
  manifests/
  corpora/
  oracles/

test/
  optimizer-profile-*.cjs
  optimizer-dossier-*.cjs
  optimizer-campaign-*.cjs
  optimizer-promotion-*.cjs
```

Target-neutral schemas and evidence logic must not import target emitters.
Verifiers recompute critical claims independently from transformation analyses.

## Risks and mitigations

### Profiling points at generated code rather than source

Require source maps and compiler region anchors. Preserve unmatched samples and
test inlining explicitly.

### Instrumentation changes the winner

Prefer sampling, measure profiler overhead, compare instrumented and
uninstrumented runs, and use ordinary uninstrumented promotion timings.

### Agents optimize the benchmark rather than the domain

Require held-out source shapes, independent workloads, generated adversarial
programs, and a ban on function/source-name recognition.

### A static near miss is mistaken for a hot opportunity

Require authenticated runtime evidence before campaign creation.

### A compiler project hides an algorithmic defect

Classify the bottleneck first and retain phase/operation counts. Compare mature
libraries and algorithm choices before lowering local arithmetic.

### A fast arithmetic target loses at representation boundaries

Use inclusive costs and keep data-residency, copy, materialization, and cleanup
visible.

### Parallel agents corrupt shared compiler contracts

Freeze versioned interfaces, use narrow worktree claims, centralize
registration, and reject stale receipts.

### Dashboard growth becomes unmanageable

Keep the static inventory normalized and deterministic, store bulky raw
profiles as content-addressed artifacts where appropriate, and check in only
reviewed projections and receipts needed for reproducibility.

### Browser profiling claims exceed available evidence

Use Node for initial fine-grained discovery. Label browser evidence by actual
capability and require browser correctness/route/inclusive validation without
pretending unsupported source-level sampling exists.

### A score creates false precision

Expose raw ranking dimensions, uncertainty, and eligibility decisions. Treat
priority as triage rather than compiler truth.

## Completion criteria

The compiler-development engine is proven to work only when all of the
following are true:

1. Versioned workload, profile, overlay, dossier, campaign, and promotion
   schemas are implemented and fail closed.
2. Node sampling and evaluator telemetry map known controls to exact current
   source/region identities with conserved unmatched samples.
3. The dashboard joins measured hotness without converting heuristics into
   compiler facts.
4. A query produces a complete deterministic dossier for any profiled region.
5. The engine correctly recognizes existing optimized controls.
6. It rejects the known class-group generated-JavaScript negative control.
7. It distinguishes at least one algorithmic bottleneck from a compiler
   opportunity.
8. It selects a first prospective campaign from measured evidence rather than
   a manually chosen source file.
9. That campaign adds a reusable, independently verified compiler capability
   with no application-named rule.
10. Exact CPython/O0/independent-oracle, adversarial, interruption, resource,
    and fallback tests pass.
11. The authentic workload satisfies the pilot performance criterion.
12. At least one held-out consumer benefits from the same capability.
13. A second mathematical area reuses the engine without schema changes.
14. Chromium, Firefox, and WebKit validate every browser-relevant promoted
    route against an authenticated production artifact.
15. The before/after dashboard and profiles show the resolved opportunity,
    remaining bottleneck, and absence of hidden cost transfer.
16. The complete promotion receipt validates from a clean checkout.
17. Parallel campaign generation can accelerate later proof families without
    shared-file collisions or unverifiable handoffs.

Until these criteria pass, the system is a promising profiler or dashboard,
not yet a proven compiler-development engine.

## Immediate first campaign sequence

1. Freeze the six data schemas and identity rules.
2. Add compiler source-map anchors for functions and optimizer regions.
3. Build the Node sampling/profile receipt path.
4. Calibrate observer overhead with known O0/O2 controls.
5. Join profiles to the dashboard materialized from
   `architecture/optimizer-opportunities.manifest.json`.
6. Generate dossiers for the existing control corpus.
7. Verify the class-group generated-JavaScript negative control is rejected.
8. Profile the complete cubic class/unit-group corpus and one independent
   polynomial or matrix workload.
9. Select the first prospective campaign mechanically from eligible measured
   opportunities.
10. Freeze its proof/representation/target interfaces and open parallel lanes.
11. Implement, verify, and compare all plausible targets.
12. Re-run authentic and neighboring workloads.
13. Generate and validate the promotion receipt.
14. Repeat in a second mathematical area.
15. Only then open the scaled parallel optimization program.
