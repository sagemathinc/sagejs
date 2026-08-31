# P3 numerical backend decision and feasibility evidence

## Decision

The smallest defensible production path for Sage.js P3 is a **separately lazy,
universal numerical Wasm reactor**, introduced in two method-gated steps:

1. cminpack `lmdif` and `lmder` for nonlinear least squares and fitting, after
   the complete upstream MINPACK differential suite runs from the production
   Wasm artifact; then
2. the permissive NLopt build, initially exposing only individually qualified
   `NLOPT_LN_NELDERMEAD` and `NLOPT_LN_COBYLA` methods.

PRIMA should remain the COBYLA correctness oracle rather than the first
runtime. Its `c/` directory is a C interface to the modern Fortran
implementation, not a C implementation, so it still requires a modern Fortran
runtime/compiler path that Sage.js does not otherwise need.

This conclusion strengthens rather than replaces
[`agents/numerical-optimization-backend-strategy.md`](../../agents/numerical-optimization-backend-strategy.md).
The new evidence closes the callback-boundary feasibility question for
cminpack. It does **not** yet satisfy the production correctness gates, and no
automatic capability should be enabled from this branch.

## Why an explicit Wasm adapter is architecturally necessary

`ARCHITECTURE.md` correctly prohibits an isolated `@native` kernel from calling
back into Python or JavaScript after argument marshalling. An arbitrary user
objective is precisely such a callback. The solver therefore cannot be
smuggled into the source-transparent compiler as a partially isolated kernel.

The valid architecture exception is narrower:

- the mathematical algorithm remains in a mature external library;
- ordinary CPython-parseable Python owns public semantics, planning, dynamic
  execution, independent validation, and result construction;
- a small handwritten C file owns only packed memory, callback, status, and
  cleanup adaptation; and
- a replaceable host adapter owns callback identity, exceptions,
  cancellation, and typed-array conversion.

This is an external-library/host-adapter boundary, not a second handwritten
optimizer.

## Primary-source audit

The sources were inspected at their current upstream heads on 2026-08-31.

