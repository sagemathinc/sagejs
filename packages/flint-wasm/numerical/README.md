# Lazy numerical Wasm reactor

This directory contains the first qualified external numerical core for
Sage.js: cminpack's exact `lmdif` and `lmder` nonlinear least-squares methods.
It is a separately lazy universal Wasm artifact, not part of the FLINT binary.
The `sagejs-flint-wasm` workspace package owns this resource because it already
owns the browser evaluator and universal Wasm distribution. The reactor is
also copied as a separately lazy Node/SEA asset; it is never linked into FLINT.

The reactor imports one synchronous packed callback. Residual vectors and
complete column-major Jacobians cross in WebAssembly memory, so it does not
make one host call per scalar. The host adapter preserves callback exceptions,
checks finite values and memory ranges, bounds dimensions and memory, forbids
reentrancy, and deterministically frees every allocation before returning or
rethrowing.

## Honest method and fallback semantics

`cminpack-lmdif` and `cminpack-lmder` are exact implementation identities.
An explicit request either executes that method or fails with
`NumericalBackendCapabilityError`. It never silently substitutes Sage.js's
ordinary-Python `damped-gauss-newton` implementation. Only `method: "auto"`
may route to that dynamic fallback, and `solveLeastSquaresWithFallback`
returns a `backend_fallback` diagnostic recording the method change.

The low-level result exposes cminpack's termination status and counters but
always sets `independentValidationRequired: true`. Integration must recompute
residuals, convergence/feasibility criteria, diagnostics, and the public
`NumericalResult`; a backend success code is not mathematical validation.

The qualified envelope is:

- `1 <= n <= 256`, `n <= m <= 16384`;
- at most 64 MiB computed solver workspace and 128 MiB module memory;
- finite binary64 inputs, residuals, Jacobians, scales, and tolerances;
- synchronous callbacks owned by the evaluator worker; and
- callback-boundary evaluation, elapsed, cooperative, `AbortSignal`, or
  `SharedArrayBuffer`/`Atomics` cancellation.

## Worker ownership and recovery

Arbitrary functions cannot be structured-cloned. The correct browser layout
is therefore to instantiate the reactor in the existing Sage.js evaluator
worker, where the user's callback already lives—not to create a nested solver
worker. The browser main thread can set a shared atomic cancellation flag while
the worker is synchronously inside cminpack. A callback checks it before each
evaluation. If user callback code itself never returns, the outer evaluator
must terminate and recreate that worker; the reactor cannot preempt JavaScript.

Focused Node and Chromium tests cover both cooperative recovery and hard worker
replacement. Deployments that cannot enable cross-origin isolation may use
callback/evaluation/elapsed budgets, but cannot claim externally responsive
shared-memory cancellation.

## Authenticated build and qualification

`sources/cminpack-lock.json` pins the source archive, license, 53-case
Moré-Garbow-Hillstrom input, and upstream reference outputs by SHA-256. The
build verifies all of them, uses the repository's pinned WASI toolchain, and
checks the final artifact against `release/production-manifest.json`.

The exact final artifact is qualified for both methods across all 53 upstream
cases (106 solves) in Node and real Chromium. A separately compiled no-import
upstream MGH oracle independently recomputes every final residual. Node and
Chromium produce the same result digest. The focused suite also includes 200
deterministic random linear oracles, 500 corrupt-region cases, every internal
allocation-failure position, callback/error/budget/reentrancy tests, repeated
reuse, shared-memory cancellation, and hard worker recovery. The same artifact
passes Node smokes on Linux x64, Linux ARM64, macOS ARM64, and Windows x64.

The committed qualification summary states the exact limitation: `bench-1`
was inaccessible, so the Linux x64 run is local rather than a persistent-host
receipt. Integration tests additionally exercise the public Node, browser,
relocated-package, and SEA resource paths. Automatic method selection remains
disabled.

## Reproduction

From the repository root:

```sh
node packages/flint-wasm/numerical/scripts/build.cjs
node packages/flint-wasm/numerical/qualification/run.mjs
node --test \
  test/numerical-p3-backends/lm-wasm.test.mjs \
  test/numerical-p3-backends/abi-fuzz.test.mjs \
  test/numerical-p3-backends/worker-owned.test.mjs
node test/numerical-p3-backends/browser-lm.mjs
node bench/numerical-p3-backends/benchmark.mjs
```

Generated build artifacts and the full per-case receipt are ignored. The
source/license/artifact manifest and compact qualification summary are
reviewable committed inputs.

The root, browser-package, and SEA builders each rerun this content-locked
reactor build. That intentional verification costs about two seconds per
pipeline and makes every independently invoked packaging path reject a stale
or tampered resource. Sharing a cache would save only those seconds while
adding cache-identity and invalidation behavior that is not yet justified.
