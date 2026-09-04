# Scalar-root backend and performance qualification

## Decision

Keep scalar root finding on the ordinary, CPython-parseable implementation in
`src/lib/sagejs/numerics/roots.py`. No separately compiled scalar-root backend
is qualified at present. This is a deliberate production decision, not a
placeholder claim that compiled code is always unnecessary.

The dominant operation in scalar root finding is normally the user callback.
The four solvers make a small number of sequential callback calls, and each
next point depends on the preceding value. Moving the iteration loop to a
foreign native or Wasm backend therefore cannot vectorize useful work. It
would instead introduce a callback boundary at every evaluation, duplicate
the result/trace/cancellation semantics, and add another artifact and lazy-load
path. The ordinary implementation keeps the callback, solver, bounded trace,
resource checks, and independent validation in one runtime and uses the same
source under CPython and Sage.js.

The decision must be revisited if measurements show that solver bookkeeping,
rather than the callback, dominates a representative product workload. The
first accelerator to qualify should be source-transparent compilation of the
actual typed Python body, retaining the same source provenance and dynamic
fallback. A separate C/C++ library should be considered only if it provides a
measured advantage that survives its callback bridge and payload/startup cost.

## What is measured

[`root-performance.corpus.json`](../../../bench/numerical-computing/qualification/root-performance.corpus.json)
is a backend-neutral corpus with the complete Cartesian product of:

- bisection, Brent, secant, and Newton methods;
- no iteration trace and bounded iteration tracing; and
- cheap, moderate, and expensive deterministic callback tiers.

Each of the 12 cases runs both trace policies, alternating their order between
samples to reduce order bias. There is one warmup and five measured samples.
Each sample batches enough solves to make timer resolution a small part of the
measurement. The adapter records warm-kernel time per solve, callback counts,
and trace behavior. The qualification collector separately recomputes the
error from `sqrt(2)` and the residual `abs(x*x - 2)`; it also checks success,
method identity, backend identity, and that iteration events occur only under
the requested trace policy.

The three callback tiers are intentionally synthetic and deterministic:

| Tier | Extra work per function call | Purpose |
| --- | ---: | --- |
| cheap | none | exposes solver and trace overhead |
| moderate | 16 trigonometric pairs | approximates a modest user model |
| expensive | 256 trigonometric pairs | checks callback-dominated behavior |

Newton's supplied derivative is cheap in every tier. This is intentional: it
exposes the distinct function/derivative cost model instead of making the four
algorithms look artificially alike.

The corpus is not a claim about throughput for a vector of independent roots,
cross-language callbacks, arbitrary ill-conditioned functions, cold startup,
or end-to-end UI latency. Those require different corpora. It also does not
compare elapsed values between different hosts as if hardware and browser
engines were interchangeable.

## Correctness and release budgets

Every solve must return the requested method and the
`ordinary-python` backend, report success, and satisfy both of these independent
checks:

- maximum root error at most `2e-11`; and
- maximum residual at most `5e-11`.

Untraced execution has a `500 ms/solve` release ceiling in every tier. Traced
Brent, secant, and Newton execution has a `1000 ms/solve` ceiling; traced
bisection has a `5000 ms/solve` ceiling because it deliberately constructs
many more teaching events. These are deliberately loose, provisional safety
ceilings for an interactive scalar operation, not competitive performance
claims or targets for routine operation.
The pre-qualification CPython 3.14.4 run on Linux x64 observed approximately
`0.39`-`3.62 ms/solve` without iteration traces and `1.07`-`20.78 ms/solve`
with traces across this corpus. A diagnostic built-Node run on the same host
observed roughly `37`-`111 ms/solve` untraced, `105`-`128 ms/solve` traced for
Brent/secant/Newton, and `1.68`-`1.76 s/solve` for traced bisection. These
figures guided the method-specific ceilings but are not authenticated Sage.js
receipts. Exact-candidate receipts are authoritative.

Tightening the ceiling requires retained measurements from all supported
runtime classes and platforms. It must not be inferred from one fast host.
Regressions below the ceiling remain visible in receipt medians and tails and
should be investigated before adjusting the budget.

## Portable backend survey

The survey asks whether a candidate improves this scalar callback workload,
not whether the library is good in general.

