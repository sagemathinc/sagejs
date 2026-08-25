# Native mathematical machine model: C1--C3 decision

## Decision

Keep the C1--C3 vertical slice and use it in class-group work.  Do not yet add
general arenas, records, maps, owned aggregate returns, or a broader borrow
language.  The accepted slice supplies the missing primitive that the first
real witness required: a bounded lexical vector of live exact integers with
compiler-owned initialization, mutation, accounting, and cleanup.

The next optimization should return to the class-and-unit-group profile.  A
later compiler feature must be justified by a new production-shaped witness,
not by the attractiveness of a general storage abstraction.

This is a C1--C3 gate decision, not a claim that the entire compiler sprint is
finished.  In particular, the sprint's 15% end-to-end acceptance threshold
still needs a clean matched workload receipt.  The first port satisfies the
alternative phase criterion because the phase it replaces is now below 5% of
the observed cubic producer.

## What shipped

The ordinary Python surface is:

```python
with NativeIntegerVector(capacity, memory_limit) as values:
    values[0] = seed
    values.addmul(0, left, right)
    values.submul(0, right, left)
    values.swap(0, 1)
    answer = values[0]
```

The same source has:

- an ordinary-Python exact-integer implementation;
- a generated JavaScript `BigInt` implementation;
- an isolated C implementation backed by a lexical `mpz_t` array; and
- a Wasm implementation using that same isolated C core in linear memory.

The compiler rejects owner copying, argument passing, return, use after scope,
manual close, and unsupported nesting.  It emits one all-exit idempotent clear
path and charges both fixed capacity and conservative exact-entry growth to a
semantic memory limit.  Process RSS and allocator retention remain physical
observations in receipts rather than being mislabeled as semantic charges.

The first production use is the order-basis matrix-vector accumulation inside
`packed_factor_base_rows_in_place`.  Exact coordinates stay live while the
inner multiply-add loop runs.  Only completed coordinates are published back
to the caller-owned `IntegerBuffer`, which remains canonical semantic
authority.

## Safety and authority boundary

The native workspace is acceleration state, never certificate authority.  The
caller still independently reconstructs retained relation ideals and checks
the principal witness before admission.  Serialization contains no native
owner, pointer, arena, or issuance state.

ASan and UBSan exercise repeated successful construction and destruction,
semantic-memory failure, range failure, transactional output, and successful
reuse after failure.  The isolated core performs no host callback.  The Wasm
differential executes the production relation-row function and matches the
ordinary-Python metadata, rows, and smoothness flags exactly.

Automatic acceleration is receipt-gated.  The production registration binds:

- the exact source and pack identities;
- Linux x64/arm64, Windows x64, and macOS arm64 targets;
- the cubic relation-admission mathematical domain;
- `packed_factor_base_rows_in_place` as the operation; and
- `degree <= 16` with at most 4096 candidates, factors, and prime powers.

Outside that envelope, automatic native and Wasm resolution uses the same
source fallback.  Explicit backend calls remain available for diagnostics.
The receipt is part of the digest-authenticated Wasm pack identity; route
tampering is rejected, and exposed receipt metadata is deeply frozen.

## Measurements

The neutral 100,000-operation exact `addmul` witness on Linux x64 measured:

| implementation | median |
|---|---:|
| direct GMP C | about 3.57 ms |
| generated native C | about 4.69 ms |
| generated JavaScript | about 152 ms |

The generated C path is about 1.31x direct C while retaining checked public
arguments, lexical allocation, result publication, and deterministic cleanup.

For `x^3 - x^2 - 6*x - 12`, the stage-resolved C0 producer typically measured
about 0.47--0.50 seconds after the port:

| stage | representative time |
|---|---:|
| factor base | 0.17--0.18 s |
| relation phase | 0.14--0.15 s |
| proposal generation | 0.022--0.023 s |
| authority construction | about 0.0047 s |
| authority validation | about 0.0023 s |
| five-row store/admission | about 0.014--0.022 s |
| obstruction | 0.022--0.024 s |
| result encoding | 0.016--0.017 s |
| authenticated bulk extraction | 0.165--0.171 s |
| detached replay | 0.66--0.70 s |

