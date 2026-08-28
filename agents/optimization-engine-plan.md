# Plan: an evidence-driven optimization engine for Sage.js

**Status:** proposed

**Date:** 2026-08-28

**Baseline:** `integrate/compiler-development-engine-campaign1` at or after
`d11a94f3`

**Broadens and eventually supersedes:**

- [`compiler-development-engine-plan.md`](compiler-development-engine-plan.md)

**Depends on:**

- [`../architecture/optimizer-development/CAMPAIGN-1.md`](../architecture/optimizer-development/CAMPAIGN-1.md)
- [`../architecture/optimizer-development/README.md`](../architecture/optimizer-development/README.md)
- [`optimizing-mathematics-compiler-rfc.md`](optimizing-mathematics-compiler-rfc.md)
- [`optimizing-mathematics-compiler-parallel-program.md`](optimizing-mathematics-compiler-parallel-program.md)
- [`../docs/optimizer-opportunities.md`](../docs/optimizer-opportunities.md)
- [`../ARCHITECTURE.md`](../ARCHITECTURE.md)
- [`../PARALLEL-DEVELOPMENT.md`](../PARALLEL-DEVELOPMENT.md)

## Executive decision

Build a Sage.js optimization engine, not an autonomous “make this code faster”
loop and not a system whose answer is assumed to be compiler work.

The engine starts from an authentic public computation, locates material cost,
constructs and audits competing interventions, selects at most one through
deterministic evidence gates, and then drives that intervention through
implementation and promotion. The available intervention categories are:

1. mathematical algorithm;
2. mature-library routing;
3. representation and ownership;
4. runtime architecture;
5. host/native/Wasm boundary design;
6. cache and preparation lifecycle;
7. ordinary source optimization; and
8. source-transparent compiler optimization.

The engine is valuable chiefly because it can reject attractive ideas. A
detached target that is 100 times faster but does not improve the complete
public call is a negative result. A clever compiler lowering that duplicates a
mature library is a routing finding. A hot function whose time is really in
serialization, allocation, or a caller boundary is not a function-local
optimization opportunity.

The engine's governing loop is:

```text
freeze one clean evidence epoch
        |
        v
run authentic public workloads
        |
        v
attribute and decompose material cost
        |
        v
construct competing interventions
        |
        v
semantic, architecture, and mature-capability audits
        |
        v
inclusive paired feasibility evidence
        |
        v
select one intervention, investigate further, or reject all
        |
        v
implement through narrow parallel lanes
        |
        v
public-boundary promotion and durable outcome record
```

The next proof of operation is one accepted non-compiler campaign and one
well-supported no-action or rejection outcome produced by the same machinery.
Campaign 2 should exercise mature-library routing. It must not begin production
implementation until the engine selects a current, authenticated opportunity.

## Campaign 1 establishes the baseline

Campaign 1 selected a compiler intervention for the fused rectangular
binary64 arrow-segment dataflow in
`src/lib/sagejs/plotting/field_layers.py:920-952`.

The selected pass is
`math.closed-transactional-rectangular-binary64-dataflow.v1`; its V8 lowering
is `v8.closed-transactional-rectangular-binary64-dataflow.v1`. The accepted
receipt is checked in at
[`../architecture/optimizer-development/evidence/campaign-1-arrow.json`](../architecture/optimizer-development/evidence/campaign-1-arrow.json).

The complete-public-call results were:

| Consumer | Baseline median | Candidate median | Speedup | Worst paired saving |
| --- | ---: | ---: | ---: | ---: |
| Representative vector field | 739.850 ms | 449.183 ms | 1.647x | 29.86% |
| Held-out slope field | 690.896 ms | 502.362 ms | 1.375x | 20.39% |

All 22 paired observations improved, exact outputs and trace digests matched,
and the compiler retained an untouched same-source fallback.

Campaign 1 also produced more important negative knowledge:

- isolated binary64 materialization improved dramatically but saved only about
  1.6% at the complete public boundary;
- a favorable clone benchmark was rejected when the clone baseline was slower
  than the real public entry point;
- cubic modular scans represented only about 2.5% of authenticated production
  ticks and duplicated mature FLINT factorization capability;
- a dense polynomial integral admitted fast handwritten V8 and Wasm targets,
  but a lawful decomposition of the mature FLINT integral was faster;
- strict-float construction candidates were correctly rejected as cold or
  below 1% of public time;
- source sampling was initially dominated by profile preparation and compiler
  work, requiring warm preparation and a sealed authenticated module closure;