| Candidate | Evidence and fit | Decision for scalar roots |
| --- | --- | --- |
| Ordinary Python source transpiled by Sage.js | One implementation supplies all four methods, trace/resource semantics, CPython execution, and browser/Node/SEA execution with no new payload. The corpus directly measures it. | Production path. |
| SciPy `optimize.root_scalar` | The [official API](https://docs.scipy.org/doc/scipy/reference/generated/scipy.optimize.root_scalar.html) is a mature reference spanning bracketed and derivative methods and returning structured convergence information. Sage.js already emits SciPy-equivalent source. Shipping SciPy itself would require a Python/native scientific stack unavailable in the browser product. | Differential oracle and semantic reference, not a shipped backend. |
| Boost.Math root algorithms | [Boost.Math](https://www.boost.org/doc/libs/latest/libs/math/doc/html/root_finding.html) provides portable C++ root algorithms under the Boost Software License. Compiling it for every host and Wasm is feasible, but each general Python/Sage callback would still cross the host boundary on every iteration and the added C++ artifact would duplicate four small loops. | Do not add without a benchmark showing a material end-to-end win. |
| GNU Scientific Library | [GSL's root framework](https://www.gnu.org/software/gsl/doc/html/roots.html) provides mature bisection, Brent, and derivative solvers with inspectable iteration state. GSL is [GPL-licensed](https://www.gnu.org/software/gsl/); incorporating it would add a large compiled dependency and distribution obligations for a tiny subset while retaining callback crossings. | Technically capable but disproportionate here. |
| cminpack | The [cminpack project](https://github.com/devernay/cminpack) targets nonlinear systems and nonlinear least squares, not one-dimensional bracketed root finding. Sage.js already qualifies it lazily for those matching problems. Routing scalar roots through it would change algorithms and contracts. | Keep for its existing multidimensional envelope only. |
| `stdlib-js` | [`stdlib-js`](https://github.com/stdlib-js/stdlib) is browser/Node-oriented and decomposable, making it worth surveying for numerical primitives. No complete replacement matching Sage.js's four-method result, validation, bounded-trace, and multilingual contracts was established by this review. Adding a dependency would not remove the callback or integration work. | Reconsider for specific primitives when an exact module and benchmark justify it. |
| Handwritten C/C++ or Wasm | A compiled loop can reduce arithmetic bookkeeping, but general callbacks must still bridge runtimes. Emscripten's [interop documentation](https://emscripten.org/docs/porting/connecting_cpp_and_javascript/Interacting-with-code.html) exposes several callback/binding mechanisms and their runtime machinery. A second implementation would also need differential oracles, four-platform builds, sanitizers, provenance, fallback, and trace parity. | Rejected as speculative; no measured product bottleneck justifies it. |

This conclusion is scoped to scalar roots. Dense linear algebra, FFTs, large
ODE systems, and batched optimization have very different arithmetic intensity
and may correctly select mature compiled backends.

## Exact-candidate qualification hook

`collect-root-performance.cjs` refuses a dirty checkout, requires a full
candidate SHA, and verifies the checkout identity again after collection. Its
capability manifest binds the corpus, source closure, adapter, runtime subject,
and every artifact by content. The adapter supports actual Node, fresh npm,
relocated SEA, browser, and browser-worker subjects; it does not accept a
runtime label supplied by the collector.

Use the existing preparation commands with this corpus, adapter, and
capability specification. For example, after building an exact clean Node
candidate and provisioning the normal hermetic qualification inputs:

```console
candidate=$(git rev-parse HEAD)
node scripts/numerical-computing/qualification/prepare-node.cjs \
  --corpus bench/numerical-computing/qualification/root-performance.corpus.json \
  --adapter bench/numerical-computing/qualification/root-performance-adapter.cjs \
  --spec bench/numerical-computing/qualification/root-performance-capability-spec.json \
  --artifact dist \
  --output build/root-performance/node
```

Use the artifacts printed by that command with the stricter P1 collector:

```console
node scripts/numerical-computing/qualification/collect-root-performance.cjs \
  --candidate "$candidate" \
  --capabilities build/root-performance/node/capabilities.json \
  --artifact sagejs-dist=dist \
  --artifact cminpack-wasm=packages/flint-wasm/numerical/build/cminpack.wasm \
  --artifact nlopt-wasm=dist/numerical/nlopt-methods.wasm \
  --artifact scipy-oracle-binding=build/root-performance/node/scipy-oracle.json \
  --output build/root-performance/node/node.receipt.json
```

The extra bound numerical artifacts come from the common preparation path;
this scalar-root adapter does not load them. Their presence must not be read as
a scalar-root backend claim.

For npm or SEA, run `prepare-package.cjs` with the same three `--corpus`,
`--adapter`, and `--spec` arguments plus the exact package artifacts. For a real
browser or worker, run `prepare-browser.cjs` likewise with the desired `--kind`
and `--engine`; then pass every artifact printed by the preparer to this
collector. A release qualification should retain separate receipts for Node,
npm, SEA, Chromium, Firefox, WebKit, and the Chromium worker on the platform
rows required by `RELEASE.md`.

Passing one receipt means only that its exact candidate, artifact closure,
host, and observed runtime satisfied this corpus and ceiling. It is not a
substitute for the full P8 qualification gate, and the hook does not fabricate
missing rows or transplant timing evidence across runtimes.
