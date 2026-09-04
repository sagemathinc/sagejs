# Sage and Python fitting and ODE frontends

Sage.js exposes fitting and initial-value ODEs as ordinary Python APIs in both
Sage mode and Python mode. The domain packages are intentional: they keep
`least_squares` for nonlinear fitting distinct from dense linear-algebra least
squares, while both still use the shared `NumericalProblem` → `NumericalPlan`
→ `NumericalResult` contracts.

## Plan a curve fit before evaluating the model

```python
from math import exp

from sagejs.numerics import plan, supports
from sagejs.numerics.optimization import (
    curve_fit_problem,
    solve_curve_fit_problem,
)


def model(x, parameters):
    amplitude, rate = parameters
    return amplitude * exp(-rate * x)


problem = curve_fit_problem(
    model,
    [0.0, 0.5, 1.0, 1.5],
    [2.0, 1.42, 1.04, 0.73],
    [1.5, 0.4],
    max_evaluations=2000,
    max_elapsed_ms=5000,
    trace="iterations",
)

assert supports(problem)
selected = plan(problem)  # does not call model
print(selected.method, selected.backend, selected.expected_resources)

result = solve_curve_fit_problem(problem)
print(result.value)
print(result.validation.to_dict())
print(result.explain())
```

`curve_fit(...)` is the direct convenience spelling. It constructs the same
problem and calls `solve_curve_fit_problem`; it is not a separate solver path.
Both calls return `OptimizationResult`, including the canonical problem and
plan binding, bounded trace, callback accounting, independent stationarity and
local-minimum checks, fit observations, fitted values, residuals, and parameter
conditioning evidence where justified.

Construction converts the observations and initial parameters to finite
binary64 values and stores detached copies. It does not invoke the model or
Jacobian. Cancellation is checked before callbacks, and callback/evaluation,
iteration, elapsed-time, trace-event, and trace-byte budgets remain hard
limits. Every `to_dict()` call returns a fresh detached record.

The public capability record is available without solving:

```python
from sagejs.numerics import describe

surface = describe("curve_fit")
print(surface["methods"])
```

Automatic selection currently chooses the same-source
`damped-gauss-newton` implementation. Exact `cminpack-lmdif` and
`cminpack-lmder` identities are explicit requests with no silent substitution.
General nonlinear constraints, arbitrary precision, automatic cminpack
selection, and a certified global-optimum claim are explicitly unsupported.
The curve-fit API is currently a Sage/Python domain frontend, not a
multilingual code-emission adapter; it therefore does not claim a `to_code`
round trip.

## Plan and solve an initial-value problem

ODEs already provide the same complete constructor/plan/solve structure:

```python
from sagejs.numerics import plan, supports
from sagejs.numerics.ode import OdeEvent, ode_problem, solve_ode_problem


def falling(t, state):
    height, velocity = state
    return [velocity, -9.81]


problem = ode_problem(
    falling,
    (0.0, 3.0),
    [10.0, 0.0],
    events=OdeEvent(
        lambda t, state: state[0],
        name="ground",
        terminal=True,
        direction=-1,
    ),
    rtol=1e-8,
    atol=1e-11,
    max_evaluations=2000,
    max_elapsed_ms=5000,
    trace="iterations",
)

assert supports(problem)
selected = plan(problem)  # does not call falling or the event
result = solve_ode_problem(problem)
print(result.trajectory(result.events[0].time))
print(result.validation.to_dict())
```

`solve_ivp(...)` is the direct convenience spelling over the same path. The
result retains the trajectory, dense-output segments, local error-control
history, event-location evidence, independent dense-defect checks, optional
invariant/reference checks, callback accounting, and bounded semantic trace.
Its local error estimate is never described as a global forward-error bound.

`rk4`, `rk45`, and the dense linearly implicit `rosenbrock4` method are the
classified real-binary64 methods. `bdf`, `cvode`, `dop853`, `lsoda`, `radau`,
`rk23`, and `sundials` fail during planning, before evaluating a user callback,
with a structured `OdeUnsupportedError` and an alternative. Complex states,
mass matrices, DAEs, automatic stiffness detection, sparse stiff solves, and
boundary-value problems are not claimed.

The same imports and semantics work in CPython, Sage.js Python mode, and Sage
mode. Browser, Node, SEA, and four-platform release qualification remain bound
to the exact-candidate P8 receipts rather than inferred from these source-level
frontends.
