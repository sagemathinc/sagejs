# N2 optional public floating-pack preparation

Work continues from draft PR #149 on `perf/numerical-statistics-lazy`.
This is experimental explicit-only integration, not automatic selection or a
release qualification. Existing eager payload ceilings are unchanged.

## Boundary

`SageSession` accepts an optional `floatingKernels` manifest URL. Without that
option, it does not import the new host loader or fetch a floating pack. With
the option, the first compiled statistics-family import prepares one worker-owned
pack before Python executes its `@native` decorators. The normal default
`StatisticsData` backend remains `dynamic`; `backend="native"` requests the
compiled path and keeps the same-source implementation if unavailable.

The loader checks the complete manifest's Python source hashes against the
separately validated lazy-module bundle before fetching Wasm, then uses the
existing digest-authenticated loader and source/ABI/declaration/portable-identity
resolver. It rejects exact-library domains, archives, foreign declarations,
ownership adapters, unexpected asset paths and oversized transfers. Concurrent
preparations share one promise; missing, stale, corrupt and timed-out loads are
cached as unavailable for the session. Closing aborts an in-flight fetch and
prevents late resolver publication. Fetch limits are 2 MiB for JSON, 16 MiB for
Wasm, and 10 seconds by default. They do not claim that WebAssembly compilation
or a running synchronous kernel can be preempted by a timer.

Three conditionally imported private modules were absent from the generated
browser bundle despite the public statistics package being present. Explicit
precompile roots now retain `_packed`, `_packed_centered` and `_prepared_native`.
This does not eagerly execute those modules in user sessions.

The full browser evaluator still initializes its existing exact-math backends.
This change keeps floating acceleration independent of those libraries; it does
**not** establish a FLINT-free full-browser startup. The new helper has a separate
lazy topology group, rather than being added to the eager source list.

## Developer reproduction

After the ordinary compiler/module and browser builds, create the optional pack:

```sh
node tools/native-kernel/wasm-production-pack.cjs --isolate-float64 \
  --manifest packages/flint-wasm/numerical/floating-kernels.json \
  --output build/numerical-performance/optional-floating-kernels
```

Serve the resulting `index.json` and its `packs/float64/*.wasm` subtree alongside
the matching browser runtime. Pass that manifest URL as `floatingKernels` to
`createSage`; then evaluate ordinary Python:

```python
from sagejs.numerics.statistics import StatisticsData
with StatisticsData([1.0, 2.0, 4.0, 7.0], backend="native") as data:
    result = data.describe()
    print(data.backend, result.value, result.validation.to_dict())
```

The descriptor file uses the existing builder's production-manifest shape but
is explicitly experimental. It is not part of the default exact production
manifest, published npm/SEA assets, or automatically authenticated release
capability matrix.

Keep this optional output outside the production `dist` directory: its ABI
allowlist intentionally rejects unreviewed extra Wasm artifacts. No default
production ABI addition is needed for this explicit developer resource.

## Evidence and remaining work

- Four source functions produce a 57,847-byte Wasm pack with nonexistent exact
  prefixes; local gzip is 23,987 bytes, Brotli 19,633. These exclude manifest,
  Python source, worker/runtime startup and prepared data.
- Focused lazy lifecycle/authentication tests pass, including oversized streaming
  responses, timeout, missing/corrupt resources and immutable source bindings.
- The public browser source witness passes the existing prepared-data correctness,
  ownership, cancellation, budget and fallback corpus through `createSage` in
  Chromium, Firefox and WebKit. Each passes four independent sessions: disabled,
  floating, stale and missing. The disabled session never imports the optional
  loader; the floating session proves actual Wasm execution. This is source
  integration evidence, not a release receipt or a performance measurement.
- Its first execution stopped before statistics because a previously built
  local exact artifact lacked a numeric export required by the runtime. A fresh
  isolated rebuild supplied matching exact assets. The final ABI gate initially
  rejected the optional pack in production dist; moving it outside dist restored
  the unchanged 15-module ABI check. The subsequent real browser run exposed
  absent `builtins` initialization. Explicit compiler-generated bootstrap now
  precedes lazy imports and native-hook installation. All twelve browser cases
  pass after that fix (109 seconds total harness time on this host).
- Current focused checks: 21 resource/lifecycle tests, 10 native/dynamic/CPython
  regressions, 12 host/session tests, 25 qualification-contract tests, and
  architecture pass. NLopt metadata remains pending, not promoted.

Still open: release-artifact browser qualification, artifact-bound public provenance,
independently lazy native packaging, clean npm/SEA and minimum-Node checks,
four-platform candidate receipts, sustained memory/cancellation evidence and
frozen paired full-query/startup timings. The 10 ms statistics target remains
unmet. No new performance gain is inferred merely from loading Wasm.
