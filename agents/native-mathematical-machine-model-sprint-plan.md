# Native mathematical machine model compiler sprint

## Purpose

This sprint pauses further class-and-unit-group micro-optimization long enough
to make Sage.js's source-transparent `@native` compiler a substantially better
language for exact computational mathematics.

The immediate motivation is the class-and-unit-group implementation, but the
deliverable is not a collection of class-group special cases. It is a small,
safe mathematical machine model expressible as ordinary CPython-parseable
Python and lowerable to isolated native C and WebAssembly. It should let a
mathematical author write bounded phase-sized algorithms using natural exact
containers, views, mutation, and lexical workspaces without manually encoding
every live value into caller-owned flat buffers.

This plan complements:

- [`ARCHITECTURE.md`](../ARCHITECTURE.md), which defines the implementation
  hierarchy and source-transparency rules;
- [`bench/NATIVE-COMPILER.md`](../bench/NATIVE-COMPILER.md), which documents
  the current Native Kernel compiler;
- [`competitive-class-and-unit-groups-strategy.md`](competitive-class-and-unit-groups-strategy.md),
  which defines the broader performance program; and
- [`number-field-class-and-unit-groups-plan.md`](number-field-class-and-unit-groups-plan.md),
  which defines the mathematics and public APIs.

The sprint is successful when real class-group hot phases can be written more
naturally, execute on live exact data without repeated packing, remain bounded
and auditable, and become materially faster end to end on native and Wasm.

## Executive decision

Pause new class-group representation micro-optimizations after the current
small, already-measured change is completed and recorded. Then implement the
compiler facilities in witness-driven waves. Resume broad mathematical
optimization as soon as the first real relation/presentation witness uses the
new machine model successfully; do not wait for a hypothetical general
language to be complete.

This is not a compiler rewrite. Native Kernel v22 already has the difficult
foundations: typed source lowering, exact scalar promotion, direct compiled
call graphs, fixed-capacity arbitrary-precision buffers, isolated C cores,
declared FFI ownership, dynamic fallbacks, inspectable provenance, and Wasm
production paths. The sprint extends those foundations with an explicit
storage and lifetime vocabulary.

## Why now

Recent class-group profiling has exposed a recurring boundary rather than one
isolated slow loop:

- the mathematical policy is readable in Python;
- the native kernels are fast once data is in the right representation;
- the surrounding code manually flattens matrices, ideals, rows, metadata, and
  scratch space into many `IntegerBuffer` arguments;
- fixed-limb packed buffers are repeatedly decoded to GMP values, mutated, and
  encoded again;
- bounded dynamic structures such as relation rows and lookup tables cannot be
  expressed directly;
- exact records cannot yet contain exact buffers or nested records;
- ownership is available for declared FFI resources, but not as a general
  mathematical workspace abstraction; and
- missing `break`, `continue`, and structured cleanup force awkward source or
  oversized kernels.

A direct compiler probe of an indexed exact update such as
`output[i] += left * right` confirms the issue. The generated large-integer C
path reads a packed slot into `mpz_t`, performs `mpz_mul` and `mpz_add`, then
writes the value back into the packed slot. That is correct and useful for an
ABI, checkpoint, or detached proof payload. It is the wrong representation for
a live accumulator touched thousands of times.

Continuing to optimize around that boundary would create more one-off caches,
identity seals, offset protocols, and handwritten workspace plumbing. The
compiler sprint should make those patterns first-class once, with enforced
safety and shared native/Wasm semantics.

## Objective

Add a deliberately small pure-Python vocabulary for:

1. lexical bounded arenas;
2. typed owners, borrowed views, and shaped slices;
3. live exact integer vectors and matrices;
4. explicit in-place exact arithmetic;
5. bounded vectors, maps, sets, and sparse rows;
6. exact and nested native records;
7. safe early exits and compiler-generated cleanup; and
8. owned result aggregates where a real witness requires them.

The compiler must prove bounds, ownership, lifetime, and alias requirements or
reject the source. There are no raw pointers, unchecked allocation, hidden
callbacks, or implicit unbounded Python containers.

## Non-negotiable invariants

The following parts of the current architecture are strengths and must not be
traded away for convenience:

### Ordinary Python remains the source

- Mathematical `.py` files remain ordinary CPython-parseable source.
- `@native` remains a no-op under CPython.
- The dynamic Sage.js execution of that same function remains a correct
  differential fallback.
- The compiler lowers the actual typed source body; it never selects an
  unrelated implementation by function name.

### Host isolation remains absolute

- A compiled mathematical core contains no Node-API, CPython, JavaScript
  engine, or interpreter callbacks.
- Unsupported operations fail compilation rather than escaping to the host.
- Direct compiled callees remain in the isolated transitive call graph.

### Exactness remains explicit

- Integer operations have exact Python semantics, including alias-sensitive
  right-hand-side evaluation.
- Capacity exhaustion, arithmetic resource exhaustion, and invalid views fail
  closed with stable status values.
- A kernel cannot silently truncate, wrap signed values, weaken a proof, or
  substitute a probabilistic answer for an exact one.

### Ownership remains statically checkable

- Every allocation has one owner.
- Borrows and mutable borrows have compiler-visible scopes.
- A view cannot outlive or escape its root owner.
- Nontrivial exact entries are initialized and cleared exactly once.
- All exits, including early return and error status, perform required cleanup.
- Published output is transactional: failure does not expose a partially
  authenticated result as success.

