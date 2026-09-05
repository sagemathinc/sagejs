# N2 centered arithmetic region

This follow-up starts at the isolated-sum foundation in draft PR #146. It is
still **private implementation work**, not a public backend/default or a
completed N2 milestone.

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
semantics remain untouched until an authenticated ingress path is integrated.

## Current evidence

- 198 CPython/exact-rational transformation cases check rounding at each
  subtraction, division and multiplication, including offsets, subnormals,
  overflow, signed zeros, zero scales, nonfinite input, capacity rejection and
  prefix/sentinel preservation.
- Native C and JavaScript IR agree bit-for-bit. The actual emitted Wasm passes
  those cases in Node and real Chromium, Firefox and WebKit workers. Any host
  import invocation in the Wasm witness fails the test.
- A separate ordinary Sage.js execution verifies the dynamic same-source path.
- Architecture checks and strict Python (369 modules, zero errors) pass.
- Tests use the unchanged, previously built compiler and explicit new source,
  not a newly qualified full application. These centered functions do not yet
  have their own four-platform public/package receipts.

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

## Next integration

Connect a complete checked public statistics operation and explicit retained
data/query lifecycle to an independently lazy floating native/Wasm pack. Retain
the generic path for user iterators, float-conversion hooks and cancellation
callbacks unless the same observable order is preserved. Prove allocation,
aliasing, missing/corrupt resources and forced fallback, then measure the whole
public call against the frozen baseline. Do not disguise preprocessing as warm
reuse or count this arithmetic-region result as the 10 ms `describe()` target.

This is an integration-owned continuation, not a newly delegated parallel
lane. `parallel:check` finds 365 inherited live manifests rather than a unique
task; it is not reported as passing or worked around by editing other lanes.
