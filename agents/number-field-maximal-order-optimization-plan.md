# Plan for PARI-class maximal-order performance

## Objective

Take Sage.js's certified, PARI-free maximal-order implementation from its
current "pretty fast" state to PARI-class performance without sacrificing its
main advantages:

- the mathematical implementation remains Sage.js's own readable code;
- ordinary CPython-parseable Python remains the primary algorithm source;
- source-transparent native compilation and mature FLINT/GMP operations
  accelerate that source;
- every returned order remains independently certifiable;
- the public API remains Sage-compatible and easy to use;
- Linux x64/arm64, macOS arm64, native Windows x64, and the correct dynamic
  fallback remain first-class paths;
- PARI, Sage, Hecke/Oscar, and Magma remain offline oracles and performance
  references, never runtime dependencies.

This plan follows
[`ARCHITECTURE.md`](../ARCHITECTURE.md) and builds on the broader algorithmic
plan in
[`number-field-maximal-order-pari-parity-plan.md`](number-field-maximal-order-pari-parity-plan.md).
It focuses specifically on the measured work still required for performance
parity.

## Starting point

The reference integration state for this plan is commit `286cc998`. The
durable performance receipt is:

- `bench/results/number-field-maximal-order-current-head-0abc59da-2026-08-18.json`;
- `bench/results/number-field-maximal-order-current-head-0abc59da-2026-08-18.md`.

Later commits complete vector010 fixtures, higher OM boundaries, the
four-platform matrix, the 505-case corpus report, and the corrected addprimes
oracle without changing the conclusions below.

### What is already working

- Public `NumberField.maximal_order()` is PARI-free and independently
  certified on the measured cases.
- Lazy discriminant decomposition avoids requiring complete integer
  factorization whenever local work can certify the result.
- The implementation has selectable Dedekind, polygon, Round-2, modified
  Round-4, Buchmann--Lenstra, and OM/MaxMin components.
- The ordinary public path can use one fused field-analysis resource.
- Production source-transparent kernels exist for the fixed-point checker,
  Buchmann--Lenstra HNF, and word-prime Krylov computation.
- Pointer-free deterministic local workers, cancellation, and parent-side
  certification exist.
- The four supported host targets pass focused exactness and native lifecycle
  validation.
- The bounded 505-case report contains no independently wrong Sage.js lattice.
  Its one retained historical mismatch was a stale bounded PARI oracle and is
  corrected in the live corpus.

### Current performance anatomy

| Workload | Current measurement | Dominant limitation |
| --- | ---: | --- |
| Ordinary fused public cases | about 16--75 ms | repeated proof/orchestration work |
| Direct ordinary native kernels | about 0.002--5.5 ms | often already fast |
| `T(8, 2^32)` checked public | about 111 ms | decomposition, BL, native local work, and certification |
| PARI regression #2510 | 7.98 times the best direct reference | local native algorithm |
| PARI regression #1710 | 4.66 times the best direct reference | local native algorithm |
| Hecke precision degree 12 | about 11.2 s | general Buchmann--Lenstra component |
| PARI vector010 | about 56.4 s | 2,901 CRT primes in 24 modular characteristic computations |
| Public many-prime parallel path | no speedup yet | native-first selection and worker crossover |

Under the uniform five-second standard-corpus policy, 477 of 489 cases
returned and independently verified. Six more recovered under a separate
non-substituting 30-second diagnostic. The five remaining 30-second tails are:

- `pari-round4-vector-010`;
- `pari-round4-vector-429`;
- `regression-x64-plus-2pow16`;
- `pari-large-prime-quadratic-compositum`;
- `hecke-degree-90`.

The central conclusion is that there are now two different performance
problems:

1. Ordinary fields have fast native arithmetic but too much public proof and
   orchestration overhead.
2. A small set of hard fields still need faster local mathematical algorithms.

They require different remedies and must be measured separately.

## Non-negotiable invariants

No performance milestone may weaken these requirements:

1. The returned lattice contains `1` and the equation order.
2. It is closed under multiplication.
3. Its discriminant and equation-order index satisfy the exact square-index
   identity.
4. Every relevant local component has a maximality proof.
5. Composite components are never silently treated as prime.
6. A compact or fast certificate must be independently checkable and reject
   deliberate corruption.
7. Cached calls are never used as fresh-operation performance evidence.
8. Work is not hidden in field construction, lazy import, or benchmark warmup.
9. Algorithm selection depends on mathematical and measured cost features,
   never a polynomial or fixture name.
10. Missing native capability selects a tested correct dynamic fallback.

The implementation will not reach a performance target by linking PARI at
runtime, replacing the readable algorithm with an unrelated handwritten C
implementation, skipping certification, or timing a previously cached order.

## Milestone 1 -- Proof-carrying fast public path

### Problem

The fused analysis boundary improves ordinary public calls by only about
1.1--1.3 times. In several cases the underlying native computation takes
microseconds while the complete public operation takes tens of milliseconds.
The current path reconstructs and checks overlapping facts in the fused
checker, certificate adapter, generic lattice checker, and global certifier.

More wrapper cleanup cannot close the gap. The proof representation must
change.

### Design

Produce one immutable field-analysis result containing:

- normalized polynomial and scale binding;
- canonical HNF numerator and positive denominator;
- equation-order and returned-order discriminants;
- exact equation-order index;
- certified discriminant components and their states;
- resolved local indices;
- compact multiplication-closure evidence;
- one terminal local fixed-point witness for every resolved squared prime;
- explicit partial/arbitrary-prime/native-failure status when completeness is
  not proved.

A separate source-transparent compiled checker consumes this resource in
packed FLINT/GMP storage and verifies the proof once. It must not decode a
large Python integer graph and then invoke the generic checker again.

The intended public flow is:

```text
normalized polynomial
        |
        v
one fused native analysis
        |
        v
one independent packed proof check
        |
        v
lazy Order materialization and cache
```

The current generic checker remains the slower readable oracle. Randomized
small cases and deliberate corruptions must agree between the packed checker
and the generic checker.

### Required work

- Keep the analysis payload bound to the exact polynomial, scale, trial bound,
  compiler identity, and schema version.
- Borrow or copy one immutable packed resource instead of repeatedly
  serializing arbitrary-precision integers through host objects.
- Verify closure through packed exact matrix arithmetic or a compact theorem
  witness, not reconstructed `NumberFieldElement` products.
- Verify local fixed points by independently recomputing the relevant radical
  and full-rank multiplier condition.
- Make successful authentication immutable; later object mutation must not be
  able to preserve a stale `certified=True` flag.
- Teach global certification to consume the authenticated proof envelope
  without replaying the same closure and native local computations.
- Materialize public basis elements once, after authentication, and retain the
  packed canonical basis as the cache identity.
- Preserve fail-closed fallback before any cacheable order is constructed.

### Acceptance gates

- Warm public microcases are at most 2 ms on the reference host.
- The native microcase boundary is at most 0.25 ms where the best reference is
  below 1 ms.
- The public path performs one polynomial-to-proof resource crossing.
- Successful calls perform one independent proof check and no duplicate
  generic closure or per-prime native replay.
- Partial, arbitrary-prime, stale, malformed, or corrupted resources fall
  through safely and never poison the field cache.
- Dynamic, compiled, and generic checker differentials pass on randomized
  fields and controlled corruptions.

## Milestone 2 -- Fuse the ordinary T8 path

### Problem

For `T(8, 2^32)`, the internal compiled Buchmann--Lenstra construction is
already below 25 ms, but checked public execution is about 111 ms. The major
stages remain separately materialized and partly repeated:

- discriminant decomposition;
- composite Buchmann--Lenstra construction;
- native local work;
- global certification.

### Design

Extend the proof-carrying analysis operation to perform cheap factor discovery,
composite Dedekind/Buchmann--Lenstra work, resolved word-prime local work, HNF
merge, and proof construction without round trips through public Python
objects.