### Native and Wasm share the model

- The same typed IR and isolated core semantics target native C and Wasm.
- Every compiled feature retains a correct dynamic fallback.
- Windows x64 remains first-class; no POSIX-only ownership trick is accepted.
- Browser resource caps are part of the design rather than a later retrofit.

### Generated code remains inspectable

- New operations retain source ranges and stable IR identities.
- `sagejs native explain`, `ir`, `emit-c`, and `emit-core-c` describe ownership,
  allocation, aliasing, cleanup, and fallback decisions.
- Cache identities include all relevant type, ABI, compiler, and backend
  changes.

## Explicit non-goals

This sprint does **not** attempt to build:

- a general Python compiler;
- Cython, Numba, Julia, Zig, or Rust inside Sage.js;
- arbitrary Python objects, dictionaries, iterators, generators, or reflection;
- raw pointers, pointer arithmetic, unchecked casts, or general `malloc`;
- a tracing garbage collector;
- arbitrary user-defined context managers;
- general exception handling inside native cores;
- automatic parallelism;
- a second foreign runtime for class groups; or
- a private compiler feature that only one named class-group function can use.

The vocabulary should be small enough to specify, test exhaustively, and
support on all backends.

## Mathematical witnesses

Features are admitted because a real exact algorithm needs them, not because
they look attractive in a language-design list. The sprint uses the following
witnesses, in this order.

### Witness A: exact accumulation without repacking

A fixed-capacity exact vector repeatedly executes indexed operations such as:

```python
accumulator[i] += left * right
accumulator[j] -= quotient * pivot
```

The witness must demonstrate that large values remain live in native exact
entries across iterations. The generated hot loop may not import from and
export to a packed limb buffer on every update.

### Witness B: relation admission workspace

The relation collector needs:

- a bounded sparse exponent row;
- exact ideal-power accumulators;
- factored principal-witness metadata;
- append-only admitted relation metadata;
- deterministic rollback on a rejected relation; and
- stable conversion to the existing canonical proof payload.

This is the primary class-group witness. Its mathematical output must remain
byte-for-byte identical to the current exact relation records.

### Witness C: modular rank and presentation workspace

The modular rank accumulator and exact HNF/SNF preparation need shaped matrix
views, row operations, bounded pivot metadata, and inexpensive reuse of scratch
storage. This witness establishes that the model handles matrix-shaped state
without exposing raw storage.

### Witness D: partial-relation table

Large-prime relation collection needs a deterministic bounded map from compact
keys to relation references. This is the witness for bounded maps, stable hash
semantics, explicit load limits, and arena-backed variable-length data.

### Witness E: analytic exact accumulation

The rigorous zeta/log-residue finite term calculation provides an independent
witness for exact in-place dyadic accumulation, compact immutable metadata,
and batched native/Wasm execution. It guards against designing the model too
narrowly around ideals and matrices.

## Cross-domain constraints from the higher-genus release work

The higher-genus curve program reached the same general conclusion as the
class-group profiling: once the arithmetic kernel is fast, representation and
lifetime boundaries determine whether the public operation is competitive.
That work also exposed several failure modes that this sprint should design
out rather than rediscover.

### Measure the complete semantic pipeline

For every witness, distinguish and report these stages independently:

1. canonical input normalization and authentication;
2. import or borrow into live native state;
3. the mathematical kernel;
4. creation or transfer of a sealed native result;
5. binding and publication of the public result;
6. first semantic observation, such as indexing one row, constructing
   polynomial objects, hashing, equality, or canonical packing; and
7. detached serialization and independent reference replay.

A kernel result is not an end-to-end win when publication or first observation
dominates. Conversely, a lazy retained result must not be penalized by timing a
forced observation that the comparison system performs after its timer. Timed
functions should return the whole result, with observation recorded separately
and performed after elapsed time is captured unless observation is explicitly
part of the equal contract.

Demanding one element of a batch must be `O(1)` in the batch size or be labeled
as whole-batch materialization. A batch index operation that copies or decodes
the entire retained buffer is a representation bug, not ordinary indexing.
Likewise, a bulk kernel should use one authenticated gather/borrow boundary
rather than one host crossing and resource copy per element. Scattered
individually owned inputs and one contiguous batch owner are different storage
contracts and must be represented and benchmarked honestly.

### Separate semantic authority from acceleration state

Canonical packed rows and detached proof payloads remain the durable semantic
authority. A live FLINT/GMP object, arena, capsule, or workspace is ordinarily
an acceleration representation and may never silently become the only proof
of a mathematical value.

If a sealed native aggregate is temporarily authoritative before first public
observation, its state transition must be explicit:

- the aggregate is indivisible and immutable after publication;
- components cannot be transplanted independently;
- the binding authenticates owner identity, exact parent/model fingerprint,
  format, logical shape, and resource identity;
- first observation extracts and validates one canonical primitive payload;
- equality, hashing, packing, pickling, and reference replay are invariant
  whether extraction occurred before or after an operation; and
- after extraction, the canonical payload is the observation/cache authority.

Context close, workspace reuse, finalization, and reconstruction in a new
process must not invalidate an already-public exact value. Any long-lived
owner/view feature needs explicit transplant, duplicate-owner, stale-token,
closed-resource, and garbage-collection tests.

