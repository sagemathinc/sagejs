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

## Remaining release work for this slice

- exact-revision Linux x64 and arm64 receipts;
- exact-revision macOS arm64 and Windows x64 receipts;
- the mandatory broad native test suite;
- a clean matched end-to-end receipt meeting the sprint's 15% threshold; and
- same-host Sage/PARI, direct PARI, Magma, and Oscar/Hecke comparison records
  for the resumed class-group workload.