- V8 inlining moved source ticks to callers, so absence of callee samples could
  not prove non-execution; and
- compiler options, implementation identity, source identity, generated
  artifacts, and evidence authority required distinct, exact joins.

These findings are not failed work. They are the reason the optimization engine
must retain negative evidence and compare categories before editing production
code.

## What exists now

The repository already has most of the difficult integrity foundation:

- authentic workload and workload-catalog schemas;
- content-addressed compiler, source-bundle, source-unit, function, region,
  decision, artifact, and evidence identities;
- warm prepared/sealed source profiling with explicit unmatched and ambiguous
  channels;
- exact runtime-route telemetry with guarded fast, fallback, zero-trip, error,
  and incomplete outcomes;
- a complete static compiler-opportunity census;
- sparse source-region overlays;
- detached dossiers and deterministic campaign task projection;
- paired performance evidence with conservative lower bounds;
- promotion validation bound to a clean checkout, build, artifact, workload,
  routes, resources, platforms, and browsers; and
- a reviewed `intervention` object carried through opportunity, overlay,
  dossier, campaign, and promotion documents.

The intervention vocabulary already distinguishes `algorithm`,
`library-route`, `representation`, `runtime`, `boundary`, `cache`, `source`,
and `compiler`. Classification no longer silently creates a compiler campaign.

The remaining limitation is structural: several live version-one documents
still make a compiler dashboard, compiler identity, and exact source region
mandatory even when the proposed change is a cache policy, runtime primitive,
public algorithm, or foreign boundary. Generalization must correct that model,
not merely permit additional strings in an enum.

## Definition of success

The optimization engine is operational when all of the following are true:

1. An opportunity may be identified at a public call, reviewed phase, source
   region, runtime component, representation lifetime, foreign boundary, cache
   lifecycle, or algorithmic operation.
2. Observed cost classification and proposed intervention are independent
   fields with independent evidence.
3. At least two materially different intervention categories can be compared
   for one opportunity without inventing compiler identities for either.
4. Every category has deterministic, category-specific semantic, architecture,
   fallback, cost, and promotion requirements.
5. One frozen clean-build evidence epoch can be consumed read-only by many
   parallel audit lanes without each lane rebuilding or redefining identity.
6. The system can conclude `select`, `investigate`, `reject`, or `already
   optimized`; it is not forced to generate a patch.
7. One non-compiler intervention passes complete-public promotion, and one
   superficially attractive candidate is durably rejected.
8. Every accepted change has exact output oracles, inclusive cost accounting,
   a tested rollback or fallback, held-out evidence, and a current-build
   content-addressed outcome.
9. A clean checkout can reproduce the outcome from checked-in workload and
   protocol definitions.
10. No model or agent assertion becomes semantic or promotion authority.

## Normative principles

### Optimize behavior, not syntax

The primary subject is a public behavior or reviewed system boundary. Source
regions are one form of evidence and one possible implementation scope. They
are not the universal identity of an optimization.

### Generate hypotheses broadly; grant authority narrowly

Agents may understand an algorithm, recognize a representation bottleneck,
locate a library routine, or propose a transformation. That breadth is a
hypothesis advantage. It is not permission to edit production code. Only
versioned validators, reviewed workload contracts, exact oracles, and trusted
integration runs can admit an opportunity or promote a result.

### Search mature capabilities before creating new machinery

Every algorithm, compiler, native, or Wasm proposal must audit existing Sage.js
source, declared FFI, production native kernels, production Wasm, and mature
external libraries. “The current public route does not call it” is not evidence
that the mature algorithm is unavailable.

### Include all transferred cost

Measurement includes preparation, validation, normalization, compilation,
loading, copying, boundary crossings, allocation, publication, cleanup, and
public result construction whenever they lie inside the proposed boundary.
Moving work outside a timer does not remove it.

### Preserve source and mathematical semantics

- Mathematical `.py` files remain ordinary CPython-parseable Python.
- Sage and Python modes remain distinct where intended.
- Exact outputs, errors, interruption, evaluation order, aliasing, mutation,
  identity, and partial-publication behavior are part of semantics.
- A failed optimized precondition returns to a reviewed untouched fallback or
  performs a reviewed rollback before visible candidate effects.

### Negative evidence compounds

Rejected candidates, unavailable routes, crossover losses, stale profiles,
ambiguous attribution, and mature-duplication findings remain addressable
records. Later campaigns query them before repeating work.

### Prefer simple production architecture

A slightly slower intervention may win if it avoids a new foreign runtime,
large artifact, unstable dependency, platform gap, or maintenance burden while
still clearing the performance threshold. Such tradeoffs must be expressed as
hard gates and lexicographic dimensions, never as an opaque weighted score.

