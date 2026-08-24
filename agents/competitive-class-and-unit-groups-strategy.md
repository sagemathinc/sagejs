# Strategy for a competitive fourth class-and-unit-group implementation

## Purpose

This document is the execution strategy for turning Sage.js's number-field
class- and unit-group work into a fourth serious general implementation,
competitive with PARI, Magma, and Oscar/Hecke.

It complements the existing
[`number-field-class-and-unit-groups-plan.md`][class-unit-plan].
That plan specifies the mathematics, proof semantics, APIs, and algorithmic
work packages. This strategy specifies how to finish the project: what
"competitive" means, how measurements govern work, which representations and
kernels must mature, how machines and parallel agents are allocated, and what
evidence is required at each milestone.

This is not a plan to wrap PARI, launch Julia, or hide an unrelated native
implementation behind the Sage.js API. The result remains a Sage.js algorithm:

- readable ordinary Python owns policy and the exact fallback;
- measured source-transparent kernels provide native and WebAssembly speed;
- FLINT, GMP, and Arb provide mature arithmetic primitives;
- every class-group relation and every unit is exact;
- conditional and unconditional completeness remain visibly distinct;
- detached proof replay remains independent of live producer caches.

The project is ambitious, but the recent work has removed the main uncertainty.
The algorithms produce correct general results, exact proofs, maps, units, and
regulators. The remaining question is not whether the architecture can compute
them. It is whether repeated representation, orchestration, and arithmetic
costs can be driven down systematically. The measured movement from tens of
seconds to tens or hundreds of milliseconds on small cubics shows that they
can.

## Current position

At the time this strategy was written, Sage.js has:

- specialized real and imaginary quadratic class-group infrastructure;
- a general Buchmann--Hecke-style class-and-unit engine;
- exact factor-base construction under Minkowski and named GRH bounds;
- exact relation records with principal witnesses;
- sparse relation collection, exact HNF/SNF presentations, and class maps;
- factored units, rigorous regulators, analytic `h*R` bounds, and saturation;
- resumable unconditional proof streams;
- authenticated live computation contexts and independent detached replay;
- source-transparent native kernels with dynamic and WebAssembly fallbacks;
- exact live examples through degree 10;
- a pinned LMFDB cubic performance corpus.

The current warm, prepared-field cubic corpus is correct but not yet
competitive. Its measured Sage.js times are roughly 33--228 ms versus
1.5--3.2 ms through Sage/PARI, with a geometric-mean slowdown around 53x and a
22--82x range. The two motivating cubics are much better than their original
first-process timings, but PARI still has a decisive lead. Degree 6--10 examples
currently take minutes, and cold module/runtime initialization remains a
separate large cost.

This establishes the starting point:

1. correctness and generality are real;
2. small-field hot computation is within one to two orders of magnitude;
3. cold startup and higher-degree relation search are not competitive;
4. exact object construction, redundant replay, and representation conversion
   often cost more than the underlying number theory;
5. no single heroic rewrite will close the gap.

## Definition of competitive

"Competitive" must be a measured statement about a named workload, not a
feeling derived from one favorable example.

### Semantic parity

Comparisons use equivalent requests:

- scalar class number versus scalar class number;
- class-group invariants versus class-group invariants;
- full generators and maps versus full generators and maps;
- unit generators and regulator versus the same output;
- GRH-conditional completeness versus GRH-conditional completeness;
- unconditional proof versus unconditional proof;
- equal precision and an equivalent rigorous regulator enclosure.

Sage.js may return a stronger proof than requested, but the benchmark must say
so. It may not charge a competitor only for a conditional result while quietly
charging Sage.js for a full unconditional proof and then call the ratio an
algorithmic comparison.

### Measurement boundaries

Every benchmark reports four boundaries separately:

1. **kernel warm:** field, maximal order, and implementation process prepared;
2. **field cold:** persistent implementation process, fresh isomorphic field;
3. **process cold:** fresh process with shipped precompiled artifacts;
4. **release cold:** installed CLI/SEA or browser/Wasm application from launch
   through the first answer.

No boundary substitutes for another. Kernel optimization is not allowed to
hide a 20-second first request, and startup optimization is not allowed to hide
a 100x arithmetic gap.

### Competitive gates

The following targets apply to a versioned, stratified same-host corpus. Ratios
are against the fastest available mature implementation that provides
equivalent semantics; Sage/PARI is the mandatory continuously runnable
baseline. Magma and Oscar/Hecke are additional baselines when installed.

