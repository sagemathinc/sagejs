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

### Reversed-span proof follow-up

Compiler commit `63c95798d` additionally recognizes the reversed access
`span[count - 1 - k]` under the same checked-view and `range(count)` contract.
Recompiling the unchanged dynamic-span source attached ten forward dynamic,
two reversed dynamic, and three constant fixed-span proofs. Static
`sagejs_signed_buffer_index` sites fell from 285 to 277 relative to the first
dynamic-span build (333 in the fixed-view baseline), while generated C shrank
slightly from 5,170,671 to 5,167,491 bytes. All four frozen packets and their
post-call buffers again matched under JavaScript, GMP, and tagged execution,
including all 7,081 active outputs.

Seven alternating tagged pairs against the fixed-view baseline measured:

| implementation | geometric mean (ms/catalog) |
| --- | ---: |
| existing fixed-view proof build | 3.10391 |
| dynamic spans with reversed proof | 3.69669 |

The ratio is 1.19098, so materialized dynamic views still regress performance
by 19.1%. A separate seven-pair direct comparison isolated the additional
proof: the forward-only dynamic build measured 3.80572 ms/catalog and the
reversed-proof build measured 3.70190 ms/catalog, a 0.97272 ratio or 2.73%
improvement. The extra proof therefore recovers a real but small part of the
earlier regression. View construction and associated code size remain the
dominant costs; virtualization or direct affine proof remains necessary.

## Private-graph inlining budget

The outer-region diagnostic also permits a controlled test of the final GCC
inlining decisions. The ordinary and candidate addons were rebuilt from the
same generated source with GCC `-O3`. The candidate added only:

```text
--param=max-inline-insns-auto=5000
--param=large-function-growth=1000
--param=inline-unit-growth=1000
```

A single process loaded both addons, warmed each for three batches, and then
ran nine alternating pairs of 1,800 complete catalogs per implementation. Each
call asserted the successful result; the source artifact had already passed
the complete four-packet output, post-call-buffer, adversarial-fallback, and
UBSan checks described above. The paired result was:

| private graph | geometric mean (ms/catalog) |
| --- | ---: |
| ordinary `-O3` budget | 1.61675 |
| enlarged inlining budget | **1.53931** |

The paired geometric-mean ratio is 0.95210, a 4.79% improvement. Individual
ordinary samples spanned 1.61525--1.61975 ms and candidate samples spanned
1.53811--1.54182 ms. The candidate is about 10.7% above the 1.39 ms
same-algorithm mechanical-C ceiling.

The improvement is not free. `size` reports 193,807 bytes of text in the
ordinary relocatable object and 474,473 bytes in the candidate, a 2.45x
increase. The ordinary build retains eight private region symbols totaling
33,743 bytes:

| surviving ordinary private symbol | bytes |
| --- | ---: |
| `tagged_int64_pari_flxq_sqr_region.constprop.0` | 954 |
| `tagged_int64_pari_flxq_mul_region` | 1,424 |
| `tagged_int64_pari_flx_gcd_region` | 1,744 |
| `tagged__int64_pari_flx_divrem_region` | 1,879 |
| `tagged_int64_pari_prime_degree_catalog_region` | 4,415 |
| `tagged_int64_pari_flxq_powu_region.constprop.0` | 5,438 |
| `tagged_int64_pari_flx_small_degfact_region.constprop.0` | 8,497 |
| `tagged__int64_pari_flx_small_ddf_region.constprop.0` | 9,392 |

The enlarged budget retains five: copy (341 bytes), normalize (886), quotient
squaring (3,133), GCD (3,237), and a 36,693-byte catalog body. Thus it removes
three more boundaries while concentrating much more code in the entry body.

An independent rebuild with `-fopt-info-inline-all` identifies the important
ordinary misses as budget decisions, not ABI impossibilities. They include
catalog to `get_fs`, `get_fs` to small-degree factorization, factorization to
squarefree/sort/DDF, DDF to its internal DDF and power/evaluation routines,
powering to quotient multiply/square, and remainder/division to the internal
division loop. GCC cites `max-inline-insns-auto` or `large-function-growth` for
the surviving late misses. This agrees with the symbol table and with the
measured benefit of increasing those limits.