This is a batched data-flow change, not permission to merge all mathematical
algorithms into opaque native code. The readable decomposition and BL routines
remain the source and dynamic oracle.

### Required work

- Reuse discriminant/subresultant factor hints instead of recomputing them.
- Keep pairwise-coprime components and HNF bases in packed integer storage.
- Use the compiled rectangular row-HNF operation throughout the eligible
  complete composite-Dedekind path.
- Avoid standalone BL replay when the final proof envelope contains sufficient
  independently checkable generator and coprimality evidence.
- Batch all supported word primes into one local-order resource call.
- Feed the resulting HNF directly into the packed checker from Milestone 1.

### Acceptance gates

- Checked public `T(8, 2^32)` completes within 25 ms on the reference host.
- No complete integer factorization occurs before local work.
- The final lattice and certificate agree with the generic path and external
  oracles.
- Factor discovery, BL construction, local work, proof check, and public
  materialization retain separate trace counters even when batched.

## Milestone 3 -- Make #2510 and #1710 locally competitive

### Problem

These cases are dominated by local mathematics rather than public wrappers.
The direct Sage.js native kernels remain about 7.98 and 4.66 times slower than
the faster of direct PARI and Hecke.

### Method

Profile each relevant local prime through the complete existing portfolio:

- Dedekind immediate maximality;
- first-order Newton polygon;
- native Round 2;
- modified Round 4;
- OM/MaxMin;
- Buchmann--Lenstra only where the component contract requires it.

For each algorithm retain:

- factor degrees and multiplicities;
- discriminant and index valuations;
- type depth or Round-4 precision;
- coefficient growth and HNF dimensions;
- exact local basis and certificate;
- native time, dynamic time, allocations, and host crossings.

### Required work

- Compile the remaining finite-field factor/refinement loops that dominate the
  winning local algorithm.
- Keep factor, quotient, HNF, and multiplier data in packed storage.
- Avoid rebuilding a full multiplication table after each basis change.
- Batch word-prime local construction and independent replay.
- Complete a measured selector based on degree, local valuation, factor
  pattern, predicted coefficient growth, and expected output size.
- Retain forced algorithms for differential testing and inspectable selection
  reasons.

### Acceptance gates

- Each of #2510 and #1710 is within 2 times the faster direct PARI/Hecke local
  boundary.
- The final hard-case geometric-mean ratio is at most 1.25.
- No ordinary microcase regresses outside recorded noise bounds.
- The selected and forced algorithms return the same independently certified
  local order.

## Milestone 4 -- Collapse the major long tails

### 4A. Precision degree 12

The hot component is a 2,772-bit general Buchmann--Lenstra multiplier cycle.
Construction and independent replay repeat expensive exact ideal and matrix
operations.

Required work:

- source-transparently compile the remaining multiplier-cycle matrix loops;
- retain normalized integer matrices rather than repeated rational pairs;
- cache canonical inverses, containment transforms, and HNFs within a cycle;
- emit a compact enlargement event certificate;
- verify the event sequence, index, discriminant, and final multiplier fixed
  point without reconstructing the whole accepted cycle twice;
- keep splits, general cycles, corruptions, and unsupported resource bounds
  fail-closed.

Gate: the exact public result must first fall below the 5-second standard
policy, then meet the final same-host faster-reference contract.

### 4B. Vector010

Correctness is complete, but the modified Round-4 path performs 24 modular
characteristic computations using 2,901 CRT primes. The packed word-prime
Krylov calculation is fast; repeated host-orchestrated prime and reconstruction
work is not.

Required work:

- batch the complete prime/CRT loop for one characteristic or minimal
  polynomial into one source-transparent call;
- compute exact coefficient bounds once per matrix;
- reuse modular matrix normalization and workspaces;
- reconstruct only when the modulus exceeds the proved bound;
- certify cyclic/minimal-polynomial candidates by exact annihilation;
- use `charpoly = minpoly^e` only after the degree and annihilation proof;
- keep direct fraction-free exact arithmetic below the measured crossover;
- record prime count, modulus bits, reconstruction attempts, and exact
  certificate decisions.