### Keep host publication transactional

Compiled cores contain no host callbacks. Cancellation is checked before and
after bounded native stages, never inside an unbounded native call. The host
wrapper must stage all new resources, canonical records, diagnostics, and cache
counters, perform its final cancellation check, and then publish them without
calling user code. Failure, cancellation, or a hostile callback must leave no
hidden cache entry, partially bound owner, leaked result, or dishonest counter.

Same-context reentry during a proof/publication transaction must be rejected or
given explicitly nested transactional semantics. Different-context work may
proceed independently. Public subclasses, mutable instance attributes, and
live module-global helper replacement must not become trusted proof inputs.

### Treat memory caps as logical and physical contracts

An arena entry cap does not bound GMP limb allocations, allocator retention,
Node external memory, finalizer backlog, or process RSS. Every representative
memory receipt should therefore report, where available:

- source-visible logical capacity and charged arena bytes;
- initialized exact-entry and resource counts;
- JavaScript heap, external, and `ArrayBuffer` high-water;
- backend allocation counters and pending finalizers;
- process RSS/high-water; and
- state after deterministic close/reset and after process exit.

Process resource envelopes may be part of a release contract when documented
and measured, but they must not be used to disguise an unbounded native stage.
Deterministic cleanup is required even when the system allocator does not
immediately return pages to the operating system.

### Admit compiler features through vertical slices

Before a new ABI, ownership, effect, or exception feature is used by class
groups, land both:

1. a neutral minimal compiler witness that isolates the generic rule; and
2. a production-shaped source witness that exercises the actual call graph,
   buffer effects, return type, cleanup, and failure translation.

This catches defects such as return-slot C type mismatches, transitive
read-only buffers being classified writable, raw runtime errors bypassing
Python exception handling, and owned-result transfer interacting incorrectly
with output mutation.

After C0, take the smallest useful vertical slice across C1--C3: preferably a
caller-owned or compiler-owned reusable exact workspace, one cleanup region,
and Witness A. Do not require the full record language, general arena syntax,
all view forms, and all control-flow additions to land before measuring that
slice. General ownership transfer, nested records, maps, and owned aggregates
remain conditional on a measured witness.

## Proposed pure-Python surface

The following syntax is provisional. The semantic contracts are the plan; the
exact spelling should be chosen by small compiler experiments and reviewed
before becoming widespread.

### Lexical arena

```python
from sagejs.native import NativeArena, native


@native
def collect(..., memory_limit: uint64) -> bool:
    with NativeArena(memory_limit) as arena:
        rows = arena.integer_vector(maximum_entries)
        metadata = arena.records(RelationMetadata, maximum_relations)
        scratch = arena.integer_matrix(degree, degree)
        ...
        return True
```

`NativeArena` is a recognized compiler primitive, not an arbitrary Python
context manager. Its CPython fallback is a safe ordinary object with the same
capacity/error contract.

Required semantics:

- the byte cap is explicit and checked before entry;
- all size arithmetic is checked for overflow;
- POD allocations use aligned monotone storage;
- nontrivial exact resources register deterministic cleanup;
- the arena releases all owned state on every exit;
- allocations and peak use are available as diagnostics;
- values owned by the arena cannot escape the `with` block; and
- an output is copied or transferred only through a compiler-approved owned
  result operation.

### Typed owners, slices, and shaped views

```python
values = arena.integer_vector(capacity)
prefix = values.slice(0, length)
matrix = arena.integer_matrix(rows, columns)
row = matrix.row(i)
block = matrix.view(r0, r1, c0, c1)
```

Views carry a root identity, shape, bounds, element type, and mutability. The
compiler rejects:

- a view that escapes its owner;
- two simultaneously active mutable views whose overlap cannot be disproved;
- mutation through a read-only borrow;
- use after arena exit; and
- a shape or offset computation that can overflow.

The first implementation may require obviously disjoint constant or affine
ranges. More ambitious alias proofs are not a prerequisite.

### Live exact vectors and matrices

`NativeIntegerVector` and `NativeIntegerMatrix` are computational containers,
not serialized interchange buffers. Native C may back them with initialized
`fmpz` or `mpz_t` arrays; Wasm uses the same isolated C representation in its
linear memory; the dynamic fallback uses exact Sage.js integers.

Required operations begin narrowly:

- indexed read and assignment;
- `clear`, `swap`, and fill with a small exact value;
- `add`, `sub`, `mul`, `addmul`, and `submul` in place;
- exact comparison and sign;
- row swap and row add-multiple operations;
- copy between compatible views; and
- explicit pack/unpack at public ABI, checkpoint, or proof boundaries.

The compiler should lower natural Python updates when alias semantics are
unambiguous:

```python
values[i] += a * b
row[j] -= quotient * pivot[j]
```

It may also expose a small explicit primitive vocabulary where that conveys
the operation better or prevents temporaries:

```python
values.addmul(i, a, b)
row.submul(j, quotient, pivot[j])
```

Both forms must have exact CPython and dynamic fallback semantics. The
compiler's explanation must say when it fused a source expression to a direct
in-place operation.

### Fixed-capacity vectors

```python
relations = arena.vector(RelationMetadata, maximum_relations)
relations.append(metadata)
last = relations.pop()
count = len(relations)
relations.clear()
```