This is evidence for a **targeted private-graph inlining budget**, not for
globally enlarging GCC's limits. The compiler knows which graph is guarded,
closed, hot, and has no externally callable private members; it can mark or
emit that graph as one optimization unit while leaving public checked paths
and unrelated generated code at normal size. The function/status ABI remains
useful for public and fallback paths. Within the proved private graph, the
compiler should first allow selective flattening of the measured missed edges,
then ratchet both time and code growth against this result.

## Targeted private-graph attributes

A follow-up kept GCC at the unchanged repository `-O3` flags and changed only
source attributes on the verified private graph. Every candidate reproduced
all four frozen packets and their complete post-call buffers exactly before
timing, including all 7,081 active outputs in packet zero. The final comparison
used three warmup batches and nine alternating pairs of 800 complete catalogs
per implementation in one process.

The useful policy was deliberately narrow:

- emit private-region functions as `static inline __attribute__((hot))`;
- mark the guard's complete checked fallback `cold`, so GCC keeps the guarded
  success path contiguous and inlines the private entry into the dispatcher;
  and
- force-inline only the small normalization helper in this diagnostic.

The paired results were:

| targeted source policy | geometric mean (ms/catalog) | ratio to baseline | relocatable `.text` | surviving private symbols |
| --- | ---: | ---: | ---: | ---: |
| ordinary `-O3` | 1.62021 | 1.00000 | 193,807 | 8 |
| hot inline private graph | 1.52363 | 0.94042 | 196,437 | 9 |
| hot inline graph + force-inline normalization | 1.50608 | 0.92956 | 195,073 | 8 |
| hot inline graph + cold checked fallback | 1.53834 | 0.94947 | 192,546 | 8 |
| combined policy | **1.48316** | **0.91541** | **191,182** | **7** |

The combined samples spanned 1.47756--1.48975 ms/catalog. It is 8.46% faster
than the ordinary private graph, uses 1.35% less object text, and is only about
6.7% above the 1.39 ms same-algorithm mechanical-C ceiling. The final ELF text
is 200,206 bytes versus 202,786 bytes for the ordinary build.

Broad forced inlining is specifically rejected by the experiment. Flattening
the entry measured about 1.58 ms and grew object text to 215,060 bytes. Forcing
all private children inline measured about 3.19 ms even though only the entry
symbol survived and total object text stayed near baseline. The relevant
quantity is therefore instruction locality and the quality of selected inline
edges, not call count alone. A production rule must derive any force-inline
choice from verified graph structure and emitted size rather than from the
mathematical function name.

### Name-independent force-inline threshold

The normalization result was then challenged with a name-independent sweep.
Candidates were selected only when their IR contained at most 8, 16, 24, 32,
or 50 operations, they had at most four static incoming private call sites,
and they contained at most six loop nodes. Each selected candidate was marked
`always_inline`; the rest of the graph retained the hot-inline and cold-fallback
policy. The 50-operation threshold includes normalization, but also the other
helpers satisfying the same structural rule.

All five thresholds reproduced the four frozen packets exactly. In a screening
run every threshold was slower than selecting normalization alone; the
50-operation threshold was the least bad. A seven-pair confirmation measured
1.55503 ms/catalog for that threshold, versus 1.53849 ms for the hot/cold graph
without forced edges and 1.51166 ms for normalization-only in the same run.
Thus the threshold was 1.07% slower than allowing GCC to choose, while the
single diagnostic edge was 1.74% faster.

This does **not** justify recognizing normalization by name. It establishes the
opposite: a simple source operation-count/call-count threshold does not explain
the profitable edge. The initial production policy should promote only the
general hot-inline private graph and cold guarded fallback. Selective
`always_inline` needs a compiler-derived edge-cost model or broader
cross-workload evidence before promotion; the 1.483 ms normalization result
remains an attainable diagnostic ceiling, not a name-specific emitter rule.