#### Gate A — credible

- every answer and proof label agrees with the oracle corpus;
- no unexplained warm slowdown exceeds 100x;
- every case above 10x has phase-level accounting;
- no supported case times out inside its documented resource envelope.

#### Gate B — practical

- warm geometric-mean slowdown at most 10x;
- warm p95 slowdown at most 25x;
- each motivating small field is within 10x;
- process-cold overhead is under one second for the ordinary small-field path;
- certificate replay is cheaper than discovery.

#### Gate C — competitive fourth implementation

- warm geometric-mean slowdown at most 3x for degree 2--6 class-number and
  class-group workloads;
- warm p95 slowdown at most 10x, with no unexplained outlier above 10x;
- unit-group and 100/200-bit regulator workloads have a geometric-mean
  slowdown at most 5x;
- degree 7--10 workloads complete reliably and have a median slowdown at most
  5x on the supported corpus;
- first-process small-field time is at most 2x the Sage wrapper or 250 ms,
  whichever is larger;
- peak memory is at most 3x the best open implementation for ordinary cases and
  remains inside the advertised cap;
- Sage.js wins at least a meaningful subset of cases through specialization,
  context reuse, WebAssembly locality, or cheap scalar projections;
- Linux x64/arm64, macOS arm64, Windows x64, and browser Wasm return identical
  mathematical payloads at an exact revision.

#### Gate D — research leadership

Gate D is not required to call Sage.js competitive. It is the later target:

- within 2x geometric mean across the supported corpus;
- performance wins on important families;
- scalable multicore relation collection;
- publishable algorithms, proof formats, or portable compiled kernels that are
  independently useful beyond Sage.js.

Targets may be tightened as the corpus grows, but they may not be loosened to
declare victory after seeing results.

## Governing principles

### 1. Profile the whole computation

Every optimization begins with a complete phase profile and ends with the same
complete computation. A microbenchmark is evidence about a mechanism, not an
acceptance result. Retain a change only when it improves a representative end
to end workload, or when it creates a necessary reusable primitive with a
clearly measured downstream ceiling.

### 2. Compare algorithms before instructions

For every large gap, first compare:

- factor-base theorem and selected bound;
- relation target and stopping criterion;
- large-prime policy;
- lattice dimension and enumeration radius;
- matrix representation and saturation schedule;
- unit recovery and precision policy;
- conditional versus unconditional work;
- materialized versus scalar output.

Only then optimize loops. A 100x gap is rarely repaired by making the wrong
algorithm 20% faster.

### 3. The computation context is the architectural center

`ClassUnitGroupContext` owns the expensive live state:

```text
ClassUnitGroupContext
├── field, order, embeddings, and exact identity
├── factor-base plan, compact records, and ideal views
├── exact relation store and modular rank state
├── relation presentation and transformations
├── factored dependency units and log lattice
├── analytic workspace and saturation state
├── proof-progress partitions and checkpoints
├── canonical payload hashes
└── validated, non-serializable producer authority
```

Public scalar and group APIs are projections from this context. A sequence such
as `class_number()`, `class_group()`, `unit_group()`, and `regulator()` on one
field must pay only for genuinely missing work. Live authority avoids redundant
reconstruction; detached payloads always replay independently.

No optimization may reintroduce a side cache that competes with the context or
allows conditional evidence to satisfy an unconditional request.

### 4. Representations are part of the algorithm

PARI, Magma, and Hecke are fast partly because they do not perform their inner
loops on general public ideal and element objects. Sage.js needs similarly
careful, but inspectable, representations:

- packed order bases and multiplication tensors;
- packed two-generator and HNF ideal records;
- stable factor-base indices and fingerprints;
- sparse signed relation rows;
- bounded exact ideal-power accumulators;
- factored principal elements and units;
- packed modular rank state;
- packed archimedean mantissas and interval endpoints;
- immutable canonical payloads plus live non-serializable views.

Public objects remain rich and Sage-compatible. Hot loops operate on compact
records and materialize public objects only at the boundary.

### 5. Batch across runtime boundaries

A native or Wasm call should process a batch large enough to amortize
marshalling. Do not cross JavaScript once per valuation, ideal factor,
embedding, matrix row, or candidate element. Kernels accept fixed-shape packed
buffers, explicit dimensions, and explicit caps.

### 6. Verification has a budget

