# RFC: A multi-level optimizing compiler for Sage.js mathematics

**Status:** Implemented
**Date:** 2026-08-27  
**Scope:** Sage/Python-to-JavaScript compilation, mathematical representation
selection, guarded V8 regions, WebAssembly regions, and source-transparent
`@native` lowering

## Decision requested

Adopt a small, explicit compiler middle end for mathematical optimization
instead of extending the current frontend and emitter with independent
syntax-specific fast paths.

The middle end will:

1. preserve Python and Sage semantic operations in a high-level IR;
2. attach reusable parent, type, effect, alias, escape, range, and stability
   facts;
3. identify computation regions whose intermediate public objects are not
   observable;
4. select a concrete representation independently from an execution target;
5. emit entry guards and retain the exact original region as fallback;
6. lower a proved region to optimized JavaScript, resident/batched Wasm,
   source-transparent `@native`, or the generic runtime;
7. explain every acceptance and rejection with stable reason codes; and
8. test semantic equivalence, route selection, resource use, compilation cost,
   and representative performance.

The existing closed prime-field recurrence is retained as the first vertical
slice and migrated through the new interfaces. It is not generalized into a
larger family of AST templates. The first new mathematical witness will be
small fixed-degree extension fields, beginning with `GF(97^2)`.

## Motivation

The finite-field boundary experiment established a surprising but narrow
fact. A public Sage.js loop of the form

```python
value = parent(1)
multiplier = parent(12345)
increment = parent(6789)
for index in range(count):
    value = value * multiplier + increment
```

can run at about 5.3 ns per modular step after the compiler proves a closed,
monomorphic region and replaces intermediate field objects with primitive V8
Number locals. On the measured host this was close to the same recurrence in
source-transparent `@native` code and raw JavaScript, faster than a scalar Wasm
call, and far faster than either scalar Node-API calls or the generic public
field-object path.

This result does **not** show that a general Sage program is fast, that V8 is
always the best target, or that this recurrence helps class-group algorithms.
It establishes only that:

- dynamic Sage semantics do not inherently require allocation and coercion at
  every mathematical operation;
- V8 can optimize a proved primitive region extremely effectively;
- Wasm crossings are cheap enough to be useful, but still need batching or
  residency for tiny arithmetic;
- Sage.js controls both its compiler and its coercion model, so it can legally
  erase public objects across user-written regions when their observation is
  impossible; and
- legality, representation, target choice, and profitability must be modeled
  independently.

The negative control is equally informative. Replacing `GF(65521)` by
`GF(97^2, 'a')` makes the same source dramatically slower because the proof of
concept does not understand an extension-field representation. Adding a
special case for that exact loop would reproduce the problem at a larger
scale. Sage.js instead needs compiler structure that can support many
mathematical domains without turning the frontend into a list of benchmark
patterns.

## Relationship to the existing architecture

This RFC is subordinate to [`ARCHITECTURE.md`](../ARCHITECTURE.md). In
particular:

- mathematical source remains ordinary CPython-parseable Python;
- optimized code is derived from the actual source region, not selected from a
  function name;
- every optimized region retains a correct dynamic fallback;
- external mathematical libraries remain preferred over recreating their
  substantial algorithms;
- `@native` cores remain completely isolated from Python, JavaScript,
  Node-API, and interpreter callbacks after marshalling;
- Wasm and native ABIs use packed storage, explicit ownership, and coarse
  boundaries;
- exactness, exceptions, mutation, and observable Sage/Python behavior are not
  changed by optimization; and
- generated IR and target code retain source provenance and remain
  inspectable.

The measured target-selection evidence remains in
[`architecture/EXECUTION-TIER-PERFORMANCE.md`](../architecture/EXECUTION-TIER-PERFORMANCE.md).
The current recurrence's deliberately limited correctness argument is in
[`bench/finite-field-boundary/PROOF-OBLIGATIONS.md`](../bench/finite-field-boundary/PROOF-OBLIGATIONS.md).

## Lessons to take from Mojo, MLIR, and mature compilers

The newly open-source Mojo compiler is useful as an architectural reference,
not as a dependency or a template to copy literally. Its compiler uses several
MLIR dialects at different semantic levels: source-level LIT IR, parametric
KGEN/POP IR, elaborated concrete IR, and finally LLVM IR. Semantic and lifetime
facts survive until the passes that need them have run. Parametric function
bodies may remain in precompiled IR and be elaborated only after concrete
parameters are known.

Relevant primary references are:

