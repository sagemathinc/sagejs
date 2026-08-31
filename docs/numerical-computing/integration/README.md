# Validated adaptive integration

`sagejs.numerics.integration` is the production-bounded P2 implementation for
real one-dimensional binary64 definite integrals. It returns a structured
`IntegrationResult`; it does not collapse error evidence and failure state into
a scalar or an optimistic success string.

```python
import math
from sagejs.numerics.integration import integrate

result = integrate(
    lambda x: math.exp(-(x * x)),
    -math.inf,
    math.inf,
    absolute_tolerance=1e-10,
    relative_tolerance=1e-10,
)

result.value
result.error_estimate
result.stop_reason
result.validation.to_dict()
result.explain()
result.plot()
result.plot(view="convergence")
result.animate()
```

The default globally adaptive method applies an embedded Gauss 10/Kronrod 21
rule to finite intervals. It repeatedly bisects the active interval with the
largest local error estimate. Infinite mappings use the lower-order embedded
Gauss 7/Kronrod 15 rule because the rational mapping creates an endpoint
difficulty. The reported error is not a rigorous enclosure.

After solver convergence, fresh Gauss-Legendre 8 nodes on two panels per final
adaptive leaf provide an independent comparison. Those callback calls consume
the same evaluation, elapsed-time, and cancellation budgets as solver calls.
`success` requires both embedded-error termination and the independent check.

## Difficult integrands

Known interior discontinuities, cusps, or singularities should be supplied as
`breakpoints=[...]`. They define the initial partition without evaluating the
callback exactly at a breakpoint.

For a known integrable endpoint singularity, request
`endpoint_singularities="left"`, `"right"`, or `"both"`. The implementation
uses explicit quadratic changes of variables on the affected edge intervals.
It never probes endpoints heuristically and therefore never claims to discover
an unknown singularity.

The infinite maps are:

- `[a, +infinity)`: `x = a + (1-t)/t`, `dx = dt/t^2` after reversing limits;
- `(-infinity, b]`: `x = b - (1-t)/t`, `dx = dt/t^2`; and
- the whole line: two independently adapted components, one using each
  semi-infinite map above with the split point `0`.

The two whole-line halves are never paired before local error and `abs(f)`
evidence is formed. This prevents an odd divergent callback from being silently
accepted as a symmetric Cauchy principal value and preserves cancellation
evidence for convergent odd callbacks.

Reversed bounds preserve the usual sign convention. Infinite intervals with
interior breakpoints are rejected until multiple semi-infinite components have
a qualified error-allocation contract.

## Budgets and exact failure identity

Every execution enforces callback evaluations, active intervals, subdivision
depth, elapsed time, conservative workspace bytes, trace events, trace bytes,
and an optional cancellation callback. The shared `status` remains within the
versioned P0 result vocabulary; elapsed-time exhaustion uses its exact
`maximum_elapsed_time` status and diagnostic. `stop_reason` preserves the exact
domain state:

- `converged`, `zero_interval`;
- `maximum_evaluations`, `maximum_elapsed_time`, `maximum_intervals`;
- `maximum_depth`, `maximum_memory`, `interval_too_small`;
- `roundoff_detected`, `cancelled`, `callback_error`;
- `nonfinite_evaluation`, `validation_failed`, or `invalid_problem`.

On a nonconverged solver stop, the primary `value` is `None`. If every active
leaf has a complete quadrature rule, the best complete-partition scalar remains
available only as `domain_payload.solver_estimate`, labeled
`unvalidated_best_complete_partition`; it is evidence about solver progress,
not a reported integral. A partial quadrature-rule evaluation is never
published as a complete interval, and an initial multi-component partition is
published only after every component has a complete first rule. If the solver
converged but independent validation later fails or exhausts a resource budget,
the value remains available and `solver_stop_reason`, `solver_converged`, and
`public_value_semantics` preserve that distinction.

## Trace and explanation semantics

Iteration events state which largest-error interval was bisected, both child
records, the global estimate, global error estimate, target, depth, active
interval count, and roundoff counter. The shared trace policy bounds events and
bytes with deterministic retention. `result.explain()` narrates the atomic
initial partition, largest-error bisections, resource use, independent-rule
agreement, and the exact reason a failed result stopped. If trace retention
omitted intermediate subdivisions, the explanation says so rather than
reconstructing or interpolating them.

All visual views are canonical renderer-neutral `PlotSpec` or `PlotAnimation`
documents:

- `result.plot()` (or `result.to_plot_spec()`) shows the final local-error
  allocation in physical `x` for finite intervals and transformed `t` by
  component for infinite intervals.
- `result.plot(view="convergence")` and `result.convergence_plot()` show the
  retained global error estimates against the requested stopping target.
- `result.animate()` (or `result.to_animation()`) replays the retained
  largest-error parent and its two computed children. Frames are computed
  states only: transition duration is zero and no intermediate mathematical
  states are invented. The animation is deliberately a local refinement view,
  not a reconstructed full-partition history; use the static partition view
  for every retained final leaf.

Visualization never reevaluates the callback. It consumes the final partition
and bounded semantic trace, retains stable layer/frame identifiers, uses fixed
axes across animation frames, and caps one animation at 128 frames, 8,192 data
scalars, and 8 MB of semantic JSON. Longer retained histories are
deterministically decimated while preserving their endpoints. Animation
metadata reports trace truncation and visualizer decimation separately.

Every static view and every animation frame has explicit alternative text. A
failure before the first complete interval rule yields an accessible textual
`PlotSpec` instead of an empty chart or a fabricated partition. Static
partition, convergence, and explanation views remain useful when an animation
renderer is unavailable.

The current scope intentionally rejects complex, multidimensional,
principal-value, and specialized oscillatory/weighted integration. In
particular, nested multidimensional calls are not labeled supported until they
can share one honest global tolerance, evaluation count, cancellation signal,
and memory budget.

All adaptive error evidence comes from finitely many deterministic nodes. A
feature that is narrow enough to lie between every initial Gauss-Kronrod and
Gauss-Legendre node can therefore remain unseen; independent-rule agreement is
convergence-supporting evidence, not a certificate that an arbitrary callback
has no unsampled feature. Supply breakpoints bracketing known narrow peaks or
localized transitions. Similarly, a shifted endpoint singularity can become
unresolvable when no binary64 number represents the transformed physical
coordinate; that case stops as `interval_too_small` rather than probing the
singular endpoint or reporting callback failure.

## Evidence

- `test/numerics/integration/corpus.json` classifies analytic, singular,
  infinite, conditioned, pathological, metamorphic, and failure cases.
- `test.cjs` runs the same corpus in CPython and Sage.js and is discovered by
  the repository integration-test manifest.
- `scipy-mpmath-oracle.py` differentially compares finite, breakpoint,
  singular, and infinite cases against SciPy 1.18 QUADPACK and mpmath 1.3
  high-precision references.
- `bench/numerics/integration/benchmark.cjs` measures the same source and
  tolerance in CPython and dynamic Sage.js, including independent validation.
- `performance.json` records the initial Linux x64 baseline and labels it
  development evidence rather than four-platform release qualification.

See [algorithm-survey.md](algorithm-survey.md) for the selection evidence and
[support-matrix.json](support-matrix.json) for the machine-readable envelope.