The exact class number remains 3 with proof status `exact-unconditional`; the
canonical certificate payload SHA-256 remains
`631ce567467f2a0145e4cbb05459c7eb3fa8e807f9f6b417b3d2a4065b0accd0`.

The live accumulation itself is no longer a material fraction of the complete
producer.  Authentication, canonical extraction, and detached replay are
larger, but they are proof/publication concerns rather than evidence for a
general arena or container language.

## Why C4 and C5 are deferred

The profile does not justify compiler-owned records, bounded maps, or owned
aggregate returns yet.  Adding them now would create a broad storage language
before a real workload demonstrates that offsets, lookup, or ownership
transfer dominate.  Existing canonical relation records and computation
contexts already solve the semantic-authority problem; replacing them merely
to exercise new compiler vocabulary would increase trust surface without a
measured payoff.

The next production profile should ask narrower questions:

1. Can exact ideal multiplication/powering keep canonical lattice state live
   without weakening independent principal-witness replay?
2. Can authenticated bulk extraction avoid rebuilding already sealed
   canonical material without making live state proof authority?
3. Which unit-recovery or relation-search loop next spends at least 15% in
   representation conversion or repeated exact updates?

Only a positive answer should open the next compiler work package.

## End-to-end acceptance

The clean historical boundary for this sprint is
`44a63f15fd7bef171c5aa3c0d16901b2af95f179`, immediately before the first
live-exact compiler commit.  The measured implementation revision is
`ea8bfd1c9f89f0b4971af714b17528c966a41d6d`.  Both revisions were built from
detached clean worktrees with their own compiler, FLINT adapter, production
native pack, and receipt-authenticated lazy-module cache.

Five alternating fresh-process executions of the production-shaped cubic C0
witness gave these medians:

| revision | complete process | producer | packed proposal | certificate |
|---|---:|---:|---:|---|
| before | 6.753 s | 3.808 s | 19.49 ms | `631ce567...accd0` |
| after | 3.499 s | 0.602 s | 21.89 ms | `631ce567...accd0` |

The complete operation improves by 48.2% and the exact certificate hash is
unchanged.  The tiny packed proposal is not claimed as a speedup: its median
is slightly higher in this workload, but it is only 3.6% of the new producer.
That satisfies C7's explicit alternative gate honestly.  The neutral
100,000-operation witness remains the evidence that live exact accumulation
itself is useful when it is actually hot: generated native C is about 4.69 ms
versus 3.57 ms for direct GMP C and about 152 ms for generated JavaScript.

The independent higher-degree acceptance gate uses `x^6-x-1`, proof false,
the committed one-GiB policy, and a fresh persistent runtime-cache directory.
It gives:

| revision | process | public elapsed | engine diagnostic |
|---|---:|---:|---:|
| before | 8.120 s | 7.192 s | 6.009 s |
| after | 4.612 s | 3.821 s | 2.676 s |

This is a 43.2% fresh-process improvement.  Class number, unit rank, proof
status, regulator enclosure, and all four dependency hashes for generators,
presentation, relations, and saturation are identical.

## First-process compiler closure

The higher-degree receipt found a separate compiler-production defect rather
than an arithmetic defect.  `buchmann_lenstra.py` and
`maximal_order_certification.py` had become lazy maximal-order dependencies
after the general class/unit precompile manifest was last expanded.  A normal
production package therefore compiled them during the first class/unit call.
Adding both exact source modules to the receipt-bound lazy roots reduces the
degree-6 factor-base phase from 3.746 seconds to 0.407 seconds.  The arithmetic
phases and proof hashes remain stable.

This correction is part of the compiler-sprint acceptance boundary: the plan
forbids a kernel-only win accompanied by a first-process regression.  It does
not make ordinary stale cache data trusted.  Module source signatures,
compiler versions, bundle provenance, and dynamic fallback behavior are
unchanged and continue to fail closed.

## External systems