The vector has a fixed maximum capacity and a dynamic logical length. Append
past capacity returns a stable capacity error. It does not reallocate.

Initially supported element types should be:

- fixed-width scalar types;
- exact integer entries;
- flat native records whose fields are supported; and
- handles or offsets into the same arena, represented as checked typed indices
  rather than addresses.

### Exact and nested records

The current `NativeRecord` field set is too narrow for mathematical state. The
sprint should add:

- exact integer fields;
- fixed-shape exact buffer fields;
- nested records with acyclic statically known layout;
- typed arena offsets/indices;
- immutable versus mutable field declarations; and
- deterministic canonical packing when a record crosses an ABI boundary.

Records must not hide ownership. A record can contain an owned field only when
the record itself is an owner with compiler-generated cleanup. Early waves may
limit arena records to inline values and checked references to arena-owned
storage.

### Bounded maps and sets

```python
partials = arena.map(PartialKey, RelationIndex, capacity=max_partials)
previous = partials.get(key)
inserted = partials.insert_if_absent(key, relation_index)
```

The first map should be intentionally restricted:

- fixed-capacity open addressing;
- stable, specified hashing;
- scalar, tuple-of-scalar, or fixed-record keys;
- explicit maximum load factor;
- no rehashing or allocation after construction;
- deterministic probe order;
- a clear distinction among absent, inserted, full, and invalid; and
- introspectable probe and collision diagnostics.

This is enough for partial relations and many modular caches. A general Python
dictionary is not required.

### Owned result aggregates

Some phase-sized kernels should eventually return an owned group of buffers
rather than force the caller to allocate every possible output. A restricted
pattern is sufficient:

```python
class RelationBatch(NativeOwnedRecord):
    rows: NativeIntegerMatrix
    metadata: NativeVector[RelationMetadata]


@native
def collect(...) -> RelationBatch:
    with NativeArena(memory_limit) as arena:
        ...
        return arena.transfer(RelationBatch(rows, metadata))
```

This is not required for the first relation witness. Caller-owned output plus
transactional publication is acceptable initially. Owned returns should land
only after cleanup and transfer semantics are proven.

## Memory and lifetime model

### Storage classes

Every native value belongs to one explicit storage class:

1. **scalar** — machine or tagged exact local with compiler-managed lifetime;
2. **borrowed input** — immutable or explicitly mutable storage owned by the
   caller;
3. **arena-owned POD** — bytes, fixed-width scalars, metadata, and offsets;
4. **arena-owned exact** — initialized exact entries plus registered cleanup;
5. **declared FFI resource** — existing declaration-driven owned or borrowed
   resource; or
6. **transferred result** — ownership moved from an arena into the returned
   ABI object.

Storage class and root identity belong in typed IR rather than backend-only
metadata.

### Arena implementation

The arena uses an aligned bump allocator for trivial storage. Allocation is
monotone within a lexical scope. It may support checkpoints and rollback for
POD/vector lengths, but rollback cannot skip cleanup for exact values created
after the checkpoint.

Variable-sized GMP/FLINT payloads require care: an arena cannot pretend that
GMP's internal limb allocations live inside a byte slab when they do not.
Initial exact accounting should therefore include:

- the exact entry array owned by the arena;
- deterministic initialization and cleanup counts;
- conservative charged bytes for initialized exact entries;
- optional measured high-water diagnostics for backend allocations; and
- a hard logical cap on entry count and source-visible operations.

A later custom GMP allocator or fixed-limb arena representation requires a
separate measured design and must not be smuggled into the first implementation.

### Escape analysis

The compiler tracks the root owner for every view and handle. Arena-owned
values may be passed to direct compiled callees when the callee's effects and
lifetimes are known. They may not be:

- returned without an explicit transfer;
- stored into a longer-lived owner;
- captured by unsupported closures;
- converted to a raw address; or
- passed through an undeclared FFI boundary.

Diagnostics should name the source value, owner, attempted escape, and relevant
source ranges.

### Alias model

The first alias model should be conservative and useful:

- any number of immutable views may overlap;
- one mutable view excludes overlapping mutable or immutable views for its
  active lexical region;
- distinct owners never alias;
- provably disjoint rows or affine slices do not alias;
- a source operation such as `x[i] += x[j] * q` evaluates the right side before
  mutating the left, matching Python; and
- if the compiler cannot prove a required non-alias condition, it emits a safe
  temporary or rejects the optimized form.

## Exact integer representation policy

Keep `IntegerBuffer` as a stable packed interchange format for:

- JavaScript/native/Wasm ABI boundaries;
- canonical serialization;
- checkpoints and detached certificates;
- immutable bulk input; and
- compact persistent caches.

Do not use it as the default live representation for a repeatedly mutated
exact vector.

The live native representation should initially be a deterministic array of
initialized FLINT `fmpz` entries if that fits the isolated C and Wasm builds;
otherwise use a carefully wrapped `mpz_t` array. The selection must be based on
measured backend support, not aesthetic preference. The API and IR remain
representation-independent.

Direct operations must avoid intermediate allocation where the backend offers
an alias-safe primitive. At minimum, generate equivalents of:

- set/swap/zero;
- add/sub/neg;
- mul by an exact or small operand;
- addmul/submul;
- comparison/sign/zero test; and
- exact division or remainder only where the source semantics and failure
  status are explicit.