Exact replay is essential, but producer work must not be repeated merely
because the software lacks a sound ownership model. The live context may retain
authenticated objects and admission receipts. A detached verifier reconstructs
from canonical bytes under verifier-owned resource caps.

Each certificate type has three measured costs:

- production;
- live validation inside the uninterrupted computation;
- detached validation from serialized bytes.

Live validation should normally be below 10% of production. Detached replay
should normally be below 50% unless the certificate intentionally proves an
expensive independent theorem. Deviations require an explanation.

### 7. WebAssembly is a target, not a fork

The mathematical source and packed ABI are shared by dynamic JavaScript,
native Node, and Wasm. A kernel is incomplete until its dynamic fallback and
Wasm behavior are correct. Browser constraints influence representations early
rather than forcing a later rewrite.

### 8. Specialize families, not individual polynomials

Quadratic forms, cubic norm obstructions, Galois automorphisms, tiny Minkowski
bases, and signature-specific unit logic are valid mathematical families.
Hard-coded polynomial answers are not. A specialization must state its
mathematical domain, fail closed, and fall through to the general context.

### 9. Preserve exact outputs while optimizing

For representation-only changes, require byte-identical canonical factor
bases, relations, presentations, units, and certificates. Algorithmic changes
may alter deterministic payloads, but must prove equivalent groups and maps and
regenerate pinned fixtures deliberately.

## The benchmark and oracle laboratory

Performance work needs an independent lane with authority to reject attractive
but irrelevant optimizations.

### Corpus layers

Maintain four versioned corpora:

1. **smoke:** tens of fields, run on every focused change;
2. **performance:** hundreds of fields, run nightly on bench-1;
3. **coverage:** thousands of fields, stratified from LMFDB and run regularly;
4. **stress:** selected hard fields, large units, saturation cases, and degree
   7--10 computations under explicit long caps.

Stratify by:

- degree and signature;
- discriminant magnitude;
- equation-order index and ramification;
- class number and invariant factors;
- unit rank and regulator size;
- monogenic versus nonmonogenic maximal order;
- factor-base size and theorem;
- relation-search behavior and saturation index;
- automorphisms;
- expected conditional and unconditional proof cost.

Use the LMFDB read-only PostgreSQL mirror or `lmfdb-lite` bulk export to create
a pinned local snapshot. Store selection queries, table versions, stable field
labels, and checksums. Tests consume an offline reduced fixture; network access
is never required for correctness.

### Comparator runners

Provide persistent, machine-readable runners for:

- Sage 10.x using its PARI-backed number-field implementation;
- direct GP/PARI, separating `bnfinit` from `bnfcertify`;
- Oscar/Hecke with a pinned Julia project and precompiled sysimage;
- Magma with a pinned version and licensed host;
- dynamic, native, and Wasm Sage.js.

Each runner emits one JSON schema containing versions, exact inputs, proof
policy, requested output, initialization time, field construction, computation
time, verification time, answer, and peak memory. Runs that cannot establish
semantic parity are answer oracles only and are excluded from timing ratios.

For sub-10-ms competitors, loop enough independent prepared fields to exceed
one second of measured work. Never divide one noisy timer sample into a
three-digit performance claim.

### Benchmark governance

- `bench-1` is the authoritative Linux x64 performance host.
- Only one performance workload owns it at a time.
- Pin CPU affinity and performance governor where available.
- Record CPU model, microcode, Node, compiler, FLINT, GMP, Arb, Julia, PARI,
  Sage, and Magma versions.
- Separate single-thread latency from parallel throughput.
- Report median, geometric mean, p90, p95, worst case, and peak RSS.
- Retain exact before/after receipts for every merged performance change.
- Record rejected experiments as briefly as successful ones so they are not
  repeated.
- Fail the performance gate on an unexplained regression above 5%; investigate
  noise between 2% and 5%.

The dashboard must show absolute time as prominently as ratios. A change from
2 ms to 1 ms is valuable but not equivalent to changing a two-minute workload
to one minute.

## Representation program

This is the central engineering program, not a collection of incidental
caches.

### R1. Inventory object churn

Instrument complete computations with counts and cumulative time for:

- ideal construction, normalization, multiplication, powers, inversion, and
  equality;
- principal-ideal construction;
- order-element conversion and norm evaluation;
- factor-base reconstruction;
- relation canonicalization and hashing;
- HNF/SNF input conversion;
- embedding/log evaluation;
- certificate encoding and decoding.

For each high-cost call site, classify whether it needs a public object, a
canonical packed record, or merely a transient accumulator.