## Explicit non-goals

The optimization engine will not:

- repeatedly ask an agent to “make this faster” until tests happen to pass;
- optimize every function, loop, or dashboard near miss;
- accept a detached microbenchmark as public performance proof;
- assume the compiler, V8, native code, Wasm, or a library is preferable;
- select implementations by Python function name;
- use profiler sample absence as proof that code did not execute;
- synthesize source attribution from caller ticks without engine-authenticated
  inline-stack evidence;
- hide unmatched samples, failed experiments, or slower targets;
- permit the proposal author to define an unreviewed acceptance boundary;
- merge generated patches automatically;
- run stochastic autotuning during ordinary user evaluation;
- weaken Windows x64 or browser support to win a local benchmark;
- duplicate a mature mathematical algorithm without a documented reason; or
- treat more generated code as an intrinsically successful outcome.

## Core model: epoch, subject, observation, intervention, outcome

The generalized engine should organize evidence around five independent
concepts.

### 1. Evidence epoch

An epoch freezes:

- exact Git commit and tree;
- clean-state assertion;
- repository source closure;
- build receipt and output manifest;
- compiler implementation and option identities where applicable;
- workload-catalog identity;
- runtime, engine, operating system, architecture, and capabilities;
- native and Wasm artifact identities;
- profiler protocol and calibration; and
- reason-registry and schema identities.

Every discovery lane consumes the epoch read-only. A source edit closes the
epoch. Evidence from different epochs may be retained historically but cannot
silently join.

### 2. Optimization subject

The version-two subject replaces the assumption that every opportunity is one
compiler loop. It has a content-addressed identity and one of these scopes:

| Scope | Examples |
| --- | --- |
| `public-call` | `Polynomial.integral`, `local_reduction`, plot lowering |
| `reviewed-phase` | factor base, normalization, serialization, HNF verification |
| `source-region` | a fused loop, comprehension, or function body |
| `runtime-component` | callable resolution, strict-float unboxing, JSON materialization |
| `representation-lifetime` | packed records from creation through last consumer |
| `foreign-boundary` | 94 per-prime calls versus one batched FLINT call |
| `cache-lifecycle` | module compile, publish, load, invalidate, and prune |
| `algorithmic-operation` | factorization, integration, rank, point count |

A subject may cite nested or causal child subjects. Containment, identity, and
cost conservation are validated. A child measurement cannot claim the entire
parent boundary.

### 3. Observation

An observation says what happened without proposing a fix. Channels include:

- complete wall time and paired distributions;
- phase time and public share;
- authenticated source ticks and function samples;
- runtime routes and guard outcomes;
- call and boundary counts;
- copied bytes and materializations;
- allocations, live resources, and high-water marks;
- compile, instantiate, load, preparation, and cache times;
- exact output and exception evidence; and
- explicit unmatched, ambiguous, stale, or unavailable evidence.

Channels conserve independently. A call counter proves execution count, not
inclusive time. A source sample proves a mapped location, not an algorithmic
cause. A phase timer proves inclusive phase cost, not a specific child region.

### 4. Intervention

An intervention states the proposed mechanism, owner, changed components,
source relationship, evidence boundary, rollback or fallback, expected cost
transfer, and category-specific obligations. It does not inherit authority from
the subject's classification.

### 5. Outcome

An outcome records one of:

- `accepted` — implemented and promoted under the reviewed boundary;
- `rejected` — evidence disproves materiality, correctness, architecture, or
  target value;
- `investigate` — potentially material but required authority is missing;
- `already-optimized` — the current route already satisfies the opportunity;
- `superseded` — a later intervention dominates the recorded proposal; or
- `historical` — exact evidence from an earlier epoch retained for memory.

Every terminal outcome remains queryable by workload, subject, category,
mechanism, source, library capability, and rejection reason.

## Intervention-specific contracts

Shared gates apply to every category, followed by category-specific gates.

### Algorithm

Required evidence:

- a mathematical specification independent of the candidate implementation;
- proof or exhaustive bounded argument for the claimed domain;
- independent oracle and adversarial corpus;
- complexity and crossover analysis;
- explicit proof that no mature equivalent already satisfies the boundary;
- exact failure, proof-mode, and resource-cap behavior; and
- generality beyond one hand-picked input.

Algorithm work may change source structure substantially. Its fallback is the
current correct algorithm or a reviewed domain split.

### Mature-library route

Required evidence:

- exact library capability, version, artifact, declaration, and availability;
- semantic mapping between Sage.js inputs/results and the library operation;
- all conversion, copying, crossing, allocation, cleanup, and materialization
  costs;
- error, interruption, isolation, and partial-publication behavior;
- platform and browser capability matrix;
- guarded fallback when the library domain is incomplete; and
- comparison with batching or residency when per-call crossings dominate.

The engine must prefer routing to a lawful mature implementation over creating
a duplicate compiler or handwritten target.

### Representation

Required evidence:

- exact ownership, aliasing, mutation, lifetime, and escape analysis;
- observability audit for identity, hashing, representation, caches, and
  callbacks;
- complete construction-to-last-consumer scope;
- transactional publication and cleanup;
- memory high-water and retained-size accounting;
- no accidental duplicate live representation; and
- held-out consumers of the same representation contract.

### Runtime

Required evidence:

- precise affected runtime primitive or dispatch path;
- global semantic reach and compatibility audit;
- adversarial callbacks, descriptors, proxies, exceptions, and interruption;
- cold/warm and common/rare path distributions;
- code-size, startup, and memory budgets; and
- independent workloads proving the change is not application-specific.

### Boundary

Required evidence:

- before/after crossing counts and payload bytes;
- ownership, lifetime, residency, and cleanup;
- synchronous interruption or worker-replacement policy;
- batching and copy crossover measurements;
- native, Wasm, browser, and Windows behavior; and
- exact public rematerialization cost.

### Cache

Required evidence:

- complete cache key and source-closure identity;
- atomic publication and corruption recovery;
- invalidation under source, compiler, ABI, engine, platform, and option
  changes;
- poisoning and cross-worktree isolation tests;
- cold miss, warm hit, churn, size, and cleanup accounting; and
- behavior when caching is unavailable or disabled.

### Source

Required evidence:

- ordinary CPython-parseable replacement source;
- direct differential against the prior source;
- explanation of algorithm, representation, or effect-order preservation;
- readability and maintenance review;
- public and held-out inclusive performance; and
- no hidden dependence on Sage.js-only syntax in strict mathematical modules.

### Compiler

Required evidence remains the strict Campaign 1 contract:

- structural, application-independent recognition;
- complete current optimizer IR and one exact decision;
- independently verified facts and invalidations;
- source-transparent target lowering;
- authenticated runtime intrinsics and preflight;
- untouched same-source fallback;
- exact route telemetry and O0/O2 differential;
- compile latency and emitted-size budgets; and
- at least one independent source consumer or held-out public behavior.

Only compiler interventions may cite compiler route selection as their causal
mechanism. Other categories may use the compiler as infrastructure but cannot
claim a compiler campaign.

## Candidate comparison and selection

Selection has hard gates followed by lexicographic comparison. There is no
weighted score.

### Hard gates

A selectable candidate must have:

1. current-epoch identities;
2. exact public output or reviewed exception equivalence;
3. explicit fallback or rollback;
4. a complete cost boundary;
5. all required mature-capability audits;
6. no unresolved high-severity semantic obligation;
7. no unsupported required platform without a correct capability fallback;
8. positive separation in at least 11 deterministic paired observations;
9. at least 10% complete-public improvement in the worst observed pair, or a
   separately approved phase rule that still proves material public gain; and
10. retained negative and losing-candidate evidence.

The engine may tighten these gates as evidence quality improves. It must not
weaken them per candidate.

### Lexicographic dimensions

Candidates that pass hard gates are compared in this order:

1. exactness and semantic confidence;
2. conservative complete-public wall-time removal;
3. number and independence of affected public workloads;
4. reuse of existing mature, reviewed components;
5. portability and capability coverage;
6. rollback simplicity;
7. reduction in crossings, copies, allocations, or retained resources;
8. implementation and maintenance surface;
9. compilation, startup, artifact-size, and cache cost; and
10. stable deterministic identity as a tie breaker.

The selection record must show each dimension. It cannot collapse them into a
single unexplained number.

## System architecture

### A. Epoch and build service

Create one integration-owned service or script that:

- commits or verifies the exact clean evidence base;
- performs one current build;
- publishes a read-only epoch manifest and artifact locations;
- verifies source, compiler, native, Wasm, and workload identities;
- provides scratch output directories per lane;
- rejects evidence after any tracked source change; and
- reports when a new epoch is required.

Parallel lanes must consume this service instead of independently mutating the
shared checkout or repeatedly running broad builds. A lane may run focused
tests in its worktree, but authentic campaign evidence refers to the frozen
integration epoch.

