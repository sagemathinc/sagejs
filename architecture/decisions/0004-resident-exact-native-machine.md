# ADR 0004: Source-transparent resident exact machine

- Status: accepted for implementation
- Date: 2026-08-29
- Supersedes: the C4/C5 deferral in ADR 0003

## Context

ADR 0003 deliberately stopped after one lexical `NativeIntegerVector`.  The
post-sprint profile then available did not justify a larger ownership language.
That evidence has changed.

Two independent exact-mathematics pipelines now show the same boundary:

- For LMFDB cubic field `3.3.2989441.2`, Sage.js reaches the correct tentative
  group `C3 x C3` and now closes the missing unit index exactly.  On the
  dedicated Linux x64 host, however, the prepared public group takes 65.37
  seconds, the coupled engine takes 19.23 seconds, and detached replay takes
  174.28 seconds.  Forty-four retained relations are decoded 1,170 times,
  witness logarithms are requested 394 times, and six exact presentations are
  extracted.  PARI's comparable conditional computation is at the millisecond
  scale.
- The Brandt-module pipeline independently spends almost all of its time
  constructing norm plans and repeatedly converting, canonicalizing, hashing,
  and classifying small exact lattices.  Its compiled enumeration recurrence
  is already a small fraction of the complete operation.  Mature systems keep
  the rank-four lattice and ideal state in one low-level lifecycle.

The common missing abstraction is not another scalar kernel.  It is a bounded
owned exact workspace whose representations survive across several
mathematical stages and cross the host boundary only at initial import and final
transactional publication.

## Decision

Extend Native Kernel into a richer **source-transparent exact machine**.  This
is not a second source language and not an application-specific C engine.
Mathematical code remains ordinary CPython-parseable Python; `@native` lowers
the typed body itself and retains the same dynamic fallback.

The machine has two related ownership forms:

1. `NativeExactArena` is lexical compiler-owned state for one coarse compiled
   region.  It may own several bounded exact containers and declared foreign
   resources.  All exits close children exactly once in reverse construction
   order.
2. `NativeExactWorkspace` is a reusable opaque owner held by a mathematical
   computation context.  A compiled call may borrow it synchronously, mutate
   private acceleration state, and return a scalar or detached result.  Reset,
   close, generation, and shape identity are explicit.  The workspace itself
   cannot be serialized or become proof authority.

The first accepted source vocabulary is:

```python
from sagejs.native import NativeExactArena, NativeRecord, native, uint64


class RelationMetadata(NativeRecord):
    witness_index: uint64
    provenance_index: uint64


@native
def admit_and_present(..., memory_limit: uint64) -> bool:
    with NativeExactArena(memory_limit) as arena:
        rows = arena.integer_matrix(maximum_rows, columns)
        row_lengths = arena.uint64_vector(maximum_rows)
        metadata = arena.records(RelationMetadata, maximum_rows)
        seen = arena.bounded_map(KeyRecord, uint64, map_capacity)
        ...
        return True
```

Exact spellings may be tightened by accepted/rejected compiler probes, but the
ownership and effect contracts below are normative.

## Storage vocabulary

The implementation proceeds in dependency order.

### Exact aggregates

- fixed-capacity exact integer vectors;
- row-major exact integer matrices with checked shaped indexing and row views;
- normalized exact rational vectors/matrices represented by paired exact
  integer storage;
- fixed-degree number-field elements represented by exact rational coordinate
  records plus an authenticated field/model fingerprint;
- compact factored elements whose exponent and factor storage remain separate;
- fixed-schema records containing scalars, checked references, and accepted
  exact aggregates; and
- declared FLINT resources, especially `fmpz_mat`, borrowed or owned through
  the existing generated FFI lifecycle.

### Bounded dynamic structures

- append-only vectors of records;
- compact sparse exact rows;
- deterministic open-addressed maps and sets;
- bounded queues/stacks for coarse relation work; and
- checked arena offsets or indices, never raw pointers.

Every structure has an exact capacity, element type, shape, semantic memory
charge, and failure contract.  No operation silently allocates an unbounded
Python, JavaScript, GMP, FLINT, or Wasm object graph.

## Ownership and lifetime

- Each allocation has one compiler-visible owner.
- An arena child cannot be returned, captured, stored in a public object,
  passed to an unknown call, or used after the arena closes.
- A borrowed view names its root owner and cannot outlive it.
- At most one mutable borrow of overlapping state is live at a time.
- A reusable workspace has an authenticated type, shape/specification digest,
  generation, and open/borrowed state.  Reset increments the generation and is
  forbidden while borrowed.
- Cleanup is generated for normal return, early return, compiler status error,
  cancellation, and host translation failure.
- Ownership transfer is admitted only for one indivisible result aggregate;
  partial moves and child transplantation are rejected.

The compiler exposes this graph in `native explain` and retains it in the IR
and artifact identity.

## Control and effects

The exact machine supports the structured control required by the two witness
algorithms:

- `while` and bounded `range` loops;
- `break` and `continue` with generated cleanup edges;
- early scalar or detached-result return;
- checked indexing and capacity failure;
- periodic interrupt polls at source-visible or compiler-proved backedges;
- direct calls to compiled helpers and declared mature-library operations; and
- one final transactional publication.

No compiled core may call Python, JavaScript, Node-API, or another interpreter.
An unbounded foreign call without a reviewed interrupt/worker policy is not
admitted merely because it uses FLINT or GMP.

## Semantic and proof authority

Resident state is acceleration state.  The authoritative mathematical source
remains the ordinary Python algorithm, and accepted relations still have exact
principal witnesses.  A successful compiled transaction may issue a private
live-authentication token binding:

- source and compiler identities;
- field/order/model identity;
- workspace specification and generation;
- every admitted row and witness identity;
- exact presentation and completeness state; and
- the requested and achieved proof contract.

That token can prevent duplicate replay inside the uninterrupted computation,
but it is not serializable.  Detached output remains canonical data with an
independent bounded verifier.  A new process, changed source, reset workspace,
or ambiguous identity must use the detached path.

## Native, JavaScript, and Wasm

One typed IR defines all targets.

- The dynamic fallback uses checked Python containers.
- Generated JavaScript uses private `BigInt`/typed-array storage and
  `try/finally` cleanup.
- Native C uses initialized GMP/FLINT objects with generated all-exit cleanup.
- Wasm uses the same isolated C core and linear-memory ownership model.
- Windows x64 remains first-class.

Packed buffers are import/export and checkpoint formats.  They are not the
representation used for every inner update.  Native and Wasm adapters report
crossings, copied bytes, allocations, high-water storage, resets, and cleanup.

## First vertical slice

The first production slice is the cubic relation/presentation lifecycle:

1. import authenticated factor-base and candidate data once;
2. keep accepted sparse rows, modular pivots, exact row matrix, and factored
   principal elements resident;
3. call mature FLINT HNF/SNF operations on resident matrices;
4. retain dependency rows and unit coordinates without constructing public
   ideals or JSON records;
5. perform the exact cubic unit-index completion, including the trace-equation
   square-root regime;
6. issue one private live-authentication result; and
7. publish only the requested scalar/group data plus one canonical detached
   proof payload.

The source remains a family-level cubic class-group program, not a recognizer
for selected LMFDB labels.  The 60 tune fields select policy.  The unchanged
30-field policy holdout tests generalization after a candidate freeze.

Brandt modules are the independent second witness.  The same arena, exact
matrix, fixed-record, and bounded-map operations must express a rank-four
lattice/ideal pipeline without a Brandt-specific compiler rule.

## Implementation waves

1. **C4a: arena and shaped exact aggregates.** Add lexical multi-owner cleanup,
   exact matrices, record vectors, source-mapped IR, JavaScript/C/Wasm
   differentials, and sanitizer failure schedules.
2. **C4b: bounded sparse structures.** Add sparse rows, deterministic maps and
   sets, collision/full-capacity behavior, and relation-admission witnesses.
3. **C5a: declared-library residency.** Permit arena-owned FLINT resources and
   resource-to-resource HNF/SNF/kernel calls without intermediate packing.
4. **C5b: reusable workspace owner.** Add context-owned resettable state,
   synchronous borrows, generation authentication, and transactional result
   transfer.
5. **C6: code quality.** Hoist proven bounds, reuse nonoverlapping scratch,
   fuse exact updates, add cleanup/ownership explanations, and keep generated
   C within 1.5x of direct reference code for the relevant kernels.
6. **C7: cubic integration.** Replace the measured vertical slice, preserve
   canonical proof equality, and reprofile complete public and detached
   boundaries.
7. **C8: second witness and platform closure.** Exercise Brandt rank-four
   state, then validate Linux x64/arm64, macOS arm64, Windows x64, and browser
   Wasm before automatic production selection.

## Acceptance

The language slice is accepted only when:

- dynamic, generated JavaScript, native C, and Wasm agree exactly;
- ownership, alias, capacity, cancellation, exception, and cleanup
  counterfeits fail closed;
- generated cores remain host-isolated and sanitizer-clean;
- the selected cubic tune workload improves by at least 2x end to end in the
  first coarse slice, with a documented path to PARI parity;
- no tune field loses proof strength or exact public output;
- the frozen heldout corpus passes unchanged after the candidate freeze;
- the mathematical source is shorter or clearer than its flat-buffer/object
  pipeline predecessor; and
- Brandt's independent rank-four witness uses the same generic operations.

Parity and beyond-parity remain separate frontier claims.  They require exact
compatible proof/output/resource cells against PARI, Magma, and Hecke; compiler
success alone is not parity.

## Consequences

This decision deliberately increases the compiler and runtime trust surface.
The increase is justified by a repeated measured boundary across independent
mathematics, not by a desire for a general systems language.  Raw pointers,
host callbacks, arbitrary Python objects, unbounded containers, and
application-named lowering rules remain prohibited.

Ordinary-source improvements and mature-library routing continue in parallel.
The new machine is successful only if it removes representation and lifetime
plumbing while preserving readable mathematics and exact independent proof.