### R2. Establish packed value types

Create stable internal value contracts rather than ad hoc tuples:

- `PackedOrderArithmetic`;
- `PackedPrimeIdealRecord`;
- `PackedIdealAccumulator`;
- `PackedRelationStore`;
- `PackedFactoredElement`;
- `PackedPresentation`;
- `PackedLogLattice`.

Names may change during implementation, but ownership, canonicalization,
dimensions, bounds, and conversion rules must be explicit. These are internal
mathematical representations, not serialized trust tokens.

### R3. Make conversions one-way inside a phase

Decode once on phase entry, remain packed during the phase, and materialize
rich objects at the public or proof boundary. Never cycle
`ideal -> HNF -> ideal -> two-generator -> ideal` inside a candidate loop.

### R4. Add context-scoped arithmetic tables

Retain exact, identity-bound:

- order multiplication tensors and common denominators;
- integral-basis embeddings;
- prime-ideal HNF and two-generator records;
- ideal powers used by relation rows;
- norm forms and modular norm tables;
- relation-row reconstruction results;
- factorization and splitting metadata.

Caches are bounded and context-owned. Mutation, different order identity,
different factor base, or detached replay must miss safely.

### R5. Lower the right boundaries

Candidate source-transparent kernels, in measured priority order, include:

- fused prime-ideal candidate materialization;
- packed relation-row ideal reconstruction and equality;
- batched ideal multiplication/power accumulation;
- element norm and smoothness batches;
- short-vector scoring and shell enumeration;
- sparse modular rank insertion;
- exact incremental LLL/Gram--Schmidt updates;
- packed finite terms for analytic `h*R` bounds;
- batched archimedean logarithms;
- proof-prime planning and coordinate reduction.

A kernel proposal states the current phase share, theoretical Amdahl ceiling,
buffer ABI, dynamic oracle, Wasm story, expected memory, and end-to-end target
before implementation begins.

## Algorithm program

Representation work alone will not reach PARI. The algorithm program runs in
parallel and uses PARI and Hecke as white-box references.

### A1. Small-field scalar projection

Make `class_number()` genuinely scalar:

- choose the cheapest exact/conditional factor-base theorem;
- stop relation discovery at the minimum rank and lower-bound evidence needed
  for the scalar answer;
- avoid SNF transforms, generator ideals, unit bases, and analytic work when a
  bounded exact class-number certificate suffices;
- retain the relation context so later group/unit requests resume rather than
  restart;
- use generic family certificates such as Minkowski-principal bases and cubic
  modular norm obstructions.

First target: move the pinned cubic corpus through Gate B and then Gate C.

### A2. Production relation discovery

Reconcile Sage.js stage by stage with PARI `buch2` and Hecke's class-group
engine:

- initial rational-prime and attached-generator relations;
- deterministic short-element enumeration;
- randomized products biased toward missing modular pivots;
- one- and two-large-prime variants;
- partial-relation graph matching;
- automorphism orbit expansion;
- adaptive coefficient, radius, and ideal-selection policies;
- incremental rank and dependency targets;
- restart/checkpoint behavior.

For each degree/signature band, use corpus data to tune named immutable
policies. Do not create a single pile of unexplained magic constants.

### A3. Sparse and modular presentation arithmetic

Avoid dense exact matrices until justified:

- incremental rank over multiple word-size primes;
- sparse elimination and pivot scoring;
- early rejection of redundant rows;
- modular determinant/order estimates;
- exact HNF only after full rank is credible;
- SNF transformations only when maps are requested;
- certificate replay against original sparse rows.

Reuse FLINT wherever its mature operation matches the required boundary. Add a
new kernel only when conversion or missing sparse behavior is measured.

### A4. Unit recovery

Treat units as a first-class output of relation discovery:

- select a small exact dependency basis without scanning every combination;
- retain factored dependencies and principal witnesses;
- batch logarithmic embeddings;
- use interval rank tests with precise escalation;
- reduce the unit lattice before expanding units;
- saturate only at primes justified by the index bound;
- share every exact stage with class-group computation.

Large fundamental units must remain factored through computation,
serialization, display, and replay.

### A5. Analytic index proof

Continue replacing scalar high-level loops with exact packed interval kernels,
while preserving the complete truncation proof:

- cache splitting and prime-power plans in the context;
- aggregate finite terms without tuple/object churn;
- batch `log`, `sqrt`, and dyadic endpoint arithmetic where profitable;
- keep provenance bounded rather than embedding megabyte expression strings;
- reuse the same workspace for producer and live verification;
- make detached replay cold and independently bounded.

