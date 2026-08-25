# ADR 0003: Lexical live-exact native workspaces

- Status: accepted for the C1--C3 vertical slice
- Date: 2026-08-24

## Context

`IntegerBuffer` is a canonical, bounded transport format. It is not a suitable
mutable working representation for an exact arithmetic loop. An indexed update
currently imports the packed slot into an `mpz_t`, performs the operation, and
exports the result back into the packed slot. Repeating this protocol inside a
relation or matrix loop makes representation conversion dominate the actual
GMP arithmetic.

The native mathematical machine-model sprint proposes arenas, records, maps,
owned aggregates, and richer control flow. Building that entire language before
exercising a production-shaped operation would make ownership and syntax hard to
revise. The first vertical slice therefore needs one lexical exact container,
deterministic cleanup, direct in-place arithmetic, an ordinary Python fallback,
and one real relation-admission witness.

## Decision

The first source-visible owned container is `NativeIntegerVector`:

```python
with NativeIntegerVector(capacity, memory_limit) as values:
    values[0] = seed
    values.addmul(0, left, right)
    return values[0]
```

Both arguments are `uint64` values. `capacity` is fixed for the lexical scope.
`memory_limit` bounds a deterministic semantic charge consisting of a fixed
per-entry charge plus the byte length of each exact value. Before a mutating
operation the implementation reserves a conservative peak charge; it releases
the difference after the operation. This limit is identical in ordinary Python,
generated JavaScript, native C, and Wasm. It is not presented as the physical
allocator or process-RSS cost; benchmarks and receipts report those separately.

The initial supported operations are:

- `len(values)`;
- indexed read and write;
- `values.addmul(index, left, right)`;
- `values.submul(index, left, right)`; and
- `values.swap(left_index, right_index)`.

The vector is compiler-owned acceleration state, not canonical mathematical
authority. It cannot be a parameter, result, record field, serialized value, or
captured value. It cannot escape its `with` block. The compiler rejects use
after scope and aliases of the owner. Initially the `with` statement must have
one synchronous clause and a simple local-name target. Nested general arenas,
views, records, maps, and ownership transfer remain later work packages.

The native representation is a checked fixed-length array of initialized
`mpz_t` entries. Every exit from the lexical scope, including an early return or
error, clears every initialized entry exactly once and frees the array. The
ordinary Python fallback is a checked context manager over a list of integers;
closing invalidates it. Generated JavaScript uses a lexical checked BigInt
workspace with `try/finally`. Wasm compiles the same isolated C core and GMP
representation as the native host.

A function containing a live exact workspace is marked GMP-required. Its public
native entry calls the isolated GMP implementation directly. A tagged caller
uses a generated tagged-to-GMP bridge; the speculative word path promotes before
the workspace is entered. This prevents multiple ownership implementations and
ensures cleanup is expressed in one backend. Automatic runtime selection remains
receipt-gated rather than following merely from successful compilation.

The first compiler IR uses an explicit lexical `integer.vector.scope` operation
with nested operations. The IR reports ownership, allocation, cleanup, capacity,
and memory-limit effects in `native explain`. Packed import/export is permitted
at the scope boundary but forbidden inside the live update loop.

## Accepted source probes

The first slice accepts one lexical owner with indexed operations and early
returns, including large and negative exact operands. A neutral accumulation
witness and a class-group relation-admission witness must both compile from the
same ordinary Python source through dynamic, native, and Wasm routes.

## Rejected source probes

Compilation rejects:

- asynchronous or multiple-clause workspace scopes;
- missing or non-`uint64` capacity and memory limits;
- returning, assigning, or passing the owner as a value;
- using the owner outside its lexical scope;
- nested workspace scopes in the first slice;
- negative or out-of-range indices;
- operations after explicit fallback close; and
- allocation or conservative peak charge above the declared limit.

Unsupported syntax fails at compile time rather than falling back from inside a
compiled region.

## Consequences

The first slice is intentionally smaller than a general arena language, but it
establishes the hard parts: lexical ownership, all-exit cleanup, live exact
state, in-place GMP arithmetic, deterministic resource limits, backend
selection, and source-transparent fallback. The post-witness profile decides
whether records, maps, general arenas, or owned aggregate returns are next.

Canonical packed buffers remain the public ABI and detached proof format. A
native workspace can accelerate construction or live verification but can never
substitute identity or liveness for canonical authentication.