Packing occurs once at a boundary. Unpacking occurs once at a boundary. The
compiler benchmark must detect accidental per-iteration packing regressions.

## Control flow and cleanup

The first control-flow additions are `break` and `continue` for native loops.
They require stable IR targets and must cooperate with nested lexical cleanup.

The recognized `with NativeArena(...)` construct lowers to:

1. checked arena initialization;
2. the body;
3. one cleanup epilogue reached from ordinary fallthrough, `break`, early
   return, and error status; and
4. ownership transfer before cleanup only when explicitly requested.

Arbitrary `try`, `finally`, and arbitrary context managers remain unsupported
initially. Compiler-generated cleanup is easier to prove than general Python
exception semantics and covers the actual witnesses.

Cancellation checks must be explicit, bounded, and placed at deterministic
chunk boundaries. Cleanup follows the same path after cancellation as after
any other failure.

## Compiler work packages

Each package lands as a coherent, independently useful change with dynamic,
native, and—where production-relevant—Wasm evidence. Later packages may change
their syntax based on earlier witness results. The package numbering groups
capabilities; it is not a mandate to finish every item in C1 before beginning a
minimal C2/C3 vertical slice.

### C0 — specification, baselines, and failing witnesses

Deliverables:

- a versioned machine-model design note derived from this plan;
- minimal accepted/rejected source probes for every proposed capability;
- generated C evidence for current per-access `IntegerBuffer` import/export;
- representative handwritten C/FLINT ceiling benchmarks;
- a stage-resolved profile covering authentication, kernel, sealed-result
  transfer, public publication, first observation, and detached replay;
- neutral and production-shaped ABI/effect/error/ownership witnesses for the
  first proposed vertical slice;
- current native/dynamic/Wasm class-group witness receipts; and
- a feature matrix naming frontend, IR, C, JavaScript, and Wasm support.

Exit gate:

- every proposed feature is justified by at least one real witness;
- existing compiler invariants are encoded as tests before large changes; and
- no performance target relies on an incomparable proof mode or warm boundary.

### C1 — control flow, exact records, and shaped borrowed views

Implement:

- `break` and `continue`;
- exact integer `NativeRecord` fields;
- statically laid-out nested records;
- typed slices and matrix/row views over borrowed storage;
- root-identity and conservative alias analysis; and
- ownership/effect output in `native explain`.

Exit gate:

- all new lifetime and alias violations are rejected at compile time;
- nested early exits preserve existing FFI cleanup; and
- a matrix row-operation witness is exact across all available backends.

### C2 — lexical arena for POD and fixed buffers

Implement:

- recognized `NativeArena` syntax and type;
- checked aligned allocation for POD and fixed buffer storage;
- vector logical lengths and fixed-capacity append/pop;
- checkpoints/rollback for trivial storage;
- cleanup epilogue construction; and
- allocation/peak diagnostics.

Exit gate:

- deterministic OOM and overflow behavior;
- no leak or use-after-scope under sanitizers;
- early-return and error cleanup tests pass; and
- dynamic and Wasm fallbacks implement the same capacity contract.

### C3 — live exact vectors and in-place arithmetic

Implement:

- initialized exact entry arrays;
- indexed reads/writes and shaped views;
- direct in-place add/sub/mul/addmul/submul/swap operations;
- exact cleanup and conservative memory charging;
- one-time pack/unpack at boundaries; and
- IR fusion diagnostics for natural Python augmented assignments.

Exit gate:

- Witness A has no packed limb import/export inside its hot loop;
- exact vector differentials cover zero, sign, large limbs, aliasing, and
  promotion boundaries;
- native and Wasm outputs agree byte-for-byte with CPython; and
- the native hot loop is within 1.5x of an equivalent direct FLINT/C reference
  on the designated microbenchmark, or the remaining gap is fully attributed;
  and
- the complete witness, including result publication and its contractually
  required observation, improves materially or has a measured downstream path
  to doing so. A kernel-only win is not sufficient.

### C4 — bounded maps, sets, and sparse rows

Implement:

- fixed-capacity vectors of records;
- deterministic open-addressed maps and sets;
- compact sparse-row construction;
- arena offsets as checked typed references; and
- collision/load/capacity diagnostics.

Exit gate:

- partial-relation Witness D matches the readable implementation exactly;
- adversarial collisions, full tables, duplicate keys, and cancellation fail
  safely; and
- no unbounded allocation or iteration is possible.

### C5 — owned aggregates and reusable workspaces

Implement only if the earlier witnesses show a material need:

- compiler-approved ownership transfer;
- owned record cleanup;
- return of bounded vectors/matrices as one aggregate; and
- reusable caller-owned workspace reset semantics.

Exit gate:

- move/transfer is single-owner and double-free impossible;
- failed kernels publish no partial aggregate;
- dynamic/native/Wasm ownership tests pass; and
- authority, canonicalization, close/recreate, serialization, and finalizer
  transitions satisfy the cross-domain contract above; and
- a real phase becomes simpler or faster than caller-owned output.

If caller-owned output remains clear and fast, defer this package.

### C6 — bounds hoisting and code quality

After semantics are stable, add measured optimizations:

- hoist invariant view bounds and root checks out of loops;
- eliminate redundant initialization and copies;
- reuse exact scratch entries by proven non-overlapping lifetime;
- fuse recognized exact updates;
- expose generated allocation and cleanup plans; and
- improve source-mapped profile output.

