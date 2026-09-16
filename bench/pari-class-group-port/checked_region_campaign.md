# Checked-region campaign

This campaign follows the fixed-width splitting-degree result recorded in
`exact_islands_campaign.md`.  It asks why the source-transparent tagged kernel
still takes about 3.33 ms per frozen catalog while a mechanical C emitter for
the same algorithm and storage takes about 1.39 ms.

## Frozen boundary

- source commit: `111fa4e8e`
- safe generated core:
  `0a1acf1907ae2438d44b39f98db32bb8db650f0fb201cc4a5ec9d0f79ef7eed7`
- fixture: `/tmp/sagejs-int64-prime-degree-catalog-fcTr9K/fixtures.json`
- active outputs per invocation: 7,081
- compiler optimization level: GCC `-O3`, matching the mechanical-C control

All timings below use the same tagged entry, the same packed fixture, warmup,
and alternating-process-order measurements.  Temporary generated-C variants
are diagnostics rather than proposed source artifacts.

## ABI and inlining are not the primary gap

Letting GCC choose whether to inline word helpers, forcing every helper
out-of-line, and changing eligible helpers to return scalars directly did not
materially close the gap.  Representative results were 3.29 ms with ordinary
inlining choice, 3.24--3.25 ms with forced no-inline helpers, and 3.32 ms with
the direct scalar ABI.  The direct ABI and ordinary ABI were also identical at
about 2.16 ms after removing the same diagnostic checks.

The generated function/status ABI is therefore not responsible for the large
remaining difference.

## Dynamic check counts

One exact tagged catalog invocation executes:

| check | dynamic executions |
| --- | ---: |
| checked signed addition | 4,120,256 |
| checked signed subtraction | 557,230 |
| checked signed multiplication | 114,326 |
| `Int64Buffer` bounds | 116,675 |
| `UInt64Buffer` bounds | 2,301,573 |
| division/remainder zero guards | 606,402 |

Removing only `UInt64Buffer` bounds diagnostically gives about 3.03 ms.
Removing signed overflow and `Int64Buffer` checks gives about 3.18 ms.  Removing
all fixed-width arithmetic and buffer checks gives about 2.17 ms.  These
variants are deliberately unsafe and are useful only as ceilings.

Signed-add attribution localizes the problem further:

| translated Python function | checked additions |
| --- | ---: |
| `_int64_pari_flx_divrem` | 1,246,508 |
| `int64_pari_flx_copy` | 1,222,531 |
| `int64_pari_flx_sqr` | 721,153 |
| `int64_pari_flx_mul` | 293,538 |

Those four readable routines account for 84.6% of all dynamically checked
signed additions.  Their hot expressions are ordinary indexing expressions
such as `w[out + i] = w[a + i]`: the compiler first checks `out + i` for signed
overflow and then checks the result against the buffer length.

## Four-routine ceiling and safe dispatch

Removing fixed-width arithmetic and `UInt64Buffer` checks only inside those
four routines changes 3.27 ms to 2.25 ms.  Removing the checks throughout the
whole graph gives 2.17 ms in the same run.  Thus these four routines account
for roughly 98% of the recoverable check cost.

A second diagnostic retained each original checked routine as a cold slow
path and added a fast clone selected only after validating:

- every referenced base owns a complete nine-word span;
- every degree lies in the routine's actual small-polynomial range; and
- a nonzero leading coefficient exists where a loop relies on normalization.

All 103,173 calls selected the fast path on the frozen catalog.  Direct
adversarial calls with short spans, negative bases, excessive degrees, zero
leading coefficients, and a negative divisor degree agreed with the original
kernel in result or exception, error text, and post-error buffer contents.

With fast clones forced inline and checked clones cold/out-of-line, this safe
diagnostic takes about 2.67 ms.  The remaining 0.42 ms relative to the
four-routine unchecked ceiling is the cost of repeating equivalent span and
degree preflights at every helper call.

## Negative experiments

- Optimizing the provably safe default-unit `int64` range latch removed 114
  static checked-add sites but did not improve catalog time.  It is not the hot
  proof.
- Adding equivalent ordinary Python guards to the four routines made the
  kernel slightly slower (about 3.33 ms).  GCC did not propagate those facts
  through the generated control flow.
- Adding explicit C unreachable assumptions after those already-enforced
  guards did not help.  The proof must live in Sage.js IR/code generation.

## Compiler target

The next implementation should represent a **checked fixed-width region**:

1. validate borrowed workspace spans and bounded scalar controls once;
2. retain the original checked implementation as the exact slow path;
3. propagate the validated facts through internal helper calls;
4. omit only operations proved safe by those facts; and
5. preserve dynamic fallback behavior and public invalid-input semantics.

For this workload, establishing the region at the catalog/workspace boundary
should eliminate the repeated 103,173 helper preflights and target the measured
2.25 ms four-routine ceiling.  This is also the natural compiler form of a
borrowed workspace bundle: one checked lease, many source-readable arithmetic
operations, no per-access sacrifice of Python safety.

## Outer checked-region result

A final generated-C diagnostic implemented that boundary directly:

- every public helper export retained its original checked implementation;
- the catalog entry retained a complete checked slow path;
- the catalog wrapper checked degree, multiplication overflow, and every input,
  scratch, metadata, state, and output capacity once; and
- only a successful preflight entered a private fixed-width clone graph.

The private graph is not callable through the host module. Calls failing the
outer contract enter the original implementation, so this is materially
different from compiling the public API with bounds checks disabled.

Alternating timings were:

| implementation | geometric mean (ms/catalog) |
| --- | ---: |
| current safe tagged compiler | 3.2915 |
| outer checked region | **1.6307** |
| global unchecked diagnostic | 2.1663 |
| matched PARI output contract | about 2.03 |
| mechanical-C ceiling | about 1.39 |