### B. Workload and oracle catalog

Extend the catalog to describe:

- public entry and complete output boundary;
- representative versus held-out role;
- independent corpus and oracle provenance;
- named phases with non-overlapping timing rules;
- proof, correctness, failure, and resource modes;
- expected cold/warm preparation;
- platform and browser requirements;
- allowed instrumentation;
- evidence epoch and source closure; and
- minimum materiality and repetition policy.

Microbenchmarks remain useful controls but cannot promote a production change.

### C. Observation collectors

Provide collectors for:

- inclusive public/phase timers;
- warm sealed Node CPU profiles;
- runtime route events;
- library/native/Wasm boundary counters;
- copied bytes and result materialization;
- allocation and resource lifetime;
- cache hit/miss/publication/invalidation;
- compiler decision and emitted target evidence; and
- platform/browser execution receipts.

Each collector states what it can and cannot prove. Browser evidence remains
route/correctness/resource/inclusive unless a browser-specific source profiler
is independently authenticated.

### D. Opportunity ledger

Replace transient ranked lists with a content-addressed ledger containing:

- subject and parent/child identities;
- current and historical observations;
- classification hypotheses;
- proposed interventions;
- mature-capability results;
- feasibility and losing candidates;
- unresolved obligations;
- terminal outcomes; and
- predecessor links across source epochs.

The ledger must answer queries such as:

- Which public operations have at least 10% removable wall time?
- Which compiler-looking candidates were rejected by mature libraries?
- Which boundary candidates need batching rather than a faster kernel?
- Which opportunities are blocked only by Windows or browser evidence?
- Which earlier experiments already disproved this mechanism?

### E. Intervention auditors

Implement category-specific adapters that consume observations and emit
reviewable interventions. The initial adapters are deterministic rule sets and
human/agent-authored evidence, not opaque learned rankings.

Every intervention auditor must provide:

- why this category fits better than the alternatives;
- changed components and ownership;
- exact semantic obligations;
- complete measurement boundary;
- fallback or rollback;
- expected cost movement;
- mature-capability disposition;
- target and platform obligations; and
- conditions that would reject the proposal.

### F. Dossier and campaign planner

The dossier is intervention-neutral. Compiler dossiers contain detached IR;
library dossiers contain capability and conversion plans; representation
dossiers contain ownership/lifetime graphs; cache dossiers contain key and
state-transition plans; algorithm dossiers contain mathematical specifications.

Campaign projection derives lane architecture from the reviewed intervention.
It never defaults every campaign to compiler infrastructure.

### G. Promotion authority

Promotion independently recomputes:

- evidence identities and current checkout/build bindings;
- output and exception equivalence;
- paired statistics and conservative threshold;
- public/phase containment and causal scope;
- category-specific route or rollback evidence;
- resources, neighboring regressions, and losing candidates;
- platform and browser authorities; and
- current ledger and dashboard deltas.

Campaign acceptance and universal release deployment remain distinct. A local
current-build campaign can be accepted while a universal deployment receipt
remains pending required external platforms or browsers.

### H. Durable optimization memory

Every campaign checks in a concise outcome document and the smallest complete
machine evidence needed to reproduce its decision. Large raw traces may live in
content-addressed external storage, but their digest, producer command, epoch,
and validation status are checked in.

Outcomes must survive source relocation and distinguish:

- still current;
- semantically predecessor-compatible;
- historically informative but stale; and
- invalid because producer provenance is missing.

## Version-two document boundaries

The current version-one contracts proved the pipeline but remain partly
compiler-shaped. Before Campaign 2 implementation, define these generalized
boundaries:

1. `sagejs.optimization-epoch/v2`
2. `sagejs.optimization-workload/v2`
3. `sagejs.optimization-observation/v2`
4. `sagejs.optimization-subject/v2`
5. `sagejs.optimization-opportunity/v2`
6. `sagejs.optimization-intervention/v2`
7. `sagejs.optimization-dossier/v2`
8. `sagejs.optimization-campaign/v2`
9. `sagejs.optimization-promotion/v2`
10. `sagejs.optimization-outcome/v2`

The project has no external compatibility burden. Correct the live model
directly rather than maintaining aliases for accidental compiler-first names.
Campaign 1's version-one evidence remains a frozen historical artifact and
test fixture. New producers emit version two only after the cutover.

All documents retain:

- exact keys and fail-closed unknown versions;
- canonical JSON and content identity;
- explicit authority;
- sorted deterministic collections;
- current/historical binding state;
- validated-input sets at trust boundaries; and
- no executable code embedded as evidence authority.

