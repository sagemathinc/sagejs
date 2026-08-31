# Sage.js numerical computing contracts

This directory is the machine-readable public contract for the agent-first
numerical laboratory. The canonical runtime API is `sagejs.numerics`.

The schemas distinguish solver termination from mathematical validation. A
successful backend return is not sufficient: `NumericalResult.success` is true
only when the operation-specific independent validation also passes.

The integrated laboratory currently includes:

- scalar roots by bisection, Brent-Dekker, secant, and Newton;
- dense linear algebra, interpolation, splines, finite differences, adaptive
  quadrature, and validated binary64 polynomial roots;
- local optimization, nonlinear systems, least-squares fitting, explicit and
  linearly implicit ODE initial-value methods, and bounded parameter sweeps;
- dense and certified sparse spectral methods, FFT/convolution, probability,
  inference, regression, and reproducible random sampling;
- structured planning, diagnostics, bounded traces, and provenance;
- operation-specific independent validation rather than trust in a backend
  success status; and
- semantic PlotSpec views and bounded Plotly-compatible animations derived
  from retained computation evidence.

An agent can discover the complete surface without importing or guessing
individual operation names:

```python
from sagejs.numerics import capabilities, describe, plan, supports

registry = capabilities()
sorted(registry["domains"])
describe("approximation.polynomial_roots")

# `problem` can come from any registered domain package.
if supports(problem):
    proposed = plan(problem)  # planning never evaluates its live callback
```

`capabilities("ode")` returns one detached domain document. The unfiltered
registry indexes every operation under an unambiguous `domain.operation` key
and every public adapter under its versioned frontend key. It also states the
common resource-budget contract. Callback-depth and allocation-byte limits are
not silently implied; memory is domain-specific and currently cooperative only
for bounded sweeps.

Method records deliberately separate `implementation_targets` from
`receipt_qualification`. A target says where an implementation is intended to
run. Empty receipt arrays mean that this public registry is not bound to exact
P8 receipts; a platform name in the former never proves the latter.

Canonical domain results are mathematical evidence records and do not invent a
source language. Code generation is owned by `FrontendExecutionResult`, which
retains the frontend intent:

```python
wrapped = frontend_registry.execute(intent)
wrapped.to_code("matlab")
wrapped.numerical_result.to_dict()  # canonical evidence
```

Every common plan contains a planned execution target. Every common result
states its planned target, observed implementation, source/artifact/receipt
digests when supplied, binding status, and an explicit limitations array.

See `surface.json` for the exhaustive classification ledger and
`evidence-policy.json` for routine and release claims. The source and oracle
baseline is recorded in `inventory.md`.