### A6. Unconditional proof

Unconditional proof is a separate product mode:

- reuse an assumption-free Minkowski factor base whenever it is no larger than
  the discovery base under a measured cutoff;
- stream proof primes with deterministic partitions;
- batch ideal reduction and class-coordinate evaluation;
- checkpoint every bounded partition;
- retain exact witnesses without expanding huge elements;
- measure `bnfcertify` separately from `bnfinit` in PARI;
- ensure `proof=False` never pays the proof pass accidentally.

### A7. Specialized families

Maintain dedicated strategies where mathematics offers a real advantage:

- imaginary and real quadratic forms, continued fractions, NUCOMP/NUDUPL, and
  BSGS;
- cubic norm-form lower bounds and cheap exact class-number certificates;
- automorphism orbits for fields with authenticated exact self-maps;
- tiny Minkowski factor bases;
- signature- or torsion-specific unit paths.

Every specialization feeds or returns a compatible shared context so it does
not become an isolated implementation island.

## Upstream research method

The project uses mature systems as teachers and oracles, not as code mines.

### PARI

For each dominant phase, identify the corresponding path in `buch1.c` or
`buch2.c` and record:

- mathematical invariant;
- data representation;
- stopping condition;
- precision/restart policy;
- memory ownership;
- asymptotic and observed behavior;
- which parts rely on PARI-specific stack allocation or compact `GEN` layouts.

GPL source informs design and benchmarking. Do not copy incompatible code into
Sage.js.

### Oscar/Hecke

Map Hecke's high-level Julia orchestration separately from Nemo/FLINT kernels.
The useful lesson is often where Hecke stops using rich Julia objects and
enters packed native arithmetic. Preserve mathematical provenance for
BSD-licensed ideas, but adapt them to Sage.js's context and representation
model.

### Magma

Use Magma as an independent black-box oracle and performance comparator. Vary
input presentations and options to infer algorithm boundaries, but do not
pretend unpublished internals are known.

### Papers and reproducible notebooks

Maintain short engineering notes linking source functions to Cohen, Buchmann,
McCurley, Bach, BDF, and later large-prime/sieving literature. Each proposed
algorithm change includes a tiny reproducible differential notebook or script
before production integration.

## Hardware and runtime resources

### bench-1 — authoritative latency host

Use for:

- same-host Sage.js/Sage/PARI/Oscar comparisons;
- single-thread phase profiles;
- before/after acceptance receipts;
- memory and cold-start measurements.

Requirements:

- high-clock x86-64 CPU;
- at least 64 GiB RAM for stress profiling, while ordinary gates retain much
  smaller explicit caps;
- local NVMe storage for native caches, LMFDB snapshots, Julia artifacts, and
  profiles;
- stable CPU governor and optional isolated cores;
- no concurrent benchmark or build during an acceptance run.

### bench-arm — Linux arm64 portability and performance

Use for exact-SHA correctness, native/Wasm differential testing, gross
performance regressions, and ARM-specific compiler behavior. It is not mixed
into the x86 performance ranking.

### M1 — macOS arm64 release gate

The repaired physical M1 is a required exact-SHA target. Keep a durable login,
pinned Node toolchain, health probe, and bounded remote runner. Test native
addons, release packaging, Wasm fallback, and focused class/unit corpora. An SSH
failure is reported as infrastructure failure, not mathematical success.

### Windows x64 — first-class release gate

Use a native Node executable and source launcher, never WSL or an extensionless
Unix shim. Run focused native kernels, public APIs, certificate replay, and a
small performance smoke test at each release candidate.

### Optional throughput host

A 16--64-core machine with 128 GiB or more RAM is useful once relation
collection becomes parallel. It measures throughput and scaling, not
single-core competitiveness. Parallel workers must produce deterministic,
canonically ordered relation batches so thread count does not change the
mathematical payload unexpectedly.

### Magma and Oscar hosts

- Maintain one licensed Magma host with a noninteractive JSON harness.
- Maintain one pinned Julia/Oscar environment with a precompiled sysimage.
- Cache package artifacts but report sysimage and process initialization
  separately.
- Preserve exact version and host fingerprints in every receipt.

## Agent organization

Use short, bounded projects rather than one agent editing the whole subsystem.
The integration branch is `class-group`; completed lane commits are pushed and
integrated frequently.