## Parallel execution model

The engine should use a fan-out/funnel topology.

### Discovery fan-out

Read-only lanes may independently own:

- workload execution and phase decomposition;
- source/runtime attribution;
- mathematical and algorithm audit;
- mature-library and existing-capability audit;
- representation and ownership audit;
- runtime/cache/boundary audit;
- V8/native/Wasm feasibility; and
- held-out and adversarial corpus discovery.

These lanes share an epoch and do not edit production sources.

### Evidence funnel

One adjudication lane:

- validates all receipts;
- resolves subject identity and scope;
- compares categories;
- rejects counterfeit or incomparable evidence;
- constructs the opportunity and dossier; and
- recommends one intervention or no action.

The adjudicator does not implement the selected change.

### Implementation fan-out

Only after selection, narrow lanes may own:

- semantic proof or specification;
- category-specific implementation;
- independent verifier and differential corpus;
- representative and held-out workloads;
- target/platform evidence; and
- integration.

One integration lane alone owns shared schemas, registries, package scripts,
catalog ordering, production artifact generation, and promotion policy.

### Final funnel

The trusted integration lane:

- builds the exact candidate commit;
- reruns public and adversarial evidence;
- verifies generated inventories;
- collects required external platform/browser receipts;
- recomputes the promotion decision; and
- records the outcome.

### Scheduling rules learned from Campaign 1

- Freeze shared identity/schema changes before evidence collection.
- Do not let each audit lane run a full build.
- Stop redundant builds once one epoch build is current.
- Never use the mutable shared checkout as a lane worktree.
- Treat dashboard regeneration as an integration action.
- Assign shared helper ownership before dependent receipts are generated.
- Do not mark a lane `review` when its required evidence can only pass after
  integration.
- Allow rejection lanes to finish early without manufacturing target work.
- Preserve scratch evidence with producer commands and digests before a lane
  exits.

## Campaign 2: mature-capability routing calibration

### Objective

Prove that the generalized engine can select, implement, and promote a
non-compiler intervention. The intended category under test is
`library-route`, but the adjudicator may reject all candidates or reclassify a
subject if current evidence demands it.

No production implementation lane opens until selection is complete.

### Current shortlist

The following numbers are discovery evidence from earlier epochs. They justify
fresh evaluation; they are not current promotion authority.

#### A. Dense prime-field polynomial integration

- Public operation: dense integral over `GF(65537)` with degree 69,999 and the
  singular-denominator coefficient exactly zero.
- Earlier generic public phase: about 1.9 seconds and roughly 60% of the
  complete public computation.
- Existing mature route: split at the characteristic hole and call production
  FLINT integration on the legal blocks.
- Earlier inclusive FLINT result: about 2.32–2.40 ms with preflight and host
  result materialization.
- Critical semantics: every nonzero coefficient at a denominator divisible by
  the characteristic must follow the current exact failure; block placement,
  derivative replay, allocation, and untouched fallback are mandatory.

This is the expected leading candidate because it is both public and materially
dominant, but it is not preselected.

#### B. Cubic finite-field factorization

- Public phase: 94 prime factorizations for the cubic `x^3 - 1009`.
- Earlier specialized Python median: about 321.8 ms.
- Earlier inclusive per-prime FLINT median: about 19.4 ms; resident workspace
  about 16.2 ms.
- Critical question: the phase is large, but complete class-number wall share
  may remain below the campaign threshold. A one-crossing batch adapter must be
  compared with the current complete public computation.

This candidate is expected to demonstrate that a fast phase can still be
rejected as immaterial end to end.

#### C. Hyperelliptic normalization through smalljac

- Public operation: semistable nodal local reduction for reciprocal quartic
  normalization data.
- Existing mature route: map to an elliptic cubic, then use the declared
  smalljac point-count capability.
- Earlier complete normalization comparison: about 651.5 ms generic versus
  64.9 ms mature route.
- Critical semantics: exact transformation and Euler-factor reconstruction,
  supported-prime/domain guards, no partial publication, and the lack of an
  intra-call cooperative interrupt hook.

This candidate tests whether a faster mature route is acceptable when its
interruption model is weaker and may require a bounded-call or worker-isolation
policy.

### Campaign 2 discovery lanes

Use one frozen epoch and these narrow read-only lanes:

1. `opt2-epoch-workloads` — current workload contracts, clean build, exact
   public baselines, and independent oracles.
2. `opt2-integral-library` — lawful FLINT block decomposition, singular cases,
   conversion/resource accounting, and held-out characteristics.
