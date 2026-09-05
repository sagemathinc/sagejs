# Fixed slices and borrowed workspaces

These features change source expression, not mathematical algorithms or arena
limits. Ordinary Python remains the fallback; native lowering emits only
existing typed exact operations and direct native helper calls.

## Fixed-capacity vector slices

```python
workspace[base : base + 10] = (prime, 1, 2, 0, 0, 0, 0, group_count, 1, 0)
```

The initial compiled surface accepts `NativeIntegerVector`, explicit `uint64`
bounds, no step, and a literal tuple of statically known length. The range must
be inside the vector and have exactly that length. Empty ranges at the end are
valid. Negative indices, implicit clipping, resizing, general iterables,
extended slices and augmented slice assignment are not supported. Ordinary
Python list semantics are unchanged. The fallback also accepts an explicit
unit step; the initial compiler rejects any explicit step.

RHS expressions are evaluated before bounds, in order. Potentially aliased
reads are snapshotted before writes, so permutations and side-effecting helper
calls preserve the old values. Stable scalar locals do not need another copy.
Integer literals can be materialized immediately before their store because
their evaluation has no effects or type failures. This avoids keeping one GMP
temporary per literal live across the entire assignment.

Range and arity errors occur before writes. This is **not** a transactional
allocation primitive: exhaustion during a store may leave an already-written
prefix, just as a sequence of exact scalar stores can. Native failure unwinds
the owner scope; a failed public call does not publish partial output. No heap
tuple or host callback is introduced by native lowering.

## Borrowed workspace bundles

```python
class ProofScratch(NativeWorkspace):
    relations: FmpzMatrix
    candidates: NativeIntegerVector

def certify(scratch: ProofScratch, count: uint64) -> int:
    scratch.relations[0, 0] = scratch.candidates[0]
    # Continue using the original resident owners.
    return scratch.relations[0, 0]
```

Construct a bundle locally from existing owners using positional arguments.
Fields bind immutably; the referenced storage remains mutable. The initial
surface supports arena vectors and declared owned FFI resources, not nested
bundles or `NativeIntegerMatrix` helper borrows. Underscore-prefixed fields are
reserved. Schemas have required annotations and an optional docstring, not
methods, defaults or decorators.

Native compilation flattens helper parameters and projects fields to the
original owner bindings. Construction validates live members even if the
bundle is unused. No native aggregate, new checkpoint, owner copy or extra
resident allocation results. Shared members remain aliases. Bundle parameters
are private to native calls, not a public host ABI.

Returning/storing a bundle, rebinding a field or an owner while borrowed,
using it outside its lexical binding, and passing an incompatible schema are
compile-time errors. Existing owner checks still apply after projection.
Fallback construction retains owners and checks liveness on access; retaining
a Python bundle never reopens an expired arena.

## Qualification

Focused tests cover ordinary Sage.js and CPython fallback, generated
JavaScript, GMP and fmpz; aliasing, mixed matrix/vector and nested calls;
evaluation order and rejected forms. The bundle fixture compares executable
IR against explicit arguments, excluding only provenance and renamed
parameters. The sanitizer fixture repeats resource/range/width failures and
success with promoted integers, checking that failed output stays untouched.

`bench/native-source-compression.cjs` runs paired, alternating-order samples
against compiled `native_fixed_slice.py` and `native_workspace_bundle.py`.
Build first; run on an otherwise idle dedicated machine. Both variants create
fresh workspaces, use identical arithmetic and retain the existing limits.
Long promoted helper loops can exhaust the existing temporary checkpoint even
without bundles; the benchmark uses bounded loops and repeated fresh calls,
not larger limits.

### Dedicated opt measurements, 2026-09-05

AMD EPYC 7B13, Linux x64, Node 26.7.0, pinned to CPU 1. Each sample comprises
100 fresh calls of 1,000 resident iterations; five warmup pairs followed by
30 alternating-order pairs. Times below are median milliseconds per sample.

| Feature | Backend | Input bits | Explicit | New syntax | Ratio |
|---|---|---:|---:|---:|---:|
| Slice | GMP | 3 | 12.692 | 12.685 | 0.9995 |
| Slice | GMP | 301 | 12.956 | 12.943 | 0.9990 |
| Slice | fmpz | 3 | 8.630 | 8.656 | 1.0030 |
| Slice | fmpz | 301 | 78.733 | 78.328 | 0.9949 |
| Bundle | GMP | 3 | 19.372 | 19.390 | 1.0009 |
| Bundle | GMP | 301 | 22.983 | 22.993 | 1.0004 |
| Bundle | fmpz | 3 | 2.716 | 2.724 | 1.0031 |
| Bundle | fmpz | 301 | 76.226 | 76.227 | 1.0000 |

Compiled artifact keys: slice
`df1d1025b209993c3feaf15867eb7dc32537c3e18b113ba794785b878300a3a7`,
bundle `b3007c0282c30badedfcc82a739e8f3f4b9169259b7c1c1dd66a837662451d29`.
An earlier slice version regressed promoted GMP by 21%; it materialized all
literal temporaries before any store. The revised lowering removes that
avoidable lifetime overlap. Do not characterize this corrective comparison
as a mathematical speedup.

Standalone allocation probes report identical before/after checkpoint peaks
and allocation counts for both features, both backends and both input sizes.
For example, promoted GMP slices use 528 bytes / 9 allocation calls, and
promoted GMP bundled helpers use 208,240 bytes / 3,003 calls in both forms.
These are checkpoint statistics, not a claim that every external allocator
throughout Sage.js is instrumented.

Full cubic/public-receipt and cross-platform release qualification remains
open; these microbenchmarks alone do not establish it.