The versioned degree-6--10 corpus was rerun on the same Linux x64 host with
Sage 10.9.post1/PARI 2.17, Magma 2.18-5, and Hecke 0.40.0.  Every system agrees
on the exact class groups, unit ranks, torsion, and regulator acceptance.  The
five-degree, both-proof-mode harness totals were 2.709 seconds for Sage/PARI,
2.308 seconds for Magma, and 27.534 seconds for Hecke, including their harness
process overheads.

For degree 6 specifically, conditional timings were about 10 ms in Sage/PARI,
60 ms in Magma, and 1.76 seconds in Hecke.  Sage.js is now 2.68 seconds in its
engine and 4.61 seconds as a fresh production process.  This is meaningful
progress and roughly the same order of magnitude as Hecke, but it is not yet
competitive with PARI or Magma.  The compiler sprint removes a representation
and startup obstacle; it does not replace the subsequent algorithm and data-
structure program.

## Validation closure

The accepted slice has passed:

- the full native test suite on Linux x64, including FLINT, FFLAS, graph,
  M4RI, lifecycle fuzzing, matrix migration gates, performance ratchets, and
  the live-exact sanitizer witness;
- ASan and UBSan on Linux; UBSan on macOS, where Apple ASan was independently
  shown to deadlock inside the platform runtime before `main`;
- production Wasm compilation and exact ordinary/native/Wasm differential
  tests;
- exact-source architecture, capability, package-graph, and automatic-route
  authentication checks; and
- focused live-vector, cleanup, memory, transactional-failure, escape,
  mutation, and cubic certificate tests on Linux x64, Linux arm64, macOS
  arm64, and native Windows x64.

The platform reruns were all made from clean detached checkouts at exact code
revision `ea8bfd1c9f89f0b4971af714b17528c966a41d6d`:

- Linux x64 passed the complete native suite and production Wasm build;
- Linux arm64 passed build stages 1--6, published all 29 production modules in
  a separately bounded final-stage invocation after the outer build cap, and
  passed the live-vector/sanitizer suite 5/5;
- macOS arm64 passed the seven-stage build and the Darwin UBSan live-vector
  suite 5/5 after refreshing a stale patched eclib source in its existing
  dependency prefix; and
- native Windows x64 rebuilt all 29 production families, passed the live-vector
  suite 4/4 with the Unix-only sanitizer test intentionally skipped, and
  passed the architecture and lazy-root receipt gates.

All three remote worktrees were clean after validation.  No mathematical
source differs among those targets.

## Adoption boundary for other arithmetic

The accepted cross-subsystem surface is intentionally only the lexical exact
vector:

```python
with NativeIntegerVector(capacity, memory_limit) as values:
    values[i] = x
    values.addmul(i, a, b)
    values.submul(i, q, pivot)
    values.swap(i, j)
    y = values[i]
```

Higher-genus and other arithmetic may now use this surface for one measured,
production-shaped exact-coordinate accumulation whose result is copied into
its existing canonical representation before the scope exits.  The ordinary
Python body remains the dynamic oracle; compiled state is acceleration only.
Automatic selection requires a workload receipt and must fail closed outside
the authenticated envelope.

This is not authorization to invent another local arena, owner registry,
packed mutable aggregate, capsule protocol, or lifetime system.  Nested live
vectors, owner aliasing or escape, calls that expose the owner, and use after
scope are deliberately rejected.  Maps, records, shaped views, owned aggregate
returns, and richer arenas remain C4/C5 work and require a new measured profile.

## Post-sprint decision

The compiler sprint is accepted.  C1--C3 provide a small safe mathematical
machine model rather than a new general-purpose language.  C4 maps and sparse
rows, and C5 owned aggregates and richer arenas, remain deferred until a
stage-resolved production profile shows that their representation boundary is
material.

Class-and-unit optimization should now resume.  The next phase should profile
the exact relation search and unit-recovery paths on the LMFDB corpus and the
degree-6--10 witnesses, then add one machine-model feature only if a concrete
phase spends at least 15% in representation conversion, repeated exact
mutation, or manually managed lifetime state.  Canonical payloads remain
semantic authority; live native state remains authenticated acceleration.
