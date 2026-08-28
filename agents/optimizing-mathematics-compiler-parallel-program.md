# Optimizing mathematics compiler: parallel implementation program

**Status:** active  
**Base:** `feature/optimizing-mathematics-compiler` at or after `209a972c`

This program turns the optimizer RFC into independently reviewable machine-domain
plugins. It deliberately separates semantic recognition, representation proofs,
target selection, lowering, and evidence. A benchmark win without an exact
fallback and verifier is not an optimizer feature.

## Frozen integration contract

Each lane exports, but does not centrally register, a plugin with:

- one stable pass ID and domain ID;
- an explicit catalog priority and exclusive claim policy;
- target-neutral semantic and mathematical facts;
- a versioned lowering ID owned by that pass;
- an independent verifier that recomputes every safety-critical claim;
- one isolated Python emitter selected only through the lowering dispatcher;
- an untouched dynamic fallback;
- stable static rejection and runtime guard reason codes;
- differential, adversarial, and representative performance evidence.

The integration lane alone edits `optimizer/catalog.ts`, the central verifier
catalog, the Python lowering dispatcher, shared bootstrap guards, architecture
manifests, and common test manifests. Unknown, mismatched, or mutated plans must
fail closed.

## Machine-domain lanes

### Bounded exact integers

First add an explain-only candidate for authentic exact-integer regions. Report
range facts, unsupported operations, estimated conversions/materializations,
and rejected V8/Wasm/native targets. Then admit only a complete fused region
whose entry proof and intermediate bounds guarantee exact JavaScript `Number`
or a fixed-width representation. Overflow or an unproved operation selects the
ordinary exact implementation before observable effects.

The cubic class-group profiler on `origin/class-group` is a required held-out
consumer. The current generated-JavaScript candidate kernel is a negative
control: it is about 26 times slower than the native call-only kernel and must
not be relabeled as an optimization.

### Strict binary64 arrays

Extend the existing ordered IEEE-754 scalar domain to reviewed sequence-fed
loops and reductions. Preserve every source rounding point, NaN behavior,
signed zero, infinities, and exception timing. Do not reassociate, contract, or
enable fast-math. Compare with CPython, NumPy/Numba, Julia, and the O0 Sage.js
path where available.

### Prime residues and modular batches

Generalize the proven small-prime scalar operation graph to complete bounded
batches, including indexed input and output when aliasing is disproved. Keep
parent/coercion/method identity guards and exact intermediate bounds. Compare
monomorphic V8, resident Wasm, and coarse native targets using inclusive copy,
materialization, and boundary costs.

### Fixed extensions

Generalize fixed-degree extension tuples without turning dynamic degree into a
megamorphic loop. Each admitted degree and modulus shape must have a verified
exact intermediate bound and an isolated target body. Measure code-size and
compile-time budgets as well as warm execution.

### Packed machine containers

Define owner-bound, immutable or transactional packed sequence/matrix facts
that other domains may consume. Prove length, element representation, aliasing,
mutation policy, publication, and cleanup. This lane must not smuggle public
mutable arrays across a proof boundary.

## Held-out algebraic-number-theory workload

The cubic class-number profiler is not a toy compiler benchmark. Its remaining
53.5x geometric-mean Sage.js/PARI gap is dominated by representation conversion,
repeated tiny HNF computations, ideal construction, presentation work, and
certificate encoding while native arithmetic kernels are already sub-millisecond.

Compiler work should therefore distinguish:

- fused bounded-integer arithmetic regions, which belong here;
- resident small exact relation matrices and batched HNF/deletion, which need a
  packed representation plus a coarse target;
- persistent packed factor records and lazy authenticated certificates, which
  are mathematical data-lifetime improvements rather than loop lowering.

Synthetic tests establish safety. A machine-domain feature claims practical
value only when it improves an authentic held-out workload or a broadly useful
public operation without regressing neighboring cases.

## Required handoff

Every lane reports:

1. exact source domains accepted and rejected;
2. stable pass, verifier, and lowering IDs;
3. guards and fallback behavior;
4. normalized optimizer IR and inspectable emitted target code;
5. exact O0/CPython/Sage differential results;
6. mutations, aliasing, overflow, zero-trip, interruption, and resource tests;
7. cold, warm, compile, copy, materialization, and boundary measurements;
8. the smallest central registration patch required from integration.

Parallel work begins only from the frozen catalog/verifier/emitter baseline.
Shared-file edits are returned as handoff instructions rather than made in a
domain lane.