At most one lane owns a shared implementation file. A typical active wave uses
six to nine roles:

1. **Coordinator/integrator** — owns the plan, context interfaces, shared
   manifests, cherry-picks, conflict resolution, exact target SHA, and final
   acceptance.
2. **Benchmark/oracle lane** — read-only against implementation sources; owns
   corpora, comparator harnesses, stable timings, and regression judgments.
3. **Relation-algorithm lane** — relation discovery, large-prime policies,
   automorphisms, stopping rules, and checkpoints.
4. **Exact-representation lane** — packed orders/ideals/relations and
   conversion elimination.
5. **Linear-algebra lane** — modular sparse rank, HNF/SNF scheduling, and maps.
6. **Unit/analytic lane** — dependency units, logs, regulator, zeta residue,
   and saturation.
7. **Native/Wasm lane** — source-transparent lowering, packed ABIs, production
   coverage, and cross-target differential tests.
8. **Specialized-family lane** — quadratic, cubic, or automorphism-rich
   families with a narrowly stated domain.
9. **Adversarial reviewer** — read-only security/correctness audit, malformed
   payloads, resource caps, cancellation, and detached replay.
10. **Cross-platform/oracle operator** — exact-SHA Linux arm64, macOS arm64,
    Windows, Magma, and Oscar receipts.

Not all roles run continuously. Use waves: first profile and design, then two or
three independent implementations, then integration and audit. Long benchmark
or platform jobs can overlap local source work, but two math benchmarks never
share bench-1.

Every lane:

- is created with `pnpm parallel:new` from the exact integration SHA;
- claims the narrowest files possible;
- states one objective and one measurable exit criterion;
- records upstream references and license provenance;
- includes a dynamic correctness oracle and representative benchmark;
- runs focused tests and `pnpm parallel:check` before handoff;
- commits and pushes a coherent change promptly;
- reports exact hashes, absolute time, ratio, memory, and rejected alternatives;
- never edits shared package, architecture, CI, or release manifests unless it
  is the integration lane.

The coordinator does not accept a lane because its microbenchmark is faster.
Acceptance requires static review, exact-output equivalence, end-to-end benefit,
and exact-head validation.

## Recommended resourcing envelope

This effort is feasible with sustained coordination rather than an unlimited
fleet. The recommended steady state is:

- one coordinator/integrator continuously responsible for the exact head;
- three to five implementation lanes working on nonoverlapping bottlenecks;
- one independent benchmark/oracle lane;
- one adversarial review lane activated before each integration wave;
- one cross-platform operator while an exact release candidate is frozen.

The minimum useful physical infrastructure is:

- bench-1 reserved for uncontended x86-64 latency measurements;
- bench-arm, the physical M1, and native Windows x64 for exact-SHA gates;
- at least 1 TiB of fast local storage shared or replicated for native build
  caches, LMFDB snapshots, Julia artifacts, benchmark receipts, and profiles;
- one licensed Magma installation and one pinned Oscar/Hecke installation;
- a backup or reproducible provisioning description for every irreplaceable
  machine configuration.

The optional high-core-count host becomes valuable only after relation
collection has an efficient single-core packed path. Buying parallelism before
then would mostly multiply representation overhead.

Use a regular operating cadence:

- continuously: focused lane tests and exact before/after micro receipts;
- twice weekly during active optimization: complete cubic corpus and regression
  review;
- at each integrated milestone: degree/signature smoke corpus and detached
  mutation tests;
- at each release candidate: full performance corpus, stress cases, native
  gates, and all cross-platform receipts;
- after every material architecture change: update this strategy with the
  measured lesson rather than allowing implementation folklore to accumulate.

Agent concurrency should shrink during integration. Six speculative lanes can
discover opportunities; one integrator and one reviewer should decide what
actually reaches the exact head.

## Execution roadmap

The roadmap is gated by evidence rather than calendar promises. Multiple
independent items within a milestone may run in parallel.

### Milestone 0 — freeze the laboratory

- Pin the current cubic and degree 2--10 receipts at an exact `class-group`
  revision.
- Install persistent direct-PARI and Sage runners on bench-1.
- Install and validate pinned Oscar/Hecke; provision the Magma runner.
- Bulk-download a versioned LMFDB subset and generate the four corpus layers.
- Add a performance-results schema and regression report.
- Measure all four initialization boundaries.

Exit: any agent can reproduce the published baseline without private setup.