Gate: vector010 must remain exact with no fixture-specific branch and move
inside the final direct-reference ratio contract.

### 4C. Vector429 and the remaining timeout cluster

The completed higher-order OM fixtures now cover important `p=2`, `p=3`,
`p=5`, and `p=7` domains. The remaining generic work includes larger residual
fields, bounded residual factorization, and scalable MaxMin/HNF construction.

Required work:

- support arbitrary proved finite residual-field degree in the active type;
- retain recursive mixed-radix representatives correctly across levels;
- implement scalable residual squarefree/DDF/factor refinement;
- compile packed quotient valuation and MaxMin comparison kernels;
- eliminate exhaustive high-level element reconstruction;
- use incremental exact HNF insertion or the packed HNF kernel according to
  measured coefficient growth;
- preserve explicit completeness/resource-bound states;
- finish the unresolved vector429 local primes before enabling automatic OM.

Apply the resulting general components to the other retained 30-second cases,
including the large-prime compositum and degree-90 field, based on their stage
profiles rather than shared fixture membership.

## Milestone 5 -- Enable OM/MaxMin automatically

OM is currently forced-only because mathematical completeness alone does not
prove that its Sage.js execution is faster than established native Round 2 or
Round 4.

An OM result is auto-eligible only when:

- every selected type is complete;
- residual factors and representative precision are certified;
- quotient/MaxMin evidence independently verifies;
- the local HNF passes exact closure/index checks;
- the predicted cost beats the competing complete algorithm;
- coefficient and memory growth stay within measured bounds.

The selector uses input-derived features:

- field degree;
- local discriminant valuation;
- factor degrees and multiplicities;
- type depth, residual degree, and ramification degree;
- expected quotient/combination count;
- predicted HNF dimensions and coefficient bits;
- native capability and memory budget.

It must not use a polynomial name, corpus ID, or hardcoded fixture digest.

Acceptance:

- OM is selected on at least one measured standard or stress region where it
  wins end to end.
- Removing OM leaves correct Round-2/Round-4 fallbacks.
- Forced OM, selected OM, and external oracles agree on the same local and
  global HNF orders.
- The selector exposes its cost inputs, decision, and suppressed alternatives.

## Milestone 6 -- Production parallel crossover

Parallelism is valuable only after single-prime kernels are competitive. It
must not hide a poor local algorithm.

### Policy

Use the pointer-free worker path only when:

- the complete native global path is unavailable or predicts slower hard
  independent branches;
- at least two local components exceed the measured worker setup threshold;
- the predicted critical path beats sequential execution by a safety margin;
- the derived or explicit memory budget supports the worker count;
- the precompiled graph is fresh and source/compiler-bound.

The parent retains:

- polynomial and component validation;
- deterministic job keys and result binding;
- cancellation after a fatal result;
- deterministic CRT/HNF merge;
- the final independent global certificate and public cache.

### Acceptance gates

- Production packaging always exercises the real precompiled worker graph.
- Exact sequential/parallel equality holds under randomized completion order.
- A fatal worker cancels a deliberately slow sibling promptly.
- No native pointer or host-specific identity crosses the worker boundary.
- Many-prime public execution has a stable measured speedup.
- Tiny and native-dominated cases remain sequential and do not regress.
- Peak memory stays within the recorded policy on every supported platform.

## Milestone 7 -- Final evidence and parity closure

### Corpus

Rerun the corrected corpus from the final source identity:

- all 489 standard cases under one uniform policy;
- all PARI Round-4 fixtures;
- selected Hecke absolute-field regressions;
- randomized equivalent-generator transformations;
- all 16 degree/high-index stress cases with current public lattice execution,
  not structural metadata alone;
- every retained timeout under separately labeled bounded diagnostics.

Every accepted row must pass the independent lattice checker. Raw timeout,
crash, disagreement, unavailable, unsupported, and invalid states remain in
the artifact and are never replaced by longer diagnostics.