3. `opt2-cubic-library` — batched versus per-prime FLINT, full class-number
   materiality, and native/Wasm boundary comparison.
4. `opt2-hyper-library` — smalljac transformation, interruption policy,
   platform capability, and public local-reduction evidence.
5. `opt2-alternative-audit` — compiler, source, algorithm, representation,
   and boundary alternatives plus mature-duplication disposition.
6. `opt2-semantics` — independent exception, evaluation-order, rollback, and
   mathematical audit across all three.
7. `opt2-adjudication` — validate evidence and select one or reject all.

Only the adjudication lane may create the approved Campaign 2 dossier.

### Campaign 2 selection gates

The selected opportunity must:

- use an exact current public workload and independent oracle;
- show at least 10% complete-public improvement in every one of 11 paired
  observations for representative and held-out corpora;
- identify the exact mature library capability and production artifact;
- include all conversions, crossings, copying, allocation, and result
  construction;
- preserve current exceptions and proof-mode behavior;
- provide a guarded source fallback;
- pass resource and cleanup checks;
- retain compiler/V8/Wasm/native alternatives as measured or unavailable
  evidence; and
- demonstrate a correct Windows and browser fallback even if the library route
  is host-only.

If none passes, Campaign 2 ends with an accepted `reject-all` outcome. That is a
successful engine result, not permission to lower the gate.

### Campaign 2 implementation lanes

Create these only after selection:

- one source/library adapter lane;
- one independent oracle and adversarial lane;
- one resource/interruption/fallback lane;
- one held-out workload and crossover lane;
- one platform/browser capability lane; and
- one integration/promotion lane.

The selected production source remains ordinary Python. New handwritten C is
not expected; existing declared library capabilities and generated FFI should
be reused.

## Campaigns after Campaign 2

### Campaign 3: representation, runtime, or source

Deliberately select from opportunities not naturally solved by a library or
compiler. Likely classes include repeated serialization, ownership across a
closed consumer region, runtime dispatch/coercion, or an algorithmic data
structure defect. The ledger—not this plan—chooses the exact subject.

Required proof of generality is one accepted candidate and one rejected
microkernel whose isolated gain disappears at the public boundary.

### Campaign 4: cache or boundary

Exercise a stateful lifecycle subject: module cache, native artifact cache,
prepared evaluator closure, or batched FFI boundary. The core evidence is a
state-transition trace with invalidation, poisoning, cleanup, and cold/warm
costs, not a source-loop profile.

### Later compiler campaigns

Return to compiler work only when the ledger identifies a reusable structural
capability that survives mature-library and public-materiality audits. The
compiler remains an important intervention, but it does not receive a reserved
campaign slot.

## Milestones

### Milestone 0 — freeze Campaign 1

Already complete:

- accepted clean-build evidence checked in;
- selected dashboard decision regenerated;
- compiler, architecture, focused engine, and merge checks green; and
- generalized intervention vocabulary carried through the version-one flow.

### Milestone 1 — generalized subject and epoch contracts

Deliver:

- version-two epoch and subject schemas;
- public-call, phase, runtime, representation, boundary, cache, algorithm, and
  source-region identities;
- exact parent/child containment and causal citation rules;
- direct correction of compiler-first live names and required fields; and
- conversion of current workload and observation producers.

Acceptance:

- a cache opportunity validates without a fake compiler decision;
- a library opportunity validates without a fake source loop;
- a compiler opportunity retains all Campaign 1 strictness; and
- counterfeit cross-scope evidence fails closed.

### Milestone 2 — shared epoch/build service and evidence store

Deliver:

- one-command epoch creation and verification;
- read-only manifest consumption by lane worktrees;
- content-addressed scratch evidence index;
- automatic stale-epoch rejection; and
- dashboard/profile/workload identity equality checks.

Acceptance:

- at least five audit lanes consume one build without rebuilding;
- any tracked source edit invalidates subsequent evidence; and
- evidence remains reproducible after checkout relocation.

### Milestone 3 — category-specific auditors and dossiers

Deliver deterministic validators and dossier projections for all eight
categories.

Acceptance:

- each category has one positive fixture and at least two counterfeit or
  missing-obligation fixtures;
- classification cannot select an action;
- non-compiler dossiers cannot contain compiler IR or route claims; and
- mature-library availability rejects duplicate algorithm/compiler proposals.

### Milestone 4 — Campaign 2 discovery and adjudication

Deliver current evidence for the three mature-route subjects, alternatives,
and one selected or reject-all outcome.

Acceptance:

- all measurements share one epoch;
- all public outputs and errors are exact;
- all candidates include complete boundary costs; and
- the adjudicator's decision is independently reproducible.

### Milestone 5 — Campaign 2 implementation and promotion

Deliver one non-compiler production change if and only if Milestone 4 selects
it.

Acceptance:

- complete representative and held-out public calls clear policy;
- rollback/fallback and resource evidence pass;
- compiler and architecture suites remain green;
- required platforms or explicit capability fallbacks pass; and
- the outcome and negative alternatives are checked in.

### Milestone 6 — continuous optimization memory

Deliver query and reporting tools that make previous results reusable during
ordinary development and future campaigns.

Acceptance:

- a proposed mechanism is automatically linked to prior negative evidence;
- stale evidence is visible but never actionable;
- accepted outcomes show source descendants and regression state; and
- CI can detect when an accepted opportunity or fallback disappears.

## Required validation

Foundation and schema changes must run:

```sh
pnpm build
pnpm test:compiler
pnpm architecture:check
pnpm merge:check
```

They also run focused tests for:

- canonical identity and schema closure;
- epoch invalidation and relocation;
- observation channel conservation;
- subject containment and causal scope;
- every intervention category;
- dossier and campaign projection;
- paired statistics and promotion recomputation;
- counterfeit evidence and unknown fields; and
- Campaign 1 historical receipt validation.

Each campaign additionally runs its exact public workloads, independent
oracles, adversarial corpus, resource checks, and required target/platform
matrix. Long validation receipts must refer to the current candidate commit,
not an earlier lane build.

## Risks and controls

### Endless plausible optimization generation

**Risk:** broad code understanding produces an unlimited stream of clever
patches.

**Control:** no implementation before material public evidence, alternative
audit, and approved dossier; strict campaign concurrency and stop rules.

### Benchmark gaming

**Risk:** work moves outside the timer or a cloned baseline becomes slower than
the real public path.

**Control:** reviewed complete-public boundaries, source-derived arms, exact
output digests, ABBA pairs, and direct comparison with the actual public entry.

### Profiler overclaim

**Risk:** inlining, preparation, unmatched runtime helpers, or stale source maps
misattribute cost.

**Control:** independent channels, warm sealed closure, explicit unmatched
counts, direct phase timers, and no inferred inline attribution.

### Mature-algorithm duplication

**Risk:** a fast compiler/native prototype recreates an existing library
operation less completely.

**Control:** mandatory capability audit before selection and a distinct
`library-route` category.

### Parallel identity churn

**Risk:** schema and source changes make expensive evidence stale across many
lanes.

**Control:** frozen epochs, shared helper ownership, read-only audit waves, and
one integration cutover.

### Shared-build contention

**Risk:** agents repeatedly rebuild or corrupt a shared cache.

**Control:** one epoch build, per-lane scratch/cache namespaces, and an
integration-owned artifact manifest.

### Optimization complexity debt

**Risk:** accepted speedups add disproportionate code, dependencies, or
platform burden.

**Control:** architecture and maintenance surface are lexicographic selection
dimensions and hard budgets, not post-hoc concerns.

### Category laundering

**Risk:** a proposal changes category to avoid stricter compiler, algorithm, or
library obligations.

**Control:** category-specific validators inspect the actual changed components
and causal mechanism; promotion binds the same intervention from opportunity
through outcome.

## Immediate next actions

1. Approve this plan as the successor framing for performance campaigns.
2. Define the version-two epoch, subject, observation, intervention, and
   outcome schemas before adding more production optimization code.
3. Build the integration-owned epoch/build manifest command.
4. Add category-specific positive and counterfeit fixtures.
5. Freeze one clean Campaign 2 discovery epoch.
6. Recreate the three mature-library shortlist measurements against that epoch.
7. Run independent semantic, capability, and alternative audits in parallel.
8. Produce one adjudicated selection or reject-all outcome.
9. Open implementation lanes only for the selected intervention.
10. Promote at the complete public boundary and check in the outcome.

## Final perspective

The optimization engine should behave less like an optimizer and more like a
scientific institution for performance work. Its distinctive advantage is the
ability to understand code and mathematics across the whole system, generate
strong hypotheses, and investigate them in parallel. Its discipline is that
none of those hypotheses becomes truth merely because it is plausible or
fast in isolation.

Campaign 1 showed that this combination can work: many attractive ideas were
rejected, one general compiler intervention survived, and its public effect was
large and reproducible. The next step is to prove that the same machinery can
choose a mature library, a source change, a representation, a runtime change,
or no change at all with equal honesty.
