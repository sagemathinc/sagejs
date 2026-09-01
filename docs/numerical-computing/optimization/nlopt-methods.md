# Explicit NLopt Nelder–Mead and COBYLA methods

## Decision

Sage.js can defensibly use two methods from a pinned, permissive subset of
NLopt as a lazy universal Wasm backend:

- `nlopt-nelder-mead`, exactly NLopt's `NLOPT_LN_NELDERMEAD`; and
- `nlopt-cobyla`, exactly NLopt's `NLOPT_LN_COBYLA`.

They are separate capabilities. Qualifying one does not qualify the other or
the rest of NLopt. Neither method is eligible for automatic selection in this
lane. A caller must explicitly name it, and public integration must validate
the mathematical result independently.

This distinction matters for COBYLA. On the deliberately infeasible corpus
case, NLopt returns `NLOPT_XTOL_REACHED`, a positive backend termination code,
at `x ≈ 0.5`. The two constraints still have maximum violation `≈ 0.5`.
Sage.js records the backend termination and independently rejects feasibility.
SciPy 1.18's PRIMA COBYLA reaches essentially the same point but correctly
reports failure. A backend status is not a mathematical conclusion.

## Low-level explicit API

The integration-owned public optimizer will wrap this package. Its low-level
shape is intentionally small:

```js
const backend = await createNloptBackend(wasmBytes);

const unconstrained = backend.solve({
  method: "nlopt-nelder-mead",
  initial: [-1.2, 1],
  initialStep: [0.5, 0.5],
  objective: ([x, y]) => (1 - x) ** 2 + 100 * (y - x * x) ** 2,
  relativeParameterTolerance: 1e-9,
  maximumEvaluations: 2000,
});

const constrained = backend.solve({
  method: "nlopt-cobyla",
  initial: [0.25, 0.25],
  initialStep: [0.4, 0.4],
  objective: ([x, y]) => (x - 1) ** 2 + (y - 1) ** 2,
  inequalityCount: 1,
  inequality: ([x, y]) => [x * x + y * y - 1], // g(x) <= 0
  inequalityTolerance: [2e-7],
  maximumEvaluations: 2000,
});
```

The return record deliberately calls the upstream fact
`backendConverged`. It also sets `independentValidationRequired: true`. It does
not expose a public `success` field that could be confused with checked
feasibility or optimality.

Both algorithms support finite binary64 initial points, per-coordinate bounds,
positive initial steps, function/parameter tolerances, evaluation/callback/time
budgets, `AbortSignal`, a synchronous cancellation predicate, and shared-atomic
cancellation. COBYLA accepts packed vector inequality and equality callbacks;
equality values are interpreted as `h(x) = 0`, and inequality values as
`g(x) <= 0`.

The low-level foreign-library adapter envelope is:

- `1 <= dimension <= 128`;
- at most 512 user constraints;
- at most 64 MiB computed solver workspace and 128 MiB Wasm linear memory;
- finite inputs, objective values, constraint values, and tolerances;
- synchronous callbacks owned by the evaluator worker; and
- no reentrant solve on one reactor instance.

The public `minimize` contract is intentionally narrower because a positive
NLopt status is not enough to certify a local minimum. Both explicit methods
are limited to at most 32 variables, and `nlopt-cobyla` is limited to 64 scalar
constraints. Public validation recomputes first-order conditions and a dense
two-scale Hessian on the independently reconstructed feasible tangent space.
The planner rejects larger requests instead of exposing an execution result
that the independent validator cannot defend.

Active bounds and nonlinear inequalities require strict complementarity for a
validated public success. A mathematically valid non-strict active-bound
minimum therefore remains `indeterminate`; it is not mislabeled as failure or
silently certified. Nonlinear equality validation requires a full-rank local
constraint Jacobian and successful scale-aware retraction of independent
probes. Rank-deficient, nearly dependent, or severely ill-scaled active
manifolds also remain `indeterminate`. These are deliberate validation-envelope
limits, not claims about what upstream NLopt can execute.

All objective comparisons are invariant under adding a constant. A reliably
resolved feasible decrease rejects local minimality regardless of the absolute
objective level; its small roundoff allowance is derived only from observed
local variation. Constraint activity and complementarity use binary64-scale
slack tests rather than caller feasibility tolerances, so a loose tolerance
cannot turn a nearby improving feasible direction into a certified optimum.
The dense curvature model's roundoff bound remains conservatively proportional
to the absolute objective magnitude. Very large additive offsets can therefore
make an otherwise valid minimum `indeterminate`, but can never turn a sampled
decrease into a false success.