### Milestone 1 — finish context consolidation

- Audit every class/unit public entry point for context reuse.
- Eliminate remaining issuance-seal and side-cache concepts that duplicate
  context ownership.
- Make scalar, group, unit, regulator, and proof projections explicit.
- Add a sequential-call benchmark proving incremental reuse.
- Measure live versus detached validation for every certificate family.

Exit: one field has one authoritative live computation context, and repeated or
expanded requests never redo a completed exact stage.

### Milestone 2 — make small cubics practical

- Finish packed prime-ideal construction and relation admission.
- Remove repeated principal-ideal construction and ideal-power expansion.
- Stop scalar relation collection at the proven minimum.
- Make tiny HNF/SNF and modular rank operations allocation-light.
- Precompile every module on the ordinary small-cubic path.
- Run the 10-field corpus after every retained change.

Exit: Gate B for the cubic corpus, followed by a written closure plan for every
case still above 10x.

### Milestone 3 — make small cubics competitive

- Compare every remaining >3x phase with PARI and Hecke source paths.
- Fuse packed candidate generation, admission, and rank screening where
  source-transparent kernels show an end-to-end win.
- Avoid full group/unit construction for scalar requests.
- Tune family-level factor-base and relation policies using the larger corpus.

Exit: Gate C for degree-3 class numbers and class groups, including both proof
modes and cold-process targets.

### Milestone 4 — competitive units and regulators

- Benchmark class-only, unit-only, regulator-only, and combined requests.
- Reduce dependency selection and factored-unit reconstruction costs.
- Batch log embeddings and packed analytic finite terms.
- Make context reuse turn combined requests into incremental work.
- Compare precision escalation and saturation with PARI/Hecke.

Exit: unit/regulator Gate C on degrees 2--5 at 100 and 200 bits.

### Milestone 5 — quartic through sextic production engine

- Deploy large-prime partial relations and adaptive relation policies.
- Move modular rank and candidate scoring into packed kernels as justified.
- Keep HNF/SNF sparse until exact transforms are needed.
- Tune by degree/signature/discriminant bands, not isolated examples.

Exit: no corpus timeout; class-number/class-group geometric mean within 5x and
p95 within 15x for degrees 4--6, then tighten to Gate C.

### Milestone 6 — degree 7--10 scaling

- Profile short-vector enumeration, ideal arithmetic, and unit verification on
  each stress field.
- Add deterministic parallel relation collection after single-core efficiency
  is credible.
- Bound memory and checkpoint growth.
- Separate discovery scaling from analytic and proof scaling.

Exit: all pinned live cases complete within their caps, then meet the degree
7--10 portion of Gate C.

### Milestone 7 — unconditional proof parity

- Benchmark conditional discovery and unconditional upgrade separately.
- Batch proof-prime discrete logs and principal witnesses.
- Make proof partitions resumable and parallel.
- Compare directly with `bnfcertify`, Hecke `GRH=false`, and Magma proof modes.

Exit: unconditional results have equivalent semantics, practical wall time,
bounded replay, and Gate C ratios on the supported corpus.

### Milestone 8 — release and research system

- Run exact-SHA native/Wasm validation on all four release platforms.
- Publish the corpus, methodology, benchmark receipts, proof schemas, and
  architectural account.
- Document capability boundaries honestly.
- Add user-facing progress, cancellation, checkpoints, and diagnostics.
- Prepare a technical paper or long-form report describing the portable exact
  context, proof architecture, and competitive results.

Exit: a researcher can install Sage.js, reproduce the results, inspect the
proof evidence, and obtain performance in the competitive range without a
private build environment.

## Immediate work queue

The next work should remain narrow and evidence-driven:

1. complete and validate the current small cubic optimization;
2. freeze an exact-head 10-field cubic receipt;
3. profile relation admission as packed ideal multiplication, powers,
   principal-ideal construction, replay, and rank insertion;
4. remove the largest repeated representation conversion;
5. measure the full corpus and retain only an end-to-end win;
6. add the persistent Oscar/Hecke runner and direct GP runner;
7. extend the LMFDB corpus from 10 to 100 stratified cubic fields;
8. audit sequential API calls for context misses;
9. measure current degree-4 and degree-5 phase distributions;
10. choose the next kernel only from those complete profiles.

The temptation to start several speculative kernels at once should be resisted.
At this stage, one well-chosen packed boundary can remove an entire layer of
object reconstruction, while ten isolated arithmetic tricks may not move the
complete computation.