Exit gate:

- each optimization has a before/after generated-code assertion and benchmark;
- no unchecked fast path exists; and
- `native explain` makes the optimization decision legible.

### C7 — class-group integration witness

Port the smallest complete phase that exercises the new model. Start with
relation admission and its exact ideal accumulator, not an entire class-unit
engine rewrite.

The port must:

- retain the ordinary Python implementation as oracle/fallback;
- retain exact relation and witness verification;
- produce identical canonical relation payloads and presentation hashes;
- preserve cancellation, memory, relation, and candidate caps;
- use `ClassUnitComputationContext` as the owner of reusable live state;
- keep canonical relation payloads as detached authority and treat live state
  as authenticated acceleration unless an explicitly reviewed sealed-authority
  transition applies; and
- measure production, live validation, and detached validation separately.

Exit gate:

- at least 2x improvement in the specifically replaced hot phase, unless its
  new share of total time is already below 5%;
- at least 15% improvement on a representative end-to-end cubic or higher-
  degree class-group workload;
- no regression above 5% on the versioned corpus without an understood reason;
- exact payload equality across dynamic/native/Wasm; and
- less manual flat-buffer and scratch plumbing in the mathematical source.

### C8 — platform and production closure

Run exact-revision validation on:

- Linux x64 native;
- Linux arm64 on `bench-arm`;
- macOS arm64 on the repaired M1;
- Windows x64 native; and
- browser/worker Wasm.

Regenerate capability manifests and production-kernel coverage, validate
content-addressed cache invalidation, and update compiler documentation.

Compiled availability and release `auto` selection are distinct. A new
machine-model path may be invoked explicitly for testing and receipt
collection, but must not become an automatic public route merely because a
compiled artifact exists. Release-auto enablement requires an exact-source,
platform, model/domain, operation, and workload-envelope receipt accepted by
the release policy; an unmatched request keeps the existing exact fallback or
fails closed according to the public algorithm contract.

Exit gate:

- identical mathematical payloads and expected capability routes;
- no native-only mathematical behavior;
- no leaked or orphaned processes;
- Windows uses the native Node launcher path; and
- installed/release artifacts contain the required compiled functions.

## Frontend and type-system work

The frontend must recognize a small closed set of native generics and the
`NativeArena` context. It must retain ordinary Python parsing and give precise
rejections rather than relying on backend failures.

Required type information includes:

- element type;
- rank and statically known or runtime-bounded shape;
- logical length and maximum capacity;
- owner/root identity;
- read-only or mutable borrow;
- initialized exact-entry count;
- transferability;
- cleanup requirements; and
- effect summary for direct callees.

The compiler should reject ambiguous ownership in the first implementation.
Ergonomic inference can be added after the explicit model proves itself.

## IR work

The serialized IR needs first-class operations for:

- arena enter, allocate, checkpoint, rollback, transfer, and exit;
- vector length, capacity, append, pop, clear, and indexed access;
- slice/view creation with owner and shape;
- exact entry initialization and cleanup;
- exact in-place arithmetic;
- deterministic map lookup and insertion;
- structured break/continue targets;
- cleanup regions; and
- ownership/effect/lifetime metadata.

These additions require a Native Kernel IR/cache version bump. Serialized IR
must contain no raw backend addresses and must be deterministic across runs.

## Backend work

### Isolated C core

The C backend owns the reference implementation of native storage semantics:

- checked `size_t` arithmetic;
- aligned allocation within the supplied memory cap;
- stable status codes;
- exact initialization and reverse cleanup;
- direct FLINT/GMP entry operations;
- no Node or interpreter dependency; and
- optional sanitizer/debug assertions that do not change release semantics.

Where a mature FLINT primitive exactly matches the source operation, call it.
Do not reimplement low-level integer arithmetic in generated C.

### Dynamic JavaScript fallback

The fallback prioritizes semantic identity and debuggability. It may represent
arenas and exact containers with checked JavaScript objects and `BigInt`, but
must implement the same capacities, mutation order, errors, and lifetime
checks. Debug mode should detect use after scope and alias violations even when
the compiled program would reject them statically.

### WebAssembly

The Wasm target uses the same isolated core and linear-memory arena contract.
It must:

- check address and size arithmetic at the Wasm boundary;
- avoid per-entry host calls;
- expose allocation peaks and failure statuses;
- package the same compiled call graph as native production kernels; and
- retain the ordinary fallback for unavailable builds.

### FFI integration

Existing declared FFI resources already provide ownership and all-exit cleanup
precedents. Extend that machinery rather than inventing a competing cleanup
system. Native arena values may cross an FFI call only through declared,
typed, effect-checked arguments. Borrowed FLINT matrix/vector views should
eventually expose safe entry-level operations when a witness demonstrates the
need.

## Safety and correctness program

Every new storage feature requires all of the following where applicable:

- CPython oracle comparison;
- generated JavaScript comparison;
- native C comparison;
- Wasm comparison;
- exact small/negative/zero/large-limb cases;
- capacity boundary and one-past-capacity failure;
- checked dimension and byte-size overflow;
- early return, nested break/continue, cancellation, and error cleanup;
- use-after-scope and escaped-borrow rejection;
- overlapping mutable-view rejection;
- alias-sensitive arithmetic cases;
- deterministic OOM injection at each allocation point;
- exact translation of backend/runtime failures to the declared Python error
  contract;
