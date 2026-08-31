# P3 numerical backend decision and feasibility evidence

## Decision

The smallest defensible production path for Sage.js P3 is a **separately lazy,
universal numerical Wasm reactor**, introduced in two method-gated steps:

1. cminpack `lmdif` and `lmder` for nonlinear least squares and fitting; then
2. the permissive NLopt build, initially exposing only individually qualified
   `NLOPT_LN_NELDERMEAD` and `NLOPT_LN_COBYLA` methods.

PRIMA should remain the COBYLA correctness oracle rather than the first
runtime. Its `c/` directory is a C interface to the modern Fortran
implementation, not a C implementation, so it still requires a modern Fortran
runtime/compiler path that Sage.js does not otherwise need.

This conclusion strengthens rather than replaces
[`agents/numerical-optimization-backend-strategy.md`](../../agents/numerical-optimization-backend-strategy.md).
The new evidence closes both the callback-boundary question and the bounded
cminpack artifact-qualification gate: the final reactor passes the complete
53-case upstream MGH corpus for both methods in Node and Chromium. Automatic
selection still belongs to the integration lane because the ordinary-Python
router must independently validate results and construct public contracts.

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

## Implemented production candidate

`packages/flint-wasm/numerical/` contains the content-locked cminpack `lmdif`
and `lmder` reactor. It remains outside the public package graph so an
integration-owned change can register it without entangling the optimization
domain or duplicating the binary in FLINT.

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

The final candidate artifact is identified by
`f8ce5abcca0128be5e61a3b3d31b983207dad1117d61a7642fae336c3268e855`:

| Measure | Value |
| --- | ---: |
| Raw Wasm | 72,149 bytes |
| gzip -9 | 28,936 bytes |
| Brotli | 23,904 bytes |
| Imports | one function, `sagejs_p3.evaluate` |
| Initial memory | 2 MiB |
| Maximum memory | 128 MiB |

The identical artifact solved the analytic-Jacobian Rosenbrock residual at
`[1, 1]` with independently computed residual norm zero, backend status 4,
21 residual evaluations, and 16 Jacobian evaluations in:

- Chromium on Linux x64;
- Node 26.7.0 on local Linux x64;
- Node 26.5.1 on persistent Linux ARM64 (`bench-arm`);
- Node 26.7.0 on persistent macOS ARM64 (`m1`); and
- Node 26.5.1 on persistent Windows x64 (`windows`).

Every run reported zero live allocations and bytes after completion. The
focused Node tests also cover finite-difference LM, callback exceptions,
malformed and non-finite outputs, four cancellation/budget forms, reentrancy,
reuse after failure, every internal allocation-failure position, 500 corrupt
ABI regions, 200 deterministic random linear least-squares oracles, 250
repeated solves without memory growth, worker-owned shared-memory cancellation,
and termination/recreation of a hard-stuck evaluator worker.

The exact final artifact additionally ran all 53 upstream MGH cases for both
`lmdif` and `lmder` in Node and real Chromium. A separate no-import oracle
compiled from upstream `ssqfcn`, `ssqjac`, and `ssqipt` recomputed every final
residual. Both runtimes produced result digest
`594f138289f78ee057e7f1de90a7ea2a81c9909cb732fcb38a1afbd47c09f285`.
The compact authenticated summary is
[`qualification-v1.json`](../../packages/flint-wasm/numerical/release/qualification-v1.json).

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
and qualification adapters in `architecture/native-code.json`; this lane's
narrow claim deliberately does not edit that shared manifest.

## Remaining integration gates

The backend core is qualified, but public registration still requires:

1. Register the separately lazy artifact in the Node/SEA/browser evaluator
   resource loader without bundling it into FLINT or eagerly loading it.
2. Route only the exact `cminpack-lmdif` and `cminpack-lmder` identities from
   ordinary Python, and independently validate the final point before
   constructing a `NumericalResult`.
3. Classify both C adapters in `architecture/native-code.json`, update package
   ownership, and satisfy the shared architecture gate.
4. Verify relocated npm and SEA resolution, startup/payload budgets, and the
   persistent Linux x64 host. `bench-1` rejected this lane's SSH identity.
5. Keep hard recovery at the evaluator-worker boundary. Arbitrary functions
   cannot be cloned to a nested solver worker; the worker owning the user
   callback must also own the reactor.
6. Do not claim sanitizer evidence. This lane instead supplies bounded Wasm
   memory plus explicit corrupt-region, allocation-failure, random-oracle,
   callback-error, lifecycle, and worker-recovery campaigns.

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

1. **Numerical Wasm package lane** — integrate the completed
   `packages/flint-wasm/numerical/` candidate as one separately lazy resource,
   optionally moving the directory as a unit. Retain its pinned restoration,
   verbatim license, ABI allowlist, production manifest, and qualification
   receipt. Do not link the core into FLINT or duplicate it per method.
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
4. **Evidence lane** — retain the complete final-artifact MGH and browser
   qualification already supplied here, then add relocated npm, SEA, and the
   missing persistent Linux x64 receipt after resource integration.
5. **NLopt method lanes** — add the MIT-only source core and adapter once, then
   qualify and promote Nelder-Mead and COBYLA as separate reviewed commits.
6. **Integration/release lane** — update workspace/package graphs, pyright,
   capability and native-boundary manifests, payload/startup budgets, public
   docs, and release receipts only after the method gates are green.

The production manifest deliberately permits explicit registration only;
automatic selection remains disabled until steps 2–4 are complete.

## Reproduction

```sh
node packages/flint-wasm/numerical/scripts/build.cjs
node packages/flint-wasm/numerical/qualification/run.mjs
node --test test/numerical-p3-backends/lm-wasm.test.mjs \
  test/numerical-p3-backends/abi-fuzz.test.mjs \
  test/numerical-p3-backends/worker-owned.test.mjs
node test/numerical-p3-backends/browser-lm.mjs
node bench/numerical-p3-backends/benchmark.mjs
node bench/numerical-optimization/callback-boundary.mjs \
  --count 1000000 --samples 9
```

The build verifies the pinned source archive SHA-256 before extraction and
writes an ignored local build report containing toolchain identity, imports,
exports, sizes, and artifact digest.
