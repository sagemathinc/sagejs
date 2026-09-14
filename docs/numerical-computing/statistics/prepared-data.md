# Owned data for repeated descriptive queries

`StatisticsData` is a Sage.js extension, not a NumPy or Sage compatibility API.
It copies finite binary64 observations once and owns the workspace used by
subsequent `describe()` calls. Preparation does not compute or cache a summary.

```python
from sagejs.numerics.statistics import StatisticsData, describe

observations = [1.0, 2.0, 4.0, 7.0]
with StatisticsData(observations) as data:
    observations[0] = 1000.0  # The retained sample is unaffected.
    sample = describe(data)  # ddof=1, independent checks, summary trace
    population = data.describe(ddof=0, trace="none")
    assert sample.value["mean"] == 3.5
    assert population.value["variance"] == 5.25
    print(data.preparation())
    print(sample.explain())
```

The default backend is ordinary Python, including in browsers and CPython.
`StatisticsData(observations, backend="native")` explicitly requests the
source-compiled arithmetic workspace. It is selected only when the complete
matching native kernel set is available; otherwise the same public operation
uses the ordinary Python fallback. Inspect `data.backend` and the result's
backend/provenance instead of inferring selection from the request. Missing or
stale artifacts never trigger a hidden compilation or exact-library download.
No FLINT, PARI or Plotly load is required to prepare data or compute a summary.
The Node tests enforce this. The existing browser worker nevertheless eagerly
downloads FLINT, algebraic and M4RI backends during startup, before the numerical
call. Statistics adds no further backend downloads, but a lightweight browser
startup is still an unresolved product requirement, not a property of this API.

The optional route compiles the actual typed Python bodies for accurately
rounded finite summation and centered transformations. It retains the existing
corrected two-pass variance, type-7 quantiles, MAD and independent result checks.
It is not a fast-math or relaxed-accuracy mode. Browser execution currently
retains the ordinary public fallback: isolated Wasm kernel tests are not a
claim that the prepared public Wasm workspace is integrated or packaged.

## Ownership, limits and interruption

- Inputs are copied, not borrowed. `to_list()` returns a detached copy; changing
  it cannot change future results. Each query returns a fresh structured result.
- `close()` is idempotent and releases retained storage. Queries and exports
  after closure raise `ValueError`. A context manager closes automatically.
- One object supports one active query. Reentrant queries, exports and closure
  during an active query raise `RuntimeError`; no writable workspace alias is
  public. Use separate owners for independent concurrent work.
- `max_buffer_bytes` defaults to 64 MiB and bounds logical binary64 storage at
  80 bytes per retained observation plus 16 bytes. It does not cap Python object
  overhead, process RSS, results, or rendering. Exceeding it raises `MemoryError`.
- Setup accepts `budget`, `cancel`, and `nan_policy`. It preserves per-item
  iterator/conversion order and charges even NaNs discarded under `"omit"`.
  Setup stops raise the statistics resource-stop exception; no usable partially
  initialized object is returned.
- A prepared query charges its entire observation count before arithmetic.
  Resource/cancellation stops return an unsuccessful structured result.
  Cancellation checks occur between complete arithmetic/sorting phases, not
  within them. There is no hard real-time interruption guarantee; worker
  termination remains the host's mechanism for a hard deadline.
- Generic iterables retain their existing per-item conversion and callback
  semantics. A subclass overriding iteration is handled as an iterable, not
  silently treated as the base owned-data object.

## Measuring the benefit

Report setup, first query and retained-query latency separately. A one-shot
comparison must include preparation; a kernel-only timing omits most public
work. The development collector is:

```sh
node bench/numerics/performance/prepared-statistics.cjs --output build/prepared-statistics.json
```

It checks public values and validation against CPython and compares generic,
prepared-dynamic and prepared-native queries with both trace policies. It is
not a four-platform acceptance receipt, a cold-install benchmark or a promise
that the program's 10 ms public target has been met. Default selection remains
unchanged until complete public, browser and packaging qualification.