- [Mojo compiler walkthrough](https://github.com/modular/modular/blob/main/KGEN/docs/MojoCompilerWalkthrough.md);
- [Mojo passes and IR guide](https://github.com/modular/modular/blob/main/KGEN/docs/manual/PassesAndIR.md);
- [Mojo origin design](https://github.com/modular/modular/blob/main/mojo/proposals/origin-design.md);
  and
- [historical KGEN design overview](https://github.com/modular/modular/blob/main/KGEN/docs/DesignOverview.md),
  which is explicitly historical but contains useful principles about
  modularity, extensibility, AOT/JIT coexistence, fast compilation, and
  performance evidence.

Sage.js should adopt these general lessons:

- keep multiple abstraction levels rather than erasing semantics immediately;
- separate verification, analysis, transformation, and lowering passes;
- preserve alias, lifetime, parent, and effect facts until no later pass needs
  them;
- specialize after relevant mathematical parameters are concrete;
- make pass pipelines and before/after IR inspectable;
- verify invariants at boundaries between IR levels;
- cache deterministic intermediate representations; and
- allow multiple targets to consume the same proved mathematical region.

Sage.js should **not** adopt MLIR or rewrite its compiler in C++ as part of this
RFC. Its dynamic Python/Sage semantics, JavaScript target, browser constraints,
and existing source-transparent native compiler justify a much smaller
purpose-built middle end. MLIR can be reconsidered later as an optional backend
or interchange format if concrete evidence supports it.

## Goals

1. Make representation-aware optimization a reusable compiler facility.
2. Preserve exact Sage/Python behavior under speculative optimization.
3. Let V8, Wasm, `@native`, and mature libraries compete as targets for the
   same proved computation region.
4. Prevent silent performance loss through route assertions and reviewed
   performance ceilings.
5. Make optimization decisions understandable to developers and agents.
6. Support incremental delivery through small mathematical witnesses.
7. Enable parallel implementation without independent passes inventing
   incompatible semantic models.
8. Keep compilation and browser startup costs bounded.

## Non-goals

This RFC does not propose:

- a general optimizing Python implementation;
- replacement of V8's own JIT compiler;
- automatic optimization of arbitrary reflection, monkey-patching, callbacks,
  generators, or dynamically changing classes;
- changing public field elements globally into primitive numbers;
- a new mathematical algorithm for class or unit groups;
- lowering every scalar operation through Wasm or Node-API;
- adopting MLIR, LLVM, Mojo, Julia, Cython, or Numba as Sage.js's frontend;
- a runtime autotuner that performs expensive stochastic search during normal
  evaluation;
- weakening exactness or proof semantics for speed; or
- making optimization success depend on a particular Python function name.

## Proposed compiler levels

The names below describe responsibilities. They do not require four unrelated
serialized formats, and the implementation should remain small.

```text
Sage/Python source
       |
       v
Sage Semantic IR
       |
       v
Mathematical IR
       |
       v
Representation IR
       |
       +----------------+-----------------+------------------+
       v                v                 v                  v
optimized JS       resident Wasm       @native          generic runtime
```

### Sage Semantic IR

This level preserves behavior that an ordinary Python or Sage program can
observe. Its operations include:

- name and attribute lookup;
- calls and dynamically dispatched binary operations;
- Sage coercion and parent construction;
- control flow and exception edges;
- object identity, mutation, and possible callbacks;
- iteration semantics, including final loop-target binding;
- source ranges and lexical scope; and
- reads and writes of module, closure, and object state.

The current AST and binding information can seed this level. The essential
change is to form explicit basic blocks or structured regions and make effects
queryable instead of inferring them again in every emitter special case.

### Mathematical IR

This level is admitted only after sufficient static evidence or planned
runtime guards identify mathematical meaning. Representative operations are:

```text
math.parent.cast
math.ring.add
math.ring.sub
math.ring.mul
math.ring.neg
math.field.inverse
math.field.pow_integer
math.polynomial.evaluate
math.matrix.row_reduce
```

An operation retains:

- its originating semantic operation and source range;
- parent identity or parent variable;
- algebraic domain and required laws;
- exception behavior;
- effect summary;
- fallback operation;
- exactness requirements; and
- evidence for every inferred fact.

Mathematical IR must not assume a storage representation or target. A
`math.ring.mul` may later use Number residues, an extension-field tuple, a
BigInt, a Wasm-resident object, a native FLINT resource, or the generic Sage
object path.

### Representation IR

This level chooses concrete value and storage forms. Initial candidates are:

- `boxed-sage-value`;
- `number-residue(p)` for word-sized prime or modular rings;
- `extension-tuple(p, k, modulus)` for small fixed-degree fields;
- fixed-layout scalar records;
- packed typed-buffer slices;
- JavaScript BigInt where it is demonstrably profitable;
- Wasm-resident handles with explicit lifetime and generation;
- generated native resources; and
- sealed values returned by mature libraries.

Representation conversion is explicit. Boxing, unboxing, copying, borrowing,
materialization, resource allocation, and cleanup are operations with cost and
effect information. A region is not considered optimized merely because its
arithmetic instruction is fast while every value crosses a costly conversion
boundary.

### Target IR and lowering

The target layer chooses among:

- monomorphic JavaScript intended for V8 scalar replacement and numeric JIT;
- a fused or resident Wasm region with a bounded ABI;
- a source-transparent isolated `@native` core;
- a declared call to a mature mathematical library; or
- the unchanged generic semantic region.

Target selection consumes the same Mathematical and Representation IR. It may
not independently rediscover mathematical meaning from source spelling.

## Analysis facts

Facts are explicit compiler values with provenance and invalidation rules. At
minimum the first implementation needs:

| Fact | Meaning |
| --- | --- |
| `ParentIdentity` | Values have one specific parent or the same guarded parent |
| `ParentStable` | Relevant parent parameters cannot change during the region |
| `MethodStable` | Operator and constructor identities match reviewed implementations |
| `CanonicalValue` | The underlying representation is normalized |
| `NoEscape` | An intermediate value cannot be observed outside the region |
| `NoAlias` | Writes cannot change another live value unexpectedly |
| `EffectSummary` | Reads, writes, calls, allocation, throwing, and callback behavior |
| `NoCallback` | No user code can execute and invalidate entry guards mid-region |
| `ExactRange` | Machine arithmetic remains exact for every intermediate |
| `FixedShape` | Degree, dimensions, strides, or tuple width are invariant |
| `OperationClosed` | Results remain in the same mathematical domain |

Each fact records one of:

- a static derivation from binding, control flow, or declared semantics;
- a runtime entry guard;
- an imported declaration or representation contract; or
- a conservative unknown value.

Unknown does not mean false, but it prohibits transformations that require the
fact. Passes may introduce guards only when failure can execute the untouched
fallback before any externally visible optimized side effect occurs.

## Regions, guards, and fallback

The initial optimizer handles transactional regions:

- all public inputs are validated before optimized mutation;
- intermediate optimized values do not escape;
- entry guards execute before the first visible side effect;
- the optimized region either completes successfully or reports a defined
  exception without publishing partial state;
- public objects are materialized at observable exits; and
- guard failure executes the original semantic region from its original
  inputs.

JavaScript's single-threaded execution helps only after `NoCallback` is
established. A getter, proxy, overloaded operator, iterator callback, signal
hook, or foreign call may otherwise mutate prototypes or parent state while a
region is running.

The first implementation should not support arbitrary mid-region deoptimization.
If a necessary condition cannot be checked at entry, the region remains
generic. Later work may add safe checkpoints for bounded, side-effect-free
regions, but it must specify reconstruction of every observable value.

## Pass organization

The compiler should have a deterministic pass manager. Each pass has a stable
ID and declares:

- accepted IR level and required schema version;
- analyses and facts it consumes;
- operations and facts it may produce;
- facts it invalidates;
- semantic invariants it preserves;
- possible guards and fallback identity;
- supported targets;
- expected compilation and code-size cost;
- verifier run after the pass; and
- required test and benchmark evidence.

Initial pass families are:

1. **Canonicalization:** construct control flow, make coercions explicit, and
   normalize equivalent source shapes.
2. **Analysis:** binding stability, effects, aliases, escape, parent
   propagation, shapes, and numeric ranges.
3. **Mathematical recognition:** replace proved semantic operation groups with
   target-neutral Mathematical IR.
4. **Region formation:** find maximal or deliberately bounded regions with
   compatible facts.
5. **Representation planning:** assign representations and explicit
   conversions.
6. **Profitability and target selection:** compare complete region costs.
7. **Versioning:** create entry guards, optimized region, and exact fallback.
8. **Target lowering:** emit JavaScript, Wasm, isolated native code, library
   boundaries, or generic code.
9. **Verification:** reject incomplete lowering, invalid facts, unowned
   resources, missing fallback, or unexplained semantic changes.

Analysis results are cached per IR revision and invalidated mechanically. A
transformation must not silently reuse a fact produced for an earlier region.

## Cost model and target selection

Profitability uses the complete region:

```text
estimated total = arithmetic
                + representation conversions
                + boundary crossings
                + copied bytes
                + allocation and cleanup
                + target compile/instantiate/load cost
                + public result materialization
```

Initial policy should use deterministic reviewed thresholds rather than
runtime search. Inputs include:

- estimated operation count and trip count;
- shape and representation size;
- whether data is already resident in a target;
- expected crossing count and copied bytes;
- cold versus repeated execution likelihood;
- engine, operating system, and architecture;
- code-size and browser-startup budgets; and
- availability of an authenticated target artifact.

The expected initial decisions are:

| Region | First candidate |
| --- | --- |
| Small monomorphic scalar loop | Guarded unboxed JavaScript |
| Repeated packed arithmetic | Resident or batched Wasm |
| Substantial typed source region | `@native` |
| Factorization, HNF/SNF, Arb/Acb, ideal algorithms | Mature library call |
| Polymorphic or observable dynamic behavior | Generic runtime |

There is no permanent preference order independent of residency and region
shape. One scalar Wasm call per mathematical operator is specifically not the
default design.

## Optimization levels and developer controls

The stable public surface should remain small:

| Level | Intended policy |
| --- | --- |
| `O0` | Generic semantics plus mandatory correctness lowering; no speculative regions |
| `O1` | Cheap non-speculative canonicalization and local simplification |
| `O2` | Default guarded representation specialization and bounded fusion |
| `O3` | Larger regions and higher compilation/code-size budgets |
| `Os` | Prefer smaller artifacts and less fast/slow code duplication |

All levels produce identical mathematical results and observable exceptions.
The levels select profitability policy, not different semantics.

Developer controls should include:

```text
SAGEJS_OPT_LEVEL=O0|O1|O2|O3|Os
SAGEJS_OPT_DISABLE=<comma-separated stable pass IDs>
sagejs --explain-optimizations program.sage
sagejs --require-optimization=<pass or region ID> program.sage
```

Names remain provisional until implemented. Tests and benchmarks may use
internal equivalents first. Production code must not branch directly on a
large set of unstable pass flags.

## Explainability contract

Every considered region receives a stable identity derived from source
provenance and semantic structure. Explanation output records:

- source range and region identity;
- candidate mathematical domain;
- proven, guarded, and unknown facts;
- candidate representations;
- candidate targets and complete cost estimates;
- selected representation and target;
- rejected alternatives with stable reason codes;
- emitted guards;
- exact fallback identity;
- expected crossings, copied bytes, and materializations; and
- cache identity inputs.

For example:

```text
region recurrence@demo.sage:8:5
  mathematical-domain: GF(97^2)
  selected-representation: extension-tuple<number, 2>
  selected-target: v8
  guards:
    parent-identity
    defining-polynomial-identity
    operator-method-identities
  facts:
    no-escape: static
    no-callback: static
    exact-range: static under guarded p=97
  rejected:
    wasm-resident: cold-transfer-cost
    native: compilation-cost
  materializations: 1
  fallback: semantic-region sha256:...
```

`--require-optimization` fails if the named region is absent, rejected, selects
an unexpected fallback, or loses its required target. It is a test and
benchmark ratchet, not a mechanism for making semantically unsafe code compile.

## Testing and proof discipline

No optimization is accepted on a headline benchmark alone.

### Semantic differential testing

Run the same source with the candidate pass enabled and disabled. Compare:

- return values and canonical serialization;
- exception types, messages where contractual, and timing relative to visible
  side effects;
- final loop-target bindings;
- public object parents and representations where observable;
- mutations and alias-visible state;
- resource counts and cleanup; and
- interrupt, timeout, reset, and worker-recovery behavior.

### Generated and held-out programs

Use grammar-based generation to vary:

- equivalent source spellings;
- local names and lexical nesting;
- branches and zero/one/many trip counts;
- operand order and temporary variables;
- parent construction and reuse;
- modulus and defining polynomial;
- exceptional operands; and
- values near every exactness bound.

At least one held-out corpus must be owned independently from the pass's
implementation examples. Adding another accepted syntax shape requires corpus
evidence, not another direct emitter condition.

### Adversarial semantics

Tests force rejection or exact behavior under:

- monkey-patched methods and changed prototypes;
- parent mutation where supported;
- aliases and escaping intermediates;
- getters, proxies, callbacks, and iterators;
- shadowed builtins;
- Number/BigInt representation changes;
- arithmetic outside the exact machine bound;
- invalid or stale Wasm/native handles; and
- interruption at every resource-owning boundary.

### IR and verifier testing

- Snapshot small canonical IR examples with stable schema versions.
- Test every verifier against malformed IR.
- Run every transformation with before/after verification.
- Test pass-order changes and analysis invalidation.
- Preserve source provenance through every level.
- Reject target lowering when any Mathematical or Representation operation is
  unhandled.

### Performance testing

Each promoted optimization includes:

- cold and warm timing distributions;
- compiler, instantiate, and load time;
- generic, optimized JavaScript, Wasm, `@native`, and relevant CAS/library
  comparisons;
- boundary count, copied bytes, allocation count or proxy, and resource
  high-water mark;
- a microbenchmark isolating the representation decision;
- a representative public workload; and
- a loose reviewed ceiling that catches loss of the intended execution tier.

Performance tests run on Node and the production artifact in Chromium,
Firefox, and WebKit when the optimization is browser-relevant. Platform
receipts record source, artifact, corpus, engine, host, and result hashes.

## First new vertical slice: `GF(p^2)`

### Why this witness

`GF(97^2)` is mathematically crisp and currently provides a vivid negative
control. It introduces multiple primitive components and a defining polynomial
without the algorithmic ambiguity of class groups. It is small enough to
inspect completely but broad enough to force reusable support for shape,
parent parameters, multi-value representation, materialization, and target
selection.

### Initial semantic domain

The first slice supports bounded regions over one fixed `GF(p^2)` parent with:

- construction from constants and existing field elements;
- addition, subtraction, negation, and multiplication;
- equality used only in compiler-understood control flow;
- assignments and non-escaping temporaries;
- bounded `range` loops; and
- one or more materialized outputs at region exits.

Division, inversion, general exponentiation, dynamically changing parents,
arbitrary Python callbacks, escaping intermediate objects, and dynamic
extension degree remain generic until separately specified.

### Candidate representation

Represent an element in a fixed polynomial basis as two primitive coefficient
locals. Multiplication specializes to the guarded defining polynomial and
reduces coefficients modulo `p`. Range analysis proves every Number
intermediate is an exact integer below `2^53`; otherwise the candidate is
rejected.

The representation planner must compare:

1. two Number locals lowered to JavaScript;
2. a fused region in Wasm, with inputs and outputs crossing once;
3. the same source-transparent region through `@native`; and
4. the existing exact boxed implementation.

It must not implement one Wasm call or allocate one Wasm resource for every
field addition or multiplication.

### Workload corpus

The corpus contains multiple source shapes rather than one recurrence:

- dependency-chained multiply-add;
- two interacting accumulators;
- polynomial evaluation by Horner's rule;
- a short linear recurrence with a data-dependent equality branch;
- dot products over existing field elements; and
- zero-trip and exceptional/fallback controls.

Run across several primes and irreducible quadratic moduli, including small
characteristics and cases near the accepted Number exactness bound. Compare to
the generic Sage.js implementation, CPython/Sage where practical, direct
finite-field formulas, and at least one mature CAS.

### Research acceptance criteria

The slice is successful when:

- every enabled/disabled differential and adversarial test passes;
- the same source region can lower to at least optimized JavaScript and one
  isolated Wasm or native target;
- the selected hot target is within 2x of a hand-written implementation using
  the same representation on the reviewed recurrence corpus;
- the public optimized region is at least 20x faster than the current generic
  `GF(97^2)` path on the primary measured host;
- browser tests pass on Chromium, Firefox, and WebKit;
- loss of the optimized route fails a performance/selection ratchet;
- compile latency, generated size, and resource limits remain within reviewed
  budgets; and
- no source spelling or benchmark constant is embedded in target lowering.

These thresholds evaluate the research slice; they are not a permanent API or
universal performance promise.

## Migration of the existing recurrence

The current prime-field recurrence remains useful as a bootstrap witness. Its
migration proceeds as follows:

1. Express its control flow and semantic operations in the new high-level IR.
2. Reproduce its existing binding, alias, mutation, exactness, and parent facts
   through reusable analyses.
3. Form the same guarded mathematical region.
4. Select the existing Number-residue representation.
5. Emit behavior equivalent to the current optimized and generic versions.
6. Re-run the exact Node and three-browser tests and the 5.3 ns-class benchmark.
7. Remove the direct frontend/emitter recognizer once parity is established.

This is intentionally a no-new-speed milestone. It proves that the new middle
end can carry an already-understood transformation without regression.

## Rollout plan

### Phase 0: approve schemas and invariants

- Review this RFC against `ARCHITECTURE.md`.
- Specify IR schemas, fact provenance, pass contracts, and verifier APIs.
- Decide which current compiler structures can be reused without premature
  serialization.
- Add a no-op pass pipeline with deterministic IR dumps.

### Phase 1: migrate the prime-field recurrence

- Reproduce current semantics and performance through the pass manager.
- Implement explain/disable/require controls for this one pass.
- Delete the superseded syntax-specific lowering.

### Phase 2: broaden prime-field regions

- Support several canonical source shapes and multiple temporaries.
- Add coercion hoisting, scalar replacement, and explicit materialization.
- Keep generated held-out differential testing ahead of accepted syntax.

### Phase 3: implement the `GF(p^2)` witness

- Add fixed-shape extension-field Mathematical and Representation IR.
- Compare V8, resident Wasm, `@native`, and generic paths.
- Promote only after the research acceptance criteria pass.

### Phase 4: compose representations

- Apply the same IR to polynomial evaluation and small fixed matrices.
- Add packed arrays and resident-region lifetime support.
- Extend to higher degree only from measured workloads.

### Phase 5: application validation

- Profile authentic algorithms phase by phase.
- Use class/unit groups, elliptic curves, graph algorithms, symbolic numerical
  work, and combinatorics as held-out consumers.
- Optimize only independently measured dominant regions.
- Treat algorithmic deficiencies separately from compiler deficiencies.

## Parallel development model

Parallel work begins only after Phase 0 establishes shared schemas. Suggested
lanes are:

- semantic/control-flow IR and verifier;
- effect, alias, escape, and stability analyses;
- Mathematical IR and parent/coercion recognition;
- representation planning and exact range analysis;
- optimized JavaScript lowering;
- resident Wasm lowering and lifetime accounting;
- `@native` region lowering;
- differential generation and adversarial testing;
- performance harnesses and cross-engine receipts; and
- one integration lane owning shared schemas, registries, CLI controls, and
  pass ordering.

Each lane claims narrow files and consumes versioned contracts. A domain lane
may add operations or tests but does not bypass Mathematical IR by inserting a
function-name or source-text match into a backend.

## Guardrails for AI-assisted development

AI increases implementation throughput, so architectural rejection must be
mechanical wherever possible.

A new optimization pass is rejected unless it has:

- a stable pass ID and explicit pass contract;
- an independently executable exact fallback;
- reusable analysis facts rather than source-name recognition;
- a verifier and malformed-IR tests;
- generated differential and adversarial tests;
- at least one held-out workload;
- explanation and route evidence;
- compile-time, code-size, and resource budgets;
- a representative performance result; and
- no unexplained regression in generic execution.

CI should additionally reject:

- Mathematical IR created directly in a target emitter;
- target selection based on an unqualified function name;
- an optimization without a fallback identity;
- guards executed after visible optimized side effects;
- unversioned IR/schema changes;
- unhandled target-independent operations silently falling back inside an
  optimized region;
- performance cases without reviewed baselines; and
- benchmark source duplicated as a hard-coded target implementation.

The compiler should make the correct architecture the shortest route for an
agent: define an operation, state facts, implement a verified pass, add target
lowering, and inherit diagnostics and test infrastructure.

## Risks and mitigations

### Risk: recreating a large compiler project

Keep the first IR and pass manager deliberately small. Admit operations only
for active mathematical witnesses. Do not adopt a general type system or
optimizer framework speculatively.

### Risk: guard and fallback code causes startup growth

Track generated bytes per pass, share guard helpers, and use `Os` policy for
browser builds. Lazy-load specialist target modules. A pass that saves runtime
but violates reviewed startup budgets is not production-ready.

### Risk: V8 behavior varies by engine version

Express correctness independently of JIT behavior. Benchmark every supported
Node release and browser engine with loose tier-loss ratchets. When V8 declines
to optimize, results remain correct and telemetry exposes the regression.

### Risk: Wasm appears cheap and encourages scalar APIs

Record crossings and copied bytes for every optimized region. Reject a
representation plan that crosses once per field operation unless a matched
benchmark proves it is appropriate.

### Risk: mathematical semantics are encoded twice

Mathematical IR describes meaning, not a replacement algorithm. The generic
semantic region remains the oracle and fallback. Substantial algorithms remain
ordinary Python, source-transparent typed source, or calls to mature libraries
under the existing architecture order.

### Risk: performance work hides an algorithmic problem

Require phase profiles and operation counts for application claims. Class-group
comparison must distinguish algorithm choice, candidate/relation counts,
linear algebra, certification, and representation overhead before attributing
a gap to compilation.

## Open questions

1. Should the first IR be structured-region based, full SSA, or structured IR
   lowered to SSA only for analyses that need it?
2. Which Sage coercion and parent operations can receive stable declarative
   effect summaries first?
3. Should optimized JavaScript and `@native` consume one shared Representation
   IR or sibling lowerings from Mathematical IR plus target-specific planning?
4. What is the minimum reconstruction state needed for future mid-region
   deoptimization?
5. How should engine/architecture-specific cost tables be versioned without
   making builds nondeterministic?
6. Which optimization controls should be public CLI contracts versus internal
   test interfaces?
7. When is it worth serializing and caching intermediate IR rather than only
   caching final generated artifacts?
8. Can a small translation validator check optimized regions against their
   Mathematical IR more economically than proving each compiler pass?
9. At what extension degree does scalar-tuple V8 lowering lose to packed or
   resident Wasm on each supported engine?

None of these questions blocks the Phase 0 schema prototype or migration of
the already-understood prime-field recurrence.

## Completion criteria for this RFC program

The architecture is considered established, rather than merely demonstrated,
when:

1. the prime-field recurrence no longer depends on a direct AST/emitter special
   case;
2. IR levels, facts, pass contracts, and verifiers are versioned and tested;
3. explain/disable/require diagnostics work for optimized regions;
4. `GF(p^2)` passes the research acceptance criteria through V8 and at least
   one isolated target;
5. generated differential and adversarial corpora run in Node, Chromium,
   Firefox, and WebKit;
6. performance, compilation, size, crossing, copying, and resource ratchets are
   enforced;
7. at least one polynomial or matrix workload composes the same representation
   machinery; and
8. at least one complex application uses the infrastructure successfully
   without adding an application-named compiler branch.

At that point Sage.js will have more than a fast benchmark. It will have a
small, explainable, extensible optimizing compiler architecture capable of
turning proved mathematical regions into the execution form best suited to
V8, Wasm, native code, or a mature library while preserving the exact public
semantics that make Sage useful.

## Implementation record

The completion criteria were met on 2026-08-27:

1. `tools/python/optimizer/` owns the versioned IR, facts, stable identities,
   cost model, pass manager, explanations, and verifier. The former direct
   prime-recurrence recognizer now enters this middle end.
2. `closed-ring-region` represents multi-state residue-ring and
   quadratic-extension
   computations as operation graphs, with complete costs, fallback
   provenance, materialization plans, and independently checked entry guards.
3. `O0`, `O1`, `O2`, `O3`, and `Os`, plus explain, disable, and require
   controls, are compiler and public CLI contracts with fail-closed tests.
4. `GF(p^2)` selects a scalar-tuple V8 region and the same representation can
   select the source-transparent isolated kernel in
   `src/lib/sagejs/kernels/arithmetic/gf_p2.py`.
5. Grammar-generated, held-out, independent-coordinate-oracle, malformed-IR,
   method-mutation, proxy, alias, effect, interruption, and resource tests run
   in Node, Chromium, Firefox, and WebKit.
6. `bench/optimizer-gf-p2.cjs` ratchets semantics, compilation latency,
   emitted size, crossings, copied bytes, live resources, V8 tier loss, and
   performance against handwritten JavaScript, generic Sage objects, and the
   isolated target.
7. Public polynomial evaluation composes the same extension-tuple operation
   graph without a polynomial-named backend rule.
8. An elliptic-curve batch is a held-out application consumer and receives the
   optimization without an elliptic-curve-named compiler branch.

The implementation deliberately left higher extension degrees, resident Wasm
handles, and broader application profiling beyond the initial completion
criteria.  The first post-RFC refinement, also completed on 2026-08-27,
generalized the same ring-operation IR and guarded machine representation to
fixed extension degrees two through four.  Affine operation graphs now select
compact degree-specific V8 emitters or one source-transparent isolated
native/Wasm call; Horner, multi-state, equality-branch, polynomial, and held-out
graphs continue through the general emitter.  No second syntax recognizer was
added: the former affine pass was removed, and target selection is derived from
the general field dataflow plan.

`bench/optimizer-extension-degrees.cjs` records the resulting crossover.  For
one million degree-three and degree-four recurrence steps on the reference
Node/V8 host, public compiled V8 runs within about 5--8% of matched dynamic
handwritten JavaScript and roughly 1,600--2,200 times faster than the projected
generic object path.  The coarse native target is exact and independently
useful, but V8 wins this small-word workload.  This is the intended cost-model
outcome rather than a fixed preference for a particular backend.

The next refinement generalized the affine witness from a fixed increment to
an increment drawn from the loop's guarded immutable sequence.  This covers
ordinary Horner evaluation without adding a Horner- or polynomial-named
recognizer.  The verifier distinguishes the two dataflow shapes; fixed
increments remain eligible for adaptive native/Wasm lowering, while sequence
increments select a transactional V8 target.  That target validates each
coefficient immediately before use, retains all evolving coordinates only in
primitive scalar locals, and materializes public state only after the entire
region succeeds.  If a late guard fails, it discards those private locals and
restarts the untouched generic loop, preserving Python exceptions and loop
effects without a partial commit.

This also removed an important representation cost.  General operation graphs
still prepack reusable sequence prefixes, but a single-use affine sequence is
now consumed without allocating or retaining a duplicate coordinate buffer.
`bench/optimizer-field-horner.cjs` independently checks degrees three and four
against O0 and matched scalar JavaScript.  At 200,000 coefficients on the
reference Node/V8 host, guarded public execution takes about 68 ms and 98 ms,
respectively, versus projected generic-object times of about 13.9 s and 15.9 s.
The measured scalar-JavaScript lower bounds are about 26 ms and 39 ms, making
the remaining brand, parent, prototype, and coordinate guards visible rather
than hiding them in a headline speedup.  Both routes retain zero native
resources and the late-invalid-element differential proves exact restart.

The semantic domain was then corrected from “field” to “commutative ring.”
The proved operation set never uses division, and the guarded Number-residue
representation applies equally to `Zmod(n)` with zero divisors.  The renamed
`math.closed-ring-region.v1` contract now states that fact explicitly, and its
runtime parent guard advertises commutative multiplication rather than relying
on which classes happen to use the representation today.  Differentials cover
composite moduli, the largest exact machine modulus, and the first modulus
outside the bound.  Operation-graph normalization consequently accepts
commuted addition and multiplication order plus signed sequence increments;
these are justified by a verified commutative-ring fact rather than by source
spelling.  Compact residue-ring results also retain the private representation
brand, with a chained-block route ratchet preventing silent loss of subsequent
optimization.

Straight-line operation graphs now also carry verified per-sequence and
per-index-view use counts.  The representation planner streams one or two
immutable sequence views with up to eight static uses, which covers guarded
dot products and repeated expressions such as `values[i] * values[i]` without
workload-named recognizers.  Lowering validates and unboxes each distinct view
once per iteration, then reuses its primitive scalar coordinates throughout
the operation graph.  Three-or-more views and control-flow graphs retain the
packed-prefix strategy.  `bench/optimizer-field-dot-product.cjs` ratchets the
streaming choice over both a residue ring and a cubic extension field against
independent coordinate oracles and projected O0 execution; an intentionally
packed upper-bound experiment remains documented only as diagnostic evidence,
not as a matched headline comparison.

Equality control flow is represented as one canonical mathematical predicate
plus an explicit branch polarity.  Both `==` and `!=` therefore consume the
same guarded pure ring-equality operation, while the target-neutral verifier
rejects unknown comparison kinds or polarities.  The generated differential
grammar deliberately mixes both spellings across reviewed prime and extension
fields, preventing a source-level inequality from silently falling out of the
optimized region or acquiring a second representation-specific implementation.

Natural tuple-unpacking loops now enter the same operation graph when their
iterator is the compiler-proven builtin `zip`, has two through four plain
symbol inputs and distinct plain symbol targets, and uses either default or an
exact Boolean `strict` option.  The plan records target-to-sequence bindings
instead of rewriting the source into an index loop.  Runtime versioning first
evaluates every input in source order, accepts only branded immutable tuples,
and proves either the shortest-prefix contract or equal lengths for strict
iteration.  A failed contract executes the untouched `zip` loop, including its
precise mismatch exception and partial-iteration effects; a late element guard
also restarts transactionally.  Successful lowering materializes both ring
state and final loop targets, while zero trips preserve unbound targets.

`bench/optimizer-zip-region.cjs` compares the natural strict-zip spelling with
the already-optimized indexed spelling over 100,000 terms.  On the reference
Node/V8 host, `Zmod(1009)` took 18.51 ms versus 18.01 ms (1.03x), and
`GF(5^3)` took 69.13 ms versus 69.15 ms (1.00x).  Thus recognizing the more
idiomatic mathematical source introduces no material steady-state iterator
tax.  Projected O0 zip execution was about 96x and 144x slower respectively;
the benchmark separately checks both public answers against an independent
JavaScript coordinate oracle.

Augmented assignments `+=`, `-=`, and `*=` are normalized into the same ring
expression DAG only after preserving their distinct Python dispatch contract.
Each assignment records its source operator, the verifier independently checks
that its normalized root reads and updates the same slot, and the plan records
the exact set of in-place fallbacks it requires.  Entry versioning walks each
live value's complete descriptor chain with descriptor inspection (never
getter invocation) and requires the corresponding `__iadd__`, `__isub__`, or
`__imul__` descriptor to be absent.  Any own or inherited customization
therefore executes the original augmented assignment.  Until an isolated
target carries the same proof, augmented graphs deliberately select V8 rather
than being misclassified as affine native/Wasm recurrences.

The zip benchmark also compares augmented and ordinary spellings over the
same 100,000-term dot product.  Fresh medians were 18.01 ms versus 18.46 ms for
`Zmod(1009)` and 61.11 ms versus 62.49 ms for `GF(5^3)`; the small differences
are noise-level wins rather than an augmented-operation penalty.  Projected O0
augmented execution was about 130x and 170x slower.  Differential tests cover
all three operators across both representations, and callable mutations of
all three `__i*__` descriptors prove the exact fallback path.

Immutable sequence views are now represented explicitly in the same IR rather
than being materialized in mathematical source.  A compiler-known builtin
`reversed(sequence)` contributes a reverse index map only when its operand is a
single symbol; runtime lowering then requires the same private immutable-tuple
brand as every other sequence region.  Shadowed builtins, lists, proxies, and
failed element guards execute the original `reversed` iterator, including
transactional restart after a late failure.  Extension-field polynomials reuse
their construction-time coefficient tuple, so repeated public Horner
evaluation no longer allocates a reversed list and second tuple per call.
`bench/optimizer-polynomial-evaluation.cjs` compares that public path with a
forced generic-list oracle and ratchets exact independent coordinates, route,
tuple identity, resource closure, latency, and projected speedup.

Per-iteration sequence commoning is covered separately by
`bench/optimizer-sequence-commoning.cjs`.  It exercises a repeated-read sum of
squares over both a word residue ring and a cubic extension field using the
source-level `x^2` operation, with
independent scalar-coordinate oracles.  The compiler test also inspects emitted
JavaScript and requires exactly one sequence load in each fixed-shape target
variant, so duplicate element/property guards cannot silently return.

Value numbering now extends across adjacent statements in the same straight-line
block.  Every slot carries a compiler-only version that advances after a write;
structural expression keys include those versions.  Thus two accumulators can
share an expensive `item*item`, while an intervening update of `item` makes the
second square distinct.  Conditional arms inherit independent copies of the
incoming versions and available expressions, and the join advances epochs and
clears availability, so a value computed on only one path is never reused after
the branch.  The recognizer, independent verifier, code-size estimator, and
emitter implement the same version transition rules.

`bench/optimizer-cross-statement-commoning.cjs` exercises a two-accumulator
symmetric product loop over both `Zmod(1009)` and `GF(5^3)`.  It checks exact
results against independent JavaScript coordinate oracles, compares with a
matched O0 prefix, ratchets the selected representation route, and requires
zero retained native resources.

Value-numbering keys also use the guarded mathematical fact that these parents
are commutative rings.  Addition and multiplication trees flatten their
already-versioned operands and sort the resulting multiset, so `x*y` and `y*x`,
as well as `(x*y)*z` and `x*(z*y)`, share a primitive result.  The first
expression still evaluates with its source grouping and order; this canonical
key does not reorder Python effects or change emitted arithmetic.  Subtraction
keys remain ordered, and distributive expansion is deliberately absent.  The
recognizer, verifier, cost model, code-size model, and emitter independently
apply the same bounded associative-commutative normalization.

The region data-flow proof now distinguishes loop live-ins, modified live-outs,
and iteration-local slots.  A local is admitted without an entry value only if
structured definite-assignment analysis proves it is assigned on every path
before use and on every path through one nonempty iteration.  Locals are emitted
as uninitialized primitive slots, participate in versioned value numbering,
and are materialized only once as ordinary Python variables after successful
transactional completion.  This both accepts idiomatic named intermediates and
fixes the old lowering's premature read of a body-defined Python local.

The verifier independently derives the exact input, state, and local slot lists
from the statement graph.  A stage-one compatibility default exists only in the
self-hosting output generator so the immediately previous compiler can build
the new compiler; every newly produced plan must carry and pass the exact data-
flow claims.  `bench/optimizer-local-temporaries.cjs` measures a three-stage
polynomial identity with two named intermediates over `Zmod(1009)` and
`GF(5^3)`, using independent coordinate oracles, a matched O0 prefix, route and
resource ratchets, and final temporary-value checks.

Pure operation subgraphs whose slots are all live-ins and absent from the
complete modified-slot set are now explicit preheader values.  The analysis
simulates versioned value availability in source order, so it hoists only
subgraphs that the loop would otherwise evaluate; a later expression hidden by
whole-expression commoning cannot create dead preheader code.  Hoisted values
remain available across conservative control-flow joins, while any expression
depending on a sequence element, local, or loop-carried state remains inside
the loop.

Plans record `preheaderOperationCost` separately from per-iteration
`operationCost`, and admission still bounds their sum.  The independent
verifier reconstructs the exact hoisted expression list, both costs, and the
combined outlined target size.  The strengthened cross-statement benchmark now
uses `(x*y)*(a*b)` and `(b*a)*(y*x)`: `a*b` executes once after the guard, and
the regrouped four-factor value executes once per iteration for two
accumulators.

The plan now retains two explicit statement graphs: `semanticStatements`
records every recognized source operation, while `statements` is the lowered
graph after backward liveness removes overwritten pure assignments.  All
modified bindings are live at the loop boundary, so final Python-visible
values and cross-iteration state remain conservative; only a store overwritten
on every path before any read can disappear.  A dead conditional disappears
only when both lowered arms are empty.

This is deliberately not permission to forget the source operation.  Parent
and method guards are derived from `semanticStatements`, including operations
that lowering removes, so a monkey-patched method rejects the optimized region
and executes the untouched source with its effects.  The independent verifier
reconstructs the exact lowered graph and eliminated-assignment count, derives
the complete source operation mask, and then computes hoisting, commoning,
cost, code size, and sequence strategy from the verified lowered graph.
Source and lowered sequence-use summaries remain separate: streaming validates
every distinct source view, including a read used only by an eliminated store,
while its profitability bound counts uses in the reduced graph.  A late invalid
element in such a dead read therefore still triggers transactional restart and
the original loop's exact behavior.

The target-independent expression graph also represents statically bounded
powers `x^e` for exact nonnegative safe-integer exponents.  These are not spelling
rewrites to multiplication: the runtime guard authenticates the selected
parent's `__pow__` implementation before the region enters primitive
representation space.  Lowering evaluates the base once and constructs a
binary-exponentiation DAG with shared squares through the same reviewed exact
modular product generator.  Admission is governed by the independently
recomputed multiplication cost, not an arbitrary numeric exponent cutoff:
`x^65537` needs only 17 products and is eligible, while a dense 53-bit exponent
exceeds the 64-operation region budget.  Unsafe, negative, dynamic, or
excessively costly exponents, changed power descriptors, and unreviewed parents
execute the untouched source loop.

`bench/optimizer-static-power.cjs` exercises this distinction with
`x^19-x^65537` over `Zmod(1009)` and `GF(5^3)`.  The benchmark uses independent
JavaScript binary-power coordinate oracles and a matched O0 prefix.  Fresh warm
medians after compact lowering for 20,000 iterations were 3.73 ms and 150.33 ms
respectively, approximately 120x and 142x faster than projected O0 execution;
both guarded
streams retained zero native resources.

The code-size budget is now an analyzed IR property rather than descriptive
pass metadata.  Each plan records a conservative degree-four outlined-target
estimate: coordinatewise operations cost four units, scalar extension
products cost 32, statement-local commoning is reflected exactly, and powers
requiring more than one product use a constant-size shared helper.  The
verifier recomputes the estimate and rejects any target over 32 KiB.  This
closed a measured failure where a sparse large power expanded a 1.1 KiB O0
loop to 167 KiB of generated JavaScript.  The compact form is 9.5 KiB; a
16-statement affine graph that would emit roughly 169 KiB is rejected before
lowering.

The pass now records an exact per-iteration operation cost derived from its
target-independent graph.  The independent verifier recomputes that value and
rejects stale plans or costs above 64 before lowering.  Power cost counts the
actual multiplication DAG rather than the numeric exponent; branch cost
includes both emitted alternatives.  This makes the pass's compile/code-size
budget enforceable and prevents large generated source bodies from silently
replicating across the four fixed-shape V8 variants.

The generic extension-field power implementation now propagates its optional
fixed-width coordinate shadow by exact binary exponentiation for every
nonnegative exponent.  This is a composability invariant, not merely a local
speed trick: a correct generic operation must not needlessly make its result
ineligible for a later guarded region.  Negative powers retain their exact
FLINT behavior without inventing an unproved coordinate inverse.  A focused
test ratchets powers `0`, `2`, `3`, and `19` against rematerialized elements.
With source-level squaring enabled, the commoning benchmark measured fresh
warm medians of 6.36 ms for 100,000 residue-ring iterations and 40.26 ms for
100,000 cubic-extension iterations on the development host, approximately
142x and 315x faster than projected O0 prefixes respectively; both paths
retained zero native resources.

Structured equality branches now use the same transactional sequence streamer
as straight-line graphs when there are at most two immutable index views and
eight static sequence uses.  This does not speculate through arbitrary Python
control flow: conditions remain exact guarded ring equality, branch bodies are
verified local ring assignments, and a late element failure discards primitive
locals and restarts the untouched loop from its original live-ins.  The
independent verifier derives the streaming decision from the operation graph.
`bench/optimizer-branching-region.cjs` ratchets a mixed equality/add/subtract/
multiply/square state machine over both a residue ring and a cubic extension
field against independent JavaScript coordinate oracles.  Fresh warm medians
for 100,000 iterations were 6.08 ms and 44.33 ms respectively, approximately
166x and 386x faster than projected O0 prefixes, with zero retained native
resources.

Within one assignment or equality condition, lowering now treats the verified
ring expression as a DAG rather than a tree.  Structural value numbering
evaluates identical subexpressions once, including repeated products and
powers, then reuses their primitive coordinates.  This transformation is
guarded by an explicit `referentially-transparent-used-operations` fact: it is
only valid after the canonical parent, representation brand, and every used
method identity have been authenticated.  Caches reset at each sequential
assignment and branch body, so a slot redefinition cannot reuse a stale value;
the generic fallback retains the source's original dispatch count.  Operation
cost is computed from this same statement-local DAG, and the verifier derives
it independently.  The sequence-commoning benchmark now repeats the same
square twice per iteration, while emitted-code tests require the repeated form
to contain exactly as many multiplication tokens as the single-square form.
Fresh warm medians for 100,000 repeated-square iterations were 4.57 ms over
`Zmod(1009)` and 27.66 ms over `GF(5^3)`, approximately 309x and 840x faster
than projected O0 prefixes, with exact independent answers and zero retained
native resources.