The packed ABI has layouts for one objective plus its complete gradient, and
vector constraints plus complete row-major Jacobians. All three batches are
shape/range tested. Nelder–Mead and COBYLA are derivative-free, so their final
qualification additionally asserts that NLopt requested zero gradient and zero
Jacobian callbacks. This ABI work does not pre-qualify a future derivative
method.

## Source and licensing

The package pins current upstream revision
`6e6593f131ba3a38bc9edbed0a357bc01526e54b`. NLopt's top-level CMake option
`NLOPT_LUKSAN` defaults to `ON`; the Luksan sources are LGPL. The Sage.js source
lock sets it to `false` and uses a fail-closed source allowlist instead of
compiling NLopt's broad target. Only these upstream source files enter the
artifact:

- `src/algs/neldermead/nldrmd.c`;
- `src/algs/cobyla/cobyla.c`;
- `src/util/stop.c`;
- `src/util/redblack.c`; and
- `src/util/rescale.c`.

The build rejects Luksan, ESCH, or AGS paths before compilation, verifies the
archive and byte-identical upstream `COPYING`, hashes every source/header in the
transitive closure, and scans the finished artifact for disallowed family
names. The final 101,376-byte Wasm reactor imports exactly one synchronous
function, `sagejs_numerical_nlopt.evaluate`; it has no WASI imports.

NLopt owns all optimizer mathematics. Sage.js's handwritten C is limited to
packed callback/memory/status/force-stop adaptation. This is the
external-library boundary allowed by `ARCHITECTURE.md`, not a replacement
optimizer.

## Correctness evidence

The backend-neutral 13-case corpus covers:

- Nelder–Mead on Rosenbrock, Beale, nonsmooth absolute value, an active box
  boundary, and variables separated by twelve orders of magnitude;
- COBYLA at linear and curved active boundaries, with redundant constraints,
  an equality, a box boundary, a near-active constraint, and a scaled
  million-unit constraint; and
- an infeasible pair of constraints that must be rejected independently even
  when NLopt returns a positive code.

The same corpus runs through SciPy 1.18 Nelder–Mead and its PRIMA COBYLA as an
independent oracle. Exact trajectories and stop statuses are not required to
match; final points must satisfy the shared point, objective, bounds, and
feasibility envelopes. Node and real Chromium run the complete corpus. The
exact final artifact also passes representative smokes on Linux x64, Linux
ARM64, macOS ARM64, and Windows x64.

ABI and failure evidence includes 500 corrupt-region probes, 20 injected early
allocation positions per method, packed objective/gradient and
constraint/Jacobian probes, callback exceptions, non-finite output, abort,
elapsed/evaluation/callback budgets, reentrancy rejection, 200 mixed-method
reuse solves, a pre-set shared-atomic force-stop in Chromium, and
termination/recreation of a worker whose user callback never returns. Node
also exercises callback-triggered force-stop while an optimizer is active.
Every recoverable path ends with zero live allocations and bytes.

On the Linux x64 qualification host, median end-to-end times over 100 warm
samples were about 0.29 ms for two-variable Rosenbrock Nelder–Mead (214
callbacks) and 0.33 ms for circle-constrained COBYLA (102 objective plus 102
constraint callbacks). These measurements are regression evidence for this
artifact, not a cross-library performance ranking.

## Integration requirements

The integration lane should:

1. place this reactor beside cminpack in the lazy numerical resource pack,
   without eagerly loading either core;
2. classify `src/adapter.c` as a foreign-library host adapter in
   `architecture/native-code.json` and register the one Wasm import/export
   surface in the central inventories;
3. expose exact methods only through the ordinary-Python optimization router;
4. recompute the objective, bounds, constraint residuals, feasibility, and
   applicable local-optimum diagnostics before constructing a
   `NumericalResult`;
5. retain the correct ordinary-Python methods as planner fallbacks, while an
   explicit NLopt request fails rather than silently changing identity;
6. keep automatic NLopt selection disabled until npm, browser, Node, SEA, and
   final-candidate receipts bind the public router and lazy resource; and
7. rerun the source-bound corpus after any relocation, bundling, or adapter
   change.

The qualification summary is
[`release/qualification-v1.json`](../../../../src/lib/sagejs/numerics/optimization/backends/nlopt/release/qualification-v1.json).