- corrupt packed input and malformed record rejection;
- transactional output failure tests;
- cancellation at every host-visible stage boundary, including late
  publication, plus same-context reentry and different-context nesting;
- owner/resource transplant, duplicate registration, stale binding,
  close/recreate, serialization, and finalizer tests for persistent values;
- ASan and UBSan runs for isolated cores;
- leak checks for native executables and Node adapters;
- zero-host-callback audit; and
- stable source/IR/C provenance assertions.

Property-based generation should cover small shapes, operation sequences, and
alias patterns. A separate model interpreter for the small arena/container IR
is worthwhile if it stays simpler than the production backends.

## Benchmark program

Compiler work is governed by both microbenchmarks and complete mathematical
workloads.

### Boundaries

Report separately:

1. canonical input normalization and authentication;
2. generated-core execution only;
3. native adapter plus import/borrow and pack/unpack;
4. sealed result creation or ownership transfer;
5. public binding and object publication;
6. first-element observation and canonical extraction;
7. forced full materialization, hash/equality, and detached serialization;
8. warm mathematical phase;
9. fresh-field computation;
10. fresh-process computation; and
11. browser Wasm first and warm calls.

Do not claim a compiler win by moving work outside the measured region.
Likewise, do not include a post-result observation inside only one side of a
comparison. Record elapsed time before inspecting a lazy result when the
equal contract places observation outside timing. Include batch sizes and
verify that observing one element does not decode or copy the whole batch.

### Required microbenchmarks

- exact indexed add/mul/addmul on small and multi-limb values;
- vector initialization, clear, and reuse;
- row operations through disjoint shaped views;
- arena allocation and rollback;
- fixed-capacity append and iteration;
- bounded-map hit, miss, collision, and full-table behavior;
- pack/unpack boundary cost; and
- dynamic/native/Wasm crossover points.

Each benchmark includes:

- the readable Python source;
- current packed-buffer implementation;
- new machine-model implementation;
- direct C/FLINT ceiling where meaningful;
- exact output differential;
- operation/allocation counters; and
- JavaScript, backend, and process peak memory where available.

### Mathematical acceptance corpus

At minimum, retain:

- the two motivating cubics `x^3 + 2*x + 1` and
  `x^3 - x^2 - 6*x - 12`;
- the pinned LMFDB cubic corpus;
- relation-heavy degree 6--10 witnesses;
- real quadratic narrow/ordinary fixtures;
- analytic 53/100/200-bit regulator fixtures; and
- mutation/detached-replay tests.

Compare equivalent requests with Sage/PARI, direct PARI, Magma, and
Oscar/Hecke when available. Store tool versions, proof modes, commands, exact
revision, warm/cold boundary, CPU, memory, and payload hashes.

### Retention rules

Retain a performance change only when:

- it improves a representative end-to-end workload; or
- it is a necessary reusable primitive with a measured downstream ceiling and
  an identified integration witness.

Reject or revise a change when it:

- accelerates only synthetic data;
- regresses exact replay or portable fallback;
- increases first-process cost disproportionately;
- creates a second live ownership/cache system outside
  `ClassUnitComputationContext`; or
- makes the mathematical source harder to audit without a measured payoff.

## Hardware and storage

### Development host

Use the current host for compiler iteration, differential tests, source
inspection, and ordinary builds. Magma is already installed. Installing Julia,
Oscar, PARI/GP, profilers, sanitizers, and debugging packages with `apt-get` or
the appropriate official installer is explicitly allowed.

### Fast persistent scratch

Use `/scratch/class-group/native-compiler-sprint` for:

- isolated compiler caches;
- generated C and Wasm inspection artifacts;
- sanitizer builds;
- benchmark corpora and raw receipts;
- Oscar/Julia depots when beneficial; and
- large differential/fuzz corpora.

Check capacity with `df -h /scratch` before a large run. The filesystem is
persistent but shared, so every artifact belongs below the named directory and
must include provenance rather than relying on process-local state.

### Benchmark hosts

- `bench-1`: authoritative Linux x64 performance and Magma comparison host;
- `bench-arm`: Linux arm64 correctness/performance and native artifact host;
- repaired physical M1: macOS arm64 release and ownership/cleanup validation;
- Windows x64: native launcher, MSVC-compatible C, and cleanup validation.

Do not let build, benchmark, or unrelated mathematical processes contend on a
host during a reported timing.

### Large CPU machine

Ask for the 60+ CPU VM only after:

- the single-core relation/admission representation is efficient;
- bounded containers and workspaces are stable;
- deterministic independent work units exist;
- merging results is exact and tested; and
- profiling predicts a meaningful parallel fraction.

The first use should be corpus profiling, fuzz/differential testing, and later
parallel relation collection—not hiding an inefficient scalar kernel with
cores.

## Parallel-agent execution model

When this sprint is run as a multi-project effort, use `pnpm parallel:new` and
narrow file claims. Suggested lanes are:

1. **compiler integration** — owns the IR version, shared registries, merge
   order, release manifests, and exact-head validation;