## Decision rules

### Retain an optimization when

- canonical outputs are identical or the algorithmic equivalence is proved;
- focused and adversarial tests pass;
- the representative end-to-end workload improves by at least 5%, or the
  change unlocks a measured larger downstream improvement;
- memory does not regress materially without an explicit tradeoff;
- cold startup and Wasm size remain acceptable;
- the implementation reduces or cleanly centralizes complexity.

### Reject or revert when

- only a microbenchmark improves;
- another representative field regresses badly;
- the change relies on trusting serialized input;
- native and dynamic behavior diverge;
- a cache depends on object identity without context ownership;
- a special case cannot state a mathematical family;
- source or release size grows faster than the measured benefit;
- the approach makes Windows or Wasm a second-class target.

### Pause and redesign when

- more than two optimizations need new issuance tokens or side caches;
- the same canonical payload is decoded more than once per live phase;
- proof replay is more expensive than discovery without mathematical reason;
- one phase remains above 50% after three local optimizations;
- a 10x gap persists despite comparable algorithms and stopping rules;
- agents repeatedly conflict in the same large module.

These are architectural signals, not failures of effort.

## Risks

### Optimizing the benchmark rather than the algorithm

Mitigation: stratified LMFDB corpora, held-out fields, exact proof semantics, and
independent oracle ownership.

### Recreating PARI badly in Python objects

Mitigation: translate invariants and stage boundaries, introduce deliberate
packed representations, and call mature FLINT/GMP/Arb primitives.

### Creating an opaque second implementation

Mitigation: ordinary Python remains authoritative; native kernels are
same-source, inspectable, differential-tested, and independently bounded.

### Proof architecture consuming all performance

Mitigation: distinguish producer authority, live validation, and detached
replay; budget each separately without weakening detached verification.

### Cold-start improvements hiding arithmetic regressions

Mitigation: report all four timing boundaries and exact phase totals.

### Specialization explosion

Mitigation: require a mathematical family and corpus-wide benefit; integrate
all specializations with the shared context.

### Parallel-agent integration collapse

Mitigation: narrow claims, short projects, one integration owner, frequent
commits, exact base SHAs, and a dedicated adversarial reviewer.

### High-degree resource blowups

Mitigation: preflight work, explicit memory caps, sparse state, checkpointing,
and hard wall-time guards. A timeout is a measured incomplete result, never a
false success.

### Upstream license mistakes

Mitigation: record provenance, use GPL PARI as an oracle/design reference only,
and review any adapted Hecke code under its actual license.

### WebAssembly divergence

Mitigation: common packed ABIs, same-source fallbacks, production capability
manifests, and exact browser differentials at every kernel milestone.

## Required artifacts

The program maintains:

- a versioned LMFDB-derived corpus and selection script;
- persistent JSON comparator runners;
- exact before/after performance receipts;
- phase profiles and resource diagnostics;
- a representation inventory and packed-ABI specifications;
- a PARI/Hecke stage correspondence notebook;
- rejected-experiment notes;
- exact-SHA cross-platform receipts;
- proof mutation and resource-exhaustion tests;
- user documentation and a final technical report.

## Final completion test

Sage.js is a competitive fourth implementation when all of the following are
true at one exact release revision:

- the supported degree 2--10 corpus agrees with Sage/PARI, Oscar/Hecke, and
  Magma wherever those systems provide the requested output;
- class groups include exact generators, maps, and principality witnesses;
- unit groups and regulators are complete with correct proof labels;
- conditional and unconditional modes cannot contaminate one another;
- Gate C performance and memory targets hold on the authoritative host;
- cold process and browser/Wasm behavior meet their separate targets;
- native Windows x64, Linux x64/arm64, and macOS arm64 pass exact-SHA tests;
- detached certificates reject all tested mutations within verifier-owned
  resource caps;
- the dynamic ordinary-Python implementation remains correct and readable;
- every material native kernel has a correct Wasm path or an explicit tested
  capability fallback;
- benchmark scripts, data selection, versions, and receipts are reproducible by
  someone who did not participate in the implementation.

The purpose of the target is not to imitate PARI's internals or to win every
single timing. It is to make Sage.js a system that a researcher can choose for
serious class- and unit-group computation without accepting an order-of-
magnitude performance penalty, while gaining portable WebAssembly execution,
inspectable source, explicit proof semantics, and replayable exact evidence.

[class-unit-plan]: number-field-class-and-unit-groups-plan.md