### Oracle matrix

For exact overlapping cases, record:

- Sage.js dynamic and production-native paths;
- direct GP/PARI `nfbasis` and `nfinit`;
- Sage public operation;
- direct Hecke core;
- Oscar public and cold operation;
- Magma public operation when available.

Label PARI/Sage and Hecke/Oscar as shared implementation families. Magma is an
independent black-box oracle, not a hard availability requirement.

### Performance boundaries

Measure separately:

1. local/native polynomial-to-HNF computation;
2. warm public `maximal_order()` on a fresh constructed field;
3. cold startup, loading, field construction, order construction, and basis
   materialization;
4. cached second-call identity as an API property only.

Every performance artifact records exact source/native hashes, CPU/OS/runtime,
warmup and sample policy, raw samples, host load, polynomial and certificate
digests, peak memory, and exact-equivalence checks.

### Supported platforms

Run focused exactness, production autoload, resource lifecycle, corruption,
and representative performance bounds on:

- Linux x64;
- Linux arm64;
- macOS arm64;
- native Windows x64.

New native work also requires AddressSanitizer, UndefinedBehaviorSanitizer,
leak/lifecycle stress, source-currentness, and dynamic fallback checks where
the platform supports them.

## Execution order

The milestones should be pursued in this order:

1. proof-carrying packed public path;
2. fused T8 decomposition/BL/local/certification;
3. #2510/#1710 local portfolio and selector;
4. batched Round-4 CRT reconstruction;
5. precision12 multiplier-cycle proof;
6. general higher-residual OM and vector429;
7. automatic OM crossover;
8. production parallel crossover;
9. final corpus, oracle, performance, and platform rerun.

This order deliberately attacks ordinary public overhead before hard local
algorithms, and single-prime algorithms before parallel scheduling.

## Per-milestone development contract

Every optimization milestone must provide:

- a readable ordinary-Python implementation or retained reference path;
- source-transparent native lowering where used;
- a correct dynamic fallback;
- exact CPython/Sage.js/native differentials;
- at least one independent external mathematical oracle where available;
- deliberate malformed-input and certificate-corruption rejection;
- traceable selection and capability behavior;
- a representative benchmark with raw samples;
- architecture, strict Python, focused native, and relevant platform checks;
- a coherent commit with durable evidence.

At minimum, the integration sequence includes:

```sh
pnpm format:python
pnpm build
pnpm test:baselib:strict
pnpm architecture:check
pnpm test:native
```

plus the focused maximal-order, certificate, worker, corpus, and oracle tests
affected by the milestone.

## Final completion gates

The optimization project is complete only when all of the following are true:

- warm public microcases are at most 2 ms and eligible native microkernels are
  at most 0.25 ms;
- for references taking at least 1 ms, the geometric mean Sage.js/best-reference
  ratio is at most 1.25 and no unexplained standard case exceeds 2;
- `T(8, 2^32)` completes within 25 ms on the reference host;
- scalable stress cases are no slower than the faster of direct PARI and
  Hecke on the same input and host;
- warm Sage.js `maximal_order()` is no slower than Sage's wrapper across the
  complete standard corpus;
- the corrected standard, Round-4, Hecke, stress, and randomized-generator
  corpora all pass;
- dynamic, Round 2, Round 4, and OM agree wherever their supported domains
  overlap;
- many-prime parallel execution has a real public speedup without tiny-case
  regression;
- every result remains independently certified and every supported platform
  exercises a tested correct path;
- all benchmark and validation claims are reproducible from committed
  artifacts.

## Strategic summary

The project does not need a wholesale rewrite. It needs two focused advances:

1. make the already-fast ordinary native arithmetic return a compact proof
   that is checked once, without repeating generic public certification work;
2. replace a small number of identified slow local kernels with batched,
   source-transparent Round-4, Buchmann--Lenstra, and OM/MaxMin operations.

That is the path from the current certified implementation to a genuinely
PARI-class, PARI-free, readable, and easy-to-use Sage.js implementation.
