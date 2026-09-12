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
compile-time errors. Schema names cannot be rebound by assignments, loops,
context-manager aliases, imports or replacement definitions. Constructors and
bundle helper calls require positional arguments without `*`/`**` expansion;
named arguments are rejected, never silently discarded by flattening.
Existing owner checks still apply after projection.
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

### Public replay and release qualification

Both final production rebuilds pass all seven cubic public/closure tests,
including authenticated receipts, independent exact replay and the promoted
large-regulator witness. The prerequisite production-pack suite passes all
eight tests. The staged mathematical branch additionally passes eighteen
public/arithmetic/scheduler tests. These checks are separate from the fourteen
paired timing fields: timing agreement alone is not certification.

The [qualification artifacts](https://github.com/sagemathinc/sagejs/releases/tag/native-source-compression-2026-09-05-f66f1ccc)
preserve the before/after Python sources, raw paired timing records, resource
probes, bundle-IR comparison and test transcripts outside Git. The optimizer
snapshots have distinct logical digests: prerequisite
`13ce6f39cf620c21a669d9fce6d48f2f3d96c73ca70256c6c13f9ef6cb370bee`
and staged mathematics
`3382c44514037290603db4edcca46ef772749ac2b3329ba2328739cb29d00e32`.
Their manifests identify the corresponding published canonical exports and
SQLite assets; refreshing an inventory is not itself resource qualification.

Full cross-platform release qualification remains pending. The local full
native suite passes the feature, compiler, ownership and matrix-migration
checks but fails three existing rational-matrix performance budgets (roughly
34–35 ms against a 15 ms limit). The clean pre-feature `cf82b0eb` baseline
also fails those same budgets at roughly 35 ms. No thresholds are relaxed,
and the full native suite must not be reported as passing. Draft PRs remain
subject to these explicitly recorded release gates.

#### Production Wasm export review

The first current-source Wasm builds failed the older export allowlist. Both
the prerequisite and staged builds produce exactly the same new ABI inventory.
Reviewing the complete import/export multiset (normalizing only generated
`m_<16 hexadecimal digits>` source namespaces) finds:

- No changed imports or new Wasm modules.
- One added FLINT adapter export,
  `sagejs_wasm_ffiIntegerLogSqrtBallsPrefixResource`, for the already declared
  logical-prefix Arb operation.
- Removal of the cubic public bridge and its eight per-core runtime exports.
  This is required by the existing `b76b8605` target guard: the resident fmpz
  integer buffer requires 64-bit FLINT limbs, while wasm32 has 32-bit limbs.
  The inventory explicitly records that one unsupported function and its
  same-source fallback. Do not restore the unsafe bridge or claim the full
  native cubic program executes in browser Wasm.
- No other semantic export changes; the GMP pack retains all 318 exports.
  The FLINT adapter has 491 exports and its native pack has 351. Other changes
  are authenticated source-namespace renaming.

The allowlist refresh records that reviewed inventory; it neither enables an
unsupported target nor changes a memory/resource budget. Generic slice and
bundle WASI witnesses remain distinct from the full cubic target capability.
The corresponding production capability ledger also includes the one added
prefix-Arb adapter; both ledgers must agree before a build can issue its receipt.
`packages/flint-wasm/test/integer-log-sqrt-prefix.test.mjs` checks the actual
Wasm adapter's exact endpoints, ignored poisoned tail, invalid active entry
exception without mutation, and resource cleanup. Its public Chromium witness
also passes. Only after these executions was the public capability report moved
from planned to available; the routine Chromium workflow requires this witness.

#### Final release-gate status

The [follow-up evidence release](https://github.com/sagemathinc/sagejs/releases/tag/native-source-compression-final-2026-09-05-2dde994e)
preserves both final Wasm receipts, passing routine Chromium parity, the
prefix/ownership witnesses and portable run, plus the native QQ failure and
its pre-feature reproduction. The earlier source/timing release remains
immutable and unchanged.

The final prerequisite Wasm artifact is
`sha256:c78bcc171b86bcbbfa6d2a6095d0c6c412b90698d437faffa3f1e73bdd5f4998`;
the staged artifact is
`sha256:7415e1b120ded47b75282d683bed118738f8d65422ddacf2b089220e2da41d0c`.
Both pass receipt validation and routine Chromium parity. Browser serialization,
interruption and memory checks also pass.

The combined prerequisite browser package fails the existing eager-core payload
gate: gzip is 14,622,048 bytes against 14,107,000, and Brotli is 8,115,742 against
7,860,000. This measures the combined branch, not an isolated feature delta;
the growth has not been causally attributed to source compression. No packaging
limit is raised. Alongside the reproduced native QQ timing failures and pending
native platform matrix, this leaves full release qualification open despite the
passing feature, allocation, controlled timing and exact mathematical tests.

#### Final semantics review and payload attribution (2026-09-06)

The final review reproduced and closed three rejection gaps: loop/context
bindings and module-level rebinding could shadow workspace schemas; call
flattening could discard keyword metadata. Both are Python semantic errors,
not optimization opportunities. The 19-test fixed-slice/workspace/resource/
sanitizer/WASI suite passes with these guards. The strict Python check passes
for all 247 selected modules. Re-lowering the full staged program with the
`2dde994e` prepass and the final prepass gives identical executable IR across
all 101 functions after removing provenance only, with SHA-256
`1f6f6ea2854749156ebdbca72977a530943c30ffb4b54c6e8ad82e6ee20b425d`.
This comparison retains call arguments, ownership operations and allocation
operations; it does not normalize away mathematical or resource differences.

For browser attribution, rebuild `scripts/build-module-cache.cjs` and
`scripts/build-lazy-module-cache.cjs` in an isolated checkout of the immediate
pre-feature commit `fdd7ae63420cc7664b440788598e76f5f86865ef`. The self-hosted
compiler/runtime sources are unchanged across this comparison; module caches
are rebuilt against each checkout's Python sources. Using gzip level 9 and
Brotli quality 11/text mode on the resulting `dist/lazy-modules.json` gives:

| Lazy bundle | Raw bytes | Gzip bytes | Brotli bytes |
| --- | ---: | ---: | ---: |
| Immediate parent | 46,513,997 | 4,229,200 | 2,511,883 |
| Source-compression candidate | 46,539,295 | 4,231,713 | 2,513,447 |
| Delta | +25,298 | +2,513 | +1,564 |

There are no added/removed module entries; only `sagejs.native` changes.
Parent bundle SHA-256:
`6fe9f07ad6c87bcbe986b76749dc4caea3e2b9ee02636c3b552ec3de94a50a05`;
candidate:
`6258be7a1035fcf7b702f4d04dd9d8d0d99e6182a9250beecd94df1c1e91e928`.
This is a component comparison, **not** an authenticated full parent Wasm build.
It rules out this lazy-bundle feature delta as the explanation for the roughly
515 KB combined gzip overrun, without assigning all other package growth.

The release branch also predates reviewed mainline packaging policy:
`5aaf6360` already sets eager-core limits to 15,300,000 gzip / 8,460,000 Brotli
after the reviewed traitlets/IPython integration. The measured package fits
those limits, but this task does not copy a newer budget into its branch or
turn that observation into a passing branch release gate. Integration must
reconcile the applicable reviewed policy explicitly.

[Staged CI run 33992902179](https://github.com/sagemathinc/sagejs/actions/runs/33992902179)
independently reproduced the payload failure after successfully building the
artifact; its browser steps were skipped, not passed. Native jobs remained
queued behind the routine runner at this audit. Shared-host qualification was
requested on Discussion 104 without taking another lane's machines. Those
platform and release blockers remain outside the passing focused evidence.