2. **frontend/types** — recognized syntax, type canonicalization, diagnostics;
3. **ownership/lifetime** — roots, borrows, alias analysis, cleanup regions;
4. **C storage** — arena and live exact container runtime plus isolated core;
5. **dynamic/Wasm** — fallback semantics, Wasm linear-memory path, coverage;
6. **compiler verification** — model tests, fuzzing, sanitizers, cache identity;
7. **class-group witness** — ports only the selected relation/presentation
   phase and owns mathematical differential benchmarks;
8. **oracle/performance** — Sage/PARI, direct PARI, Magma, Oscar/Hecke, and
   exact-revision platform receipts; and
9. **read-only reviewer** — continuously audits safety, source transparency,
   proof semantics, and benchmark comparability.

Avoid multiple lanes editing the core IR or code generator concurrently.
Shared package scripts, architecture registries, generated Wasm coverage, and
release manifests belong to the integration lane. A lane does not mark itself
complete on receipts from an older revision.

## Review checkpoints

Stop for explicit architectural review at four points:

### R1 — surface and ownership review

Before implementation beyond prototypes, review:

- the exact Python spelling;
- owner/view/transfer semantics;
- supported element types;
- exception/status behavior; and
- CPython fallback behavior.

### R2 — live exact representation review

Before widespread use, review:

- `fmpz` versus `mpz_t` choice;
- initialization and cleanup;
- memory accounting;
- Wasm support;
- alias behavior; and
- generated hot-loop code.

### R3 — bounded container review

Before the partial-relation map lands, review hashing, determinism, collision
behavior, full-table semantics, and verifier resource caps.

### R4 — mathematical integration review

Before replacing an existing path, require exact payload differentials,
end-to-end timings, detached replay, cross-platform status, and a source-level
audit that the new live state does not become proof authority after
serialization.

## Failure and stop conditions

Pause and redesign a work package when:

- its semantics cannot be expressed naturally in ordinary Python fallback;
- it requires host callbacks inside the core;
- native and Wasm require materially different mathematical source;
- ownership or cleanup depends on programmer discipline rather than compiler
  enforcement;
- the compiler cannot explain the lifetime/alias decision;
- the direct C ceiling is too small to affect an end-to-end witness;
- a general feature is used only by one polynomial-specific path; or
- compiler complexity grows faster than removal of manual mathematical
  plumbing.

It is acceptable to defer owned returns, general nested records, or a map
feature if the earlier witnesses do not justify them. The sprint is not judged
by feature count.

## Deliverables

The sprint produces:

1. a reviewed pure-Python native storage/lifetime specification;
2. an updated versioned Native Kernel IR and documentation;
3. dynamic, isolated C, and Wasm implementations of the accepted vocabulary;
4. source-mapped ownership/allocation explanations;
5. sanitizer, fuzz, differential, and failure-injection tests;
6. representative compiler microbenchmarks with direct C/FLINT ceilings;
7. one real class-group phase port with exact payload equality;
8. same-host Sage/PARI, direct PARI, Magma, and Oscar/Hecke comparisons;
9. exact-revision Linux x64/arm64, macOS arm64, Windows x64, and Wasm receipts;
10. updated architecture/capability/release manifests; and
11. a short post-sprint decision memo listing what the machine model now makes
    possible and which class-group phase comes next.

## Definition of done

The compiler sprint is complete when all of the following are true:

- a mathematical author can express a bounded exact workspace with natural
  typed vectors, views, and in-place operations in ordinary Python;
- the compiler statically owns lifetime, alias, and cleanup enforcement;
- large exact entries remain live across inner-loop operations;
- packed `IntegerBuffer` conversion occurs at boundaries rather than every
  update;
- dynamic JavaScript, native C, and Wasm return identical exact results and
  stable errors;
- the isolated core has no host callbacks and passes sanitizer/leak gates;
- a real class-group hot phase is at least 2x faster or below 5% of the new
  total runtime;
- a representative end-to-end class-group workload improves by at least 15%
  without proof or startup regression;
- the mathematical source is shorter or clearer than its manual flat-buffer
  predecessor;
- exact-revision platform and release artifacts are green;
- the required public semantic pipeline—not merely the isolated kernel—has a
  stage-resolved receipt with no hidden whole-batch observation cost; and
- production automatic selection is enabled only for receipted source,
  platform, mathematical-domain, operation, and workload envelopes.

Meeting those conditions does not finish class groups. It gives the remaining
class-and-unit-group program the right machine model: safe enough to trust,
portable enough for WebAssembly, and close enough to FLINT/GMP to compete.

## Immediate sequence

1. Finish, validate, commit, and benchmark the currently active small cubic
   optimization without expanding it.
2. Freeze exact-head compiler and class-group baseline receipts.
3. Create the compiler sprint integration lane and `/scratch/class-group/native-compiler-sprint`.
4. Land C0's accepted/rejected probes and direct C/FLINT ceilings.
5. Review R1 before committing to final API spelling.
6. Implement the minimum C1--C3 vertical slice needed for live exact
   accumulation and integrate Witness A; defer unrelated surface area.
7. Port the smallest complete relation-admission slice for Witness B, measuring
   authentication, kernel, publication, first observation, and detached replay
   separately.
8. Reprofile the complete class/unit computation.
9. Continue to C4/C5 only where that profile and the remaining witnesses justify
   them.
10. Resume the competitive class-and-unit-group strategy using the new machine
    model, with every later compiler extension held to the same witness-driven
    standard.