| Candidate | Revision | Source/license/build facts | Decision |
| --- | --- | --- | --- |
| cminpack | `32d343ac33ac297594b5ffac57741e5615b4bb07` | C, about 23,893 C/header lines including tests; original permissive MINPACK notice; plain function-pointer callbacks with opaque context; negative callback return terminates `lmdif`/`lmder`; no BLAS is required. [Upstream](https://github.com/devernay/cminpack), [manual](https://devernay.github.io/cminpack/man.html). | First production core for exact `lmdif`/`lmder` identity after full Wasm cross-check. |
| NLopt | `6e6593f131ba3a38bc9edbed0a357bc01526e54b` | About 39,004 C/C++/header lines including tests. Default combined library is LGPL because of Luksan sources; `NLOPT_LUKSAN=OFF` yields the permissive build. The C API has opaque callback data and `nlopt_force_stop`. NLopt documents that its COBYLA and Nelder-Mead implementations are modified implementations, not SciPy/PRIMA iteration identity. [Installation/license](https://nlopt.readthedocs.io/en/stable/NLopt_Installation/), [algorithms](https://nlopt.readthedocs.io/en/stable/NLopt_Algorithms/), [C API](https://nlopt.readthedocs.io/en/stable/NLopt_Reference/). | Second core, but promote one exact NLopt method at a time. Never treat the whole library as accepted. |
| PRIMA | `1d76fb88aeffb427cd17ed1e9d0d3b34f414913f` | BSD-3-Clause, about 99,302 C/Fortran/header lines including tests. The build project is Fortran and `c/README.md` explicitly calls the C surface an interface to the Fortran version. [Upstream](https://github.com/libprima/prima). | Pin as the COBYLA/CUTEst/stress oracle. Do not add a Fortran-to-WASI toolchain only for this core. |

The repository's existing 25-case optimization study remains relevant. In
particular, the provisional NLopt COBYLA adapter returned a success code on an
infeasible case; independent feasibility checks correctly rejected it. That
is a permanent API requirement, not a one-off backend bug workaround.

## Implemented feasibility prototype

`packages/flint-wasm/experimental/numerical-p3-backends/` contains a content-
locked experiment around cminpack `lmdif` and `lmder`. It intentionally lives
outside the public package graph.

The C boundary imports exactly one synchronous function:

```c
evaluate(context, m, n, x_offset, residual_offset,
         jacobian_offset, ldfjac, flags)
```

Vectors and the complete column-major Jacobian cross as packed binary64
regions in the module's linear memory. There is no scalar-per-residual crossing
and no WASI host import. The adapter enforces:

- dimensions `n <= 256`, `m <= 16384`, `m >= n`;
- at most 64 MiB of solver workspace and at most 128 MiB module memory;
- checked multiplication, addition, alignment, and memory ranges;
- finite inputs, scales, residuals, and Jacobians;
- module-wide non-reentrancy;
- deterministic counters and tracked allocation cleanup;
- callback-exception identity after C cleanup;
- callback-boundary cancellation, elapsed-time, and evaluation budgets; and
- exact outward method names `cminpack-lmdif` and `cminpack-lmder`.

The host copies the current parameter vector before invoking user code and
refreshes typed-array views after possible memory growth. It never exposes a
durable view into Wasm memory. A callback error returns a fixed negative status
to cminpack; JavaScript rethrows only after `p3_lm_solve` has freed every C
allocation.

### Artifact and runtime evidence

The current artifact is identified by
`c29b04e2a0ca8940f643b144525a8b882a53aff670880d79ea406f180718065c`:

| Measure | Value |
| --- | ---: |
| Raw Wasm | 69,419 bytes |
| gzip -9 | 28,095 bytes |
| Brotli | 23,355 bytes |
| Imports | one function, `sagejs_p3.evaluate` |
| Initial memory | 2 MiB |
| Maximum memory | 128 MiB |

The identical artifact solved the analytic-Jacobian Rosenbrock residual at
`[1, 1]` with independently computed residual norm zero, backend status 4,
21 residual evaluations, and 16 Jacobian evaluations in:

- Chromium on Linux x64;
- Node 26.7.0 on local Linux x64;
- Node 26.5.1 on persistent Linux ARM64 (`bench-arm`);
- Node 26.5.0 on persistent macOS ARM64 (`m1`); and
- Node 26.5.1 on persistent Windows x64 (`windows`).

Every run reported zero live allocations after completion. The seven focused
Node tests also cover finite-difference LM, callback exceptions, malformed and
non-finite outputs, four cancellation/budget forms, reentrancy, reuse after
failure, and 250 repeated solves without memory growth.

`bench-1` rejected the available SSH identity during this lane, so local Linux
x64 is explicitly a substitute smoke and **not** a persistent-host receipt.
Exact normalized evidence is in [`evidence.json`](evidence.json).

The local exploratory medians were 0.051 ms for a 30-residual linear `lmdif`
fit and 0.105 ms for analytic-Jacobian Rosenbrock-2 `lmder` over 50 samples.
The existing one-million-call probe measured 12.03 ns per Wasm-to-JavaScript
callback on the same development host. These show that the boundary is not an
obvious performance blocker; they are not release performance claims.

### Repository-level validation state

The seven-stage repository build passed from this worktree in 6m40s, and
`pnpm test:baselib:strict` passed 285 modules with zero errors. The required
broader gates currently stop on two base-owned inconsistencies before reaching
this experiment:

- `pnpm architecture:check` reaches package-graph validation, then reports
  that `src/lib/sagejs/numerics/approximation/__init__.py` has no package
  owner; and
- `pnpm test:portable` reaches `test/parallel-development.cjs`, then reports
  that the test expects eight numerical lanes absent from the base's
  `.agents/lanes.json`.

This lane deliberately does not edit either shared integration manifest. The
exact failed and passing runs are recorded in
`.agents/tasks/numerical-p3-backends.json`. Once integration reconciles those
base files, architecture checking must additionally classify the production
adapter in `architecture/native-code.json`; the experimental file here is not
a reason to weaken that gate.

## What the prototype does not prove

The prototype must not be promoted directly. Production still requires:

1. Compile the complete cminpack intensive drivers and committed MINPACK
   reference cross-check into/against the exact production Wasm artifact. The
   current smoke covers two well-conditioned problems only.
2. Add the Moré-Garbow-Hillstrom suite at multiple starts/scales, supplied and
   finite-difference Jacobians, rank deficiency, poor scaling, NaN/infinity,
   callback corruption, and allocation-failure injection.
3. Run the solver in a worker. Synchronous Wasm blocks a browser main thread;
   an `AbortSignal` event cannot fire on that same thread during a solve.
   Cooperative callback checks and `SharedArrayBuffer`/`Atomics` cancellation
   work, but worker ownership is required for responsive external
   cancellation and recovery.
4. Fuzz the exported ABI and run native adapter-equivalent sanitizer tests.
   The production wrapper must be the only normal caller of allocation/free
   exports, and the ABI allowlist must fail closed.
5. Bind source, license, build flags, artifact, corpus, and method capability
   hashes in authenticated receipts. The pinned upstream revision is newer
   than tag `v1.3.14`; production must retain the exact commit or deliberately
   move to a reviewed release, never call it merely “1.3.14.”
6. Verify relocated npm and SEA use, browser worker recovery, cold load, RSS,
   memory pressure, and the persistent Linux x64 host.

### Dynamic fallback semantics

The current ordinary-Python least-squares method is deliberately named
`damped-gauss-newton`; it is not MINPACK. Therefore:

- an explicit request for `cminpack-lmdif` or `cminpack-lmder` must fail with a
  capability diagnostic when the pack is unavailable or out of envelope;
- it must not silently run `damped-gauss-newton` under the MINPACK name; and
- `method="auto"` may fall back to `damped-gauss-newton` only by producing a
  new inspectable plan and `backend_fallback` diagnostic that records the
  method change.

The same rule applies to NLopt. `NLOPT_LN_COBYLA` is not PRIMA COBYLA iteration
identity, and NLopt's method variants must remain visible in provenance even
when a public compatibility facade accepts them mathematically.

## NLopt follow-on boundary

NLopt fits the same packed reactor. The C trampoline should own a pointer to
the active `nlopt_opt`; when the imported objective/constraint callback
returns cancellation or exception, it calls `nlopt_force_stop` before
returning. The production adapter must additionally support:

- objective and optional complete gradient batches;
- vector constraint and optional Jacobian batches;
- exact bounds, initial steps, and stop criteria;
- an allowlisted algorithm enum containing only qualified methods;
- source/object/symbol checks proving Luksan code is absent; and
- independent feasibility and stationarity checks after every return status.

The first qualification candidates remain Nelder-Mead and COBYLA, separately.
The former needs simplex initialization/restart/bound behavior gates. The
latter needs scaled, curved, redundant, nearly active, and infeasible
constraints against pinned PRIMA/SciPy fixtures. Neither should be automatic
merely because the library builds.

## Exact integration sequence and ownership

Integrate only after the current ordinary-Python optimization lane has landed,
in this order:

1. **Numerical Wasm package lane** — create `packages/numerical-wasm/` with
   pinned source restoration, verbatim licenses, cminpack adapter/core, worker
   host, loader, ABI allowlist, and source/artifact receipts. Do not attach this
   dependency to FLINT or duplicate it in per-method modules.
2. **Runtime integration lane** — add a lazy `numerical_backend()` boundary in
   `src/baselib/sagejs/runtime.py` and `.pyi`, its compiler mapping in
   `tools/python/contract.ts`, and host injection in Node/SEA/browser evaluator
   and worker paths. This shared change must not be made from the optimization
   domain lane.
3. **Optimization domain lane** — add a narrow backend router below
   `src/lib/sagejs/numerics/optimization/`; route qualified
   `cminpack-lmdif`/`cminpack-lmder`, retain ordinary Python for every miss,
   update planning/capabilities, and convert backend counters/status into the
   existing canonical `NumericalResult` without trusting success.
4. **Evidence lane** — port the complete cminpack cross-check and expanded MGH
   corpus, then run the same Wasm digest on browser, persistent four-platform
   Node, npm relocation, and SEA. Promote LM only when those receipts bind to
   the final artifact.
5. **NLopt method lanes** — add the MIT-only source core and adapter once, then
   qualify and promote Nelder-Mead and COBYLA as separate reviewed commits.
6. **Integration/release lane** — update workspace/package graphs, pyright,
   capability and native-boundary manifests, payload/startup budgets, public
   docs, and release receipts only after the method gates are green.

The experimental files in this branch are a reviewable reference for steps 1
and 4. They should be copied into a dedicated package and hardened, not exposed
from `packages/flint-wasm` as a public accidental ABI.

## Reproduction

```sh
node packages/flint-wasm/experimental/numerical-p3-backends/build.cjs
node --test test/numerical-p3-backends/lm-wasm.test.mjs
node test/numerical-p3-backends/browser-lm.mjs
node bench/numerical-p3-backends/benchmark.mjs
node bench/numerical-optimization/callback-boundary.mjs \
  --count 1000000 --samples 9
```

The build verifies the pinned source archive SHA-256 before extraction and
writes an ignored local build report containing toolchain identity, imports,
exports, sizes, and artifact digest.
