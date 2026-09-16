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