The region beats the broad unchecked diagnostic because its closed private call
graph is substantially easier for GCC to optimize. It is about 20% faster than
the matched PARI output contract and only about 17% above the mechanical-C
ceiling.

Validation was deliberately independent of the timing loop:

- all four frozen packets matched their complete CPython-derived result and
  post-call buffer snapshots (including the 7,081 active outputs in the large
  packet);
- short state, bad degree, short coefficients, short primes, short word
  workspace, short output, nonmonic input, invalid prime, and oversized-prime
  calls matched the original safe kernel in result or exception, error text,
  and every post-call buffer value; and
- a `-fsanitize=undefined -fno-sanitize-recover=all` build replayed all four
  packets exactly without a sanitizer report.

This establishes the central language/runtime answer for the experiment: the
readable translated Python graph can execute in the PARI performance regime.
The remaining engineering task is to make the checked-region proof a normal,
inspectable compiler artifact rather than a generated-C diagnostic.

## Checked unsigned-word views

The first source-facing compiler primitive is a checked mutable
`UInt64Buffer` subview. Refactoring only the four dominant polynomial routines
to name their source and destination spans reduced the safe tagged catalog from
about 3.29 ms to **3.01 ms**, while all four frozen packets and all JavaScript,
GMP, and tagged post-call buffer snapshots remained exact. This shallow change
removes repeated base-plus-index overflow checks but still constructs and
checks the spans at every helper call.

The direct public refactor is intentionally not a production endpoint.
Adversarial helper calls show that eager span construction can move an error
before the original partial writes, validate a quotient-only remainder that is
never used, and change malformed negative-index behavior. Production lowering
must therefore retain the original checked public functions and put the
view-based bodies in private variants selected only after the outer nonmutating
contract succeeds. This is consistent with the 1.63 ms diagnostic and makes
fallback preservation an architectural property rather than a test-corpus
assumption.

## Verified fixed-span element proofs

Compiler commits `456bb4e82`, `4ed14b529`, and `ae06e083e` add the first
fail-closed proof chain rather than a generated-C diagnostic:

- constant `int64` ranges carry a latch-overflow proof;
- a checked nine-word `UInt64Buffer` view plus its exact `range(9)` iterator
  produces a serialized element-bounds claim;
- an independent verifier reconstructs view dominance, loop extrema, and
  loop-carried definitions before installing a private, nonserializable trust
  marker; and
- native code generation clears and reconstructs those markers, so copied,
  forged, stale, or mutated IR cannot authorize unchecked access.

The verifier rejects dynamic spans/stops, negative and affine indices, wide
ranges, rebound views and indices, nested implicit loop writes, and mutation
through exact-resource scopes. The checked view-construction guard and the
JavaScript oracle remain unchanged.

The exact earlier four-routine view source (SHA256
`ae528f705b9203bf6d129ab9487b23e9866f2a147d8f1a18471a0aa00e70c5a3`)
was compiled with and without the element proof. All four frozen packets
matched complete expected results and post-call buffers under JavaScript, GMP,
and tagged execution for both builds, including all 7,081 active outputs.

The proof covered three source accesses: fixed nine-slot clearing in division
and squaring. Across emitted representation copies this reduced static
`sagejs_signed_buffer_index` sites from 345 to 333, generated C from 4,928,650
to 4,924,176 bytes, and ELF `.text` from 308,687 to 308,495 bytes. Instrumented
tagged execution removed 600,489 dynamic checks per catalog, from 2,241,327 to
1,640,838 (26.79%).

Two independent seven-pair alternating runs nevertheless showed only a small
timing change. The pooled geometric means were:

| implementation | geometric mean (ms/catalog) |
| --- | ---: |
| checked views without the proof | 3.11993 |
| verified fixed-span proof | 3.10680 |

The ratio is 0.995792, or about 0.42% faster. These predictable clearing checks
are numerous but cheap. The result narrows the next compiler target to affine
and dynamically bounded hot accesses (`j`, `i-j`, and `v+i`) and to the closed
private graph that enabled the 1.6307 ms diagnostic.

## Dynamic exact-span source refactor

A benchmark-only follow-up expressed the dynamic copy, normalization,
multiplication, squaring, and division spans as checked subviews followed by
`range(count)`. The source is
`/tmp/sagejs-view-proof-catalog-aGpIpX/int64_flx_small_dynamic_spans.py`
(SHA256
`713e41e2fc59cc6bc477aef26350fde67b4c57ef8b55b92c95d4bbf657194746`);
the exact transformation and malformed-input risks are recorded beside it in
`dynamic-span-refactor.md`. No production source was changed.

The compiler attached ten dynamic exact-span proofs and retained three
constant fixed-span proofs. Static `sagejs_signed_buffer_index` sites fell from
333 to 285. All four frozen packets and their complete post-call buffers
matched under JavaScript, GMP, and tagged execution, including the 7,081 active
outputs in packet zero.

The source-level construction was nevertheless slower in seven alternating
tagged pairs:

| implementation | geometric mean (ms/catalog) |
| --- | ---: |
| existing fixed-view proof build | 3.12252 |
| dynamic exact-span source | 3.77265 |

The ratio is 1.20821, or a 20.8% regression. Generated C also grew from
4,924,176 to 5,170,671 bytes. Materializing checked subviews inside each
convolution row costs more than the eliminated element checks and increases
code-size pressure. The production compiler must therefore virtualize and
eliminate proved views, or prove affine accesses directly against an enclosing
checked view; repeatedly constructing source-visible inner-loop views is not a
viable optimization.
