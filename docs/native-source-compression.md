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

`NativeRecord` remains the fixed-layout value-record facility, including its
existing synchronous buffer-borrow ABI. A workspace is deliberately different:
it groups live arena/FFI owners without creating a value layout or public ABI.
Keeping these contracts separate avoids making an owned resource silently
copyable merely because it appears inside a record.
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

### Real staged cubic comparison

`bench/native-source-compression-cubic.cjs` compares the pre-migration staged
source with the slice/bundle migration. It explicitly selects relation effort
5, which enters the bundled staged proof, rather than effort 1. Each sample
contains ten fresh closed calls; four warmup pairs precede fifteen measured
alternating-order pairs on opt CPU 1. All 64 output slots agree between the
two implementations, and all fourteen fields are accepted with the expected
class number. This output comparison is not an independent certificate proof.

Candidate/baseline median ratios range from 0.9925 to 1.0041. Representative
whole native call times, in milliseconds:

| Field | Explicit | Slice/bundle |
|---|---:|---:|
| $x^3+9x-55$ | 2.991 | 2.993 |
| $x^3-x^2+3x-4$ | 2.147 | 2.156 |
| $x^3-32x-92$ | 4.992 | 5.003 |
| $x^3+30x-48$ | 5.961 | 5.979 |

Baseline artifact:
`b2f3f30228cfeda824ebb860d7e414e98558c0fd5f0bb60df1c4ff894f0027bd`.
Candidate artifact:
`13492e47d036ea622eadce8189f0fbbbb6367aeb97f722ab807a68c77b6811d0`.
With the same slice migration applied to both sides, the executable IR of all
101 functions agrees after normalizing flattened parameter names/order and
provenance. This isolates bundle erasure; it does not claim that adding
checked slices leaves the explicit-store IR byte-identical. The structural
check is stronger evidence of zero native bundle overhead than timing alone.

Nine initialization blocks now use slices. The staged proof helper groups
38 owners and drops from 73 source parameters to 36. This first migration is
primarily a reduction in argument plumbing: Ruff's multiline tuple formatting
means slices do not necessarily reduce line count. No source or arena budget
was raised for these features.

The staged Python module changes from 433,952 bytes / 11,672 lines to
433,603 bytes / 11,700 lines. Raw generated C grows from 12,050,111 to
17,429,302 bytes, predominantly because the candidate's much longer absolute
source path is repeated in provenance diagnostics. Replacing just the two
root source paths with the same marker gives 10,045,217 versus 10,134,294
bytes (0.89% growth). The compiled Linux module sizes are 20,321,008 versus
20,361,968 bytes (0.20% growth). Thus source-level bundle erasure does not
mean byte-identical generated text: flattened names, checked slices and
diagnostic provenance remain visible and are included in resource review.

Full final-artifact public-receipt and cross-platform release qualification
remains open; these comparisons alone do not establish it.
