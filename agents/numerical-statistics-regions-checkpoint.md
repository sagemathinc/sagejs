# N2 centered arithmetic region

This follow-up (draft PR #148) starts at the isolated-sum foundation in #146. It now
has an **experimental public prepared-data opt-in**, not a new default or a
completed N2 milestone. Ordinary `describe()` and prepared-data defaults stay
dynamic. Browser/native production packaging and full product four-platform
qualification remain open; the fresh-source public API witnesses now pass on
all four hosts.

`_packed_centered.py` lowers the existing centered/scaled preparation into
ordinary typed Python: deviations, normalization, normalized squares and
pairwise products. Accurate reduction remains a separate call to the same
finite partials sum. This respects the current compiler's lack of float64
helper calls: four coarse native calls compute the mean and corrected centered
sum of squares, without hiding interpreter callbacks inside a generated core.
It does not introduce handwritten mathematical C or a different variance method.

The caller owns pairwise non-aliasing buffers and must impose memory/work
limits before dispatch. Inputs remain unmodified. Capacity/envelope rejection
does not publish the small output record; temporary workspace may have changed
and is discarded. The public generic iterator, cancellation and float-hook
semantics remain untouched; prepared queries have a distinct checked ownership
and budget contract. Qualified production artifact binding remains open.

## Current evidence

- 296 CPython/exact-rational transformation cases check rounding at each
  subtraction, division and multiplication, including offsets, subnormals,
  overflow, signed zeros, zero scales, nonfinite input, capacity rejection and
  prefix/sentinel preservation.
- Native C and JavaScript IR agree bit-for-bit. The actual emitted Wasm passes
  those cases in Node and real Chromium, Firefox and WebKit workers. Any host
  import invocation in the Wasm witness fails the test.
- A separate ordinary Sage.js execution verifies the dynamic same-source path.
- The expanded prepared-data source passes all 21 focused tests, architecture,
  numerical-surface exhaustiveness, Python formatting and strict Python
  (371 modules, zero errors). The source-current optimizer inventory is
  `6c80de578555637d062cd6d2f20e3298db1adacb7cac1e55867b8fcd6b03d967`.
- Frozen `3fc0831aa` public/source reruns pass 21/21 on Linux x64, Linux ARM64
  and macOS; Windows passes 18 with three unavailable WASI builds explicitly
  skipped. Tracked source/compiler/test hashes agree on all four hosts. The
  [receipts](../bench/numerics/performance/results/n2-prepared-source-2026-09-05/README.md)
  distinguish fresh imports with rebuilt host tools from full product packaging.
- A separate owned local eight-stage build passes (11m52s), including current
  compiler/module/runtime caches. Dynamic, native-opt-in and missing-cache
  public witnesses pass without `SAGEJSPATH`, and all 21 focused tests pass again
  against the new compiler. Five optional native adapters and the FLINT-based
  production pack are absent: this proves the independent binary64 path, not
  full exact-library/npm/SEA packaging.

The kernel opportunity runner is:

```sh
node bench/numerics/performance/packed-centered.cjs --output build/centered.json
SAGEJS_NUMERICAL_BROWSER_TESTS=1 node --test test/numerics/performance/packed-centered.cjs
```

One local development run measures the 20,000-value **mean plus corrected
centered sum of squares** at 0.807 ms with reused native buffers, 1.137 ms with
input/workspace allocation, and 72.0 ms through JavaScript IR. The matching
CPython source and raw samples are retained separately. These are provisional
arithmetic-region opportunities on a source-hashed working candidate, not paired
public-call speedups or promotion thresholds. Public input conversion, per-item
budget checks, sorting/MAD/quantiles, independent result validation, structured
results and traces are excluded and remain significant costs.

## Checked public data and query lifecycle

`StatisticsData` copies finite observations and reuses exclusively owned
input/workspace. The full public `describe()` query still recomputes accurate
reductions, ordering, MAD, independent validation, structured results and traces.
There is no cached answer or precomputed sort hidden in preparation. Generic
iterators preserve their old per-item float/cancellation/work-budget behavior;
prepared queries have a separately documented atomic sample charge and coarse
phase checks. Memory charging is explicitly logical binary64 capacity, not RSS.
Mutation of originals/exports, close, cancellation, reentrant use, missing/stale
artifacts and unavailable native execution are regression-tested.

The complete path exposed boxed Python float scalar rejection in the native
wrapper, corrected in foundation commit `bb6a9d3b8`. It also exposed integer
retagging when publishing integral extrema from packed storage: the public
boundary now restores float types, including signed zeros. Stable buffer
sorting uses the host engine outside isolated mathematical cores and preserves
the source order of equal values (the default typed-array sort would reorder
opposite signed zeros). No handwritten sorting algorithm or mathematical C
implementation is introduced.

Local development public queries on the N0 20,000-observation input measured
238–242 ms with generic ordering, then 32–34 ms with stable packed ordering,
versus approximately 1.55 s for generic `describe()`. **Preparation remains
roughly 0.50–0.53 s and is reported separately.** The corresponding CPython
prepared query is about 8 ms. These source-hashed working-candidate observations
are not a frozen paired crossover, default-promotion proof, or the 10 ms target.
Both raw records are retained under
`bench/numerics/performance/results/n2-prepared-development-2026-09-05/`.

## Next integration

Connect this checked public statistics operation and explicit retained
data/query lifecycle to an independently lazy floating native/Wasm pack. Retain
the generic path for user iterators, float-conversion hooks and cancellation
callbacks unless the same observable order is preserved. Prove allocation,
aliasing, missing/corrupt resources and forced fallback, then measure the whole
public call against the frozen baseline. Do not disguise preprocessing as warm
reuse or count this arithmetic-region result as the 10 ms `describe()` target.

This is an integration-owned continuation, not a newly delegated parallel
lane. `parallel:check` finds 365 inherited live manifests rather than a unique
task; it is not reported as passing or worked around by editing other lanes.
