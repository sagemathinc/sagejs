# Initial-value ODE laboratory

The ODE laboratory solves real binary64 systems

\[
y'(t)=f(t,y), \qquad y(t_0)=y_0
\]

with transparent explicit Runge–Kutta methods. It records the computed
trajectory, local error-control decisions, dense-output coefficients, located
events, independent derivative-defect samples, invariant drift, and optional
analytic-reference error. Local error control is useful evidence, but it is not
presented as a global forward-error bound.

The package is currently imported from its domain path because the numerical
integration lane owns the parent registry:

```python
import math
from sagejs.numerics.ode import OdeEvent, OdeInvariant, solve_ivp
```

## A first adaptive solve

The harmonic oscillator has the exact solution
`q(t) = cos(t), p(t) = -sin(t)` and preserves `q² + p²`.

```python
result = solve_ivp(
    lambda t, y: [y[1], -y[0]],
    (0.0, 2.0 * math.pi),
    [1.0, 0.0],
    rtol=1e-8,
    atol=1e-11,
    invariants=[
        OdeInvariant(
            lambda t, y: y[0] ** 2 + y[1] ** 2,
            name="squared norm",
            atol=2e-7,
            rtol=2e-7,
        )
    ],
    reference=lambda t: [math.cos(t), -math.sin(t)],
    reference_atol=2e-8,
    reference_rtol=2e-7,
)

assert result.success
state_at_pi = result.trajectory(math.pi)
phase_portrait = result.plot("phase")
step_history = result.plot("step_size")
local_errors = result.plot("local_error")
animation = result.animate("phase")
print(result.explain())
```

`result.trajectory.internal_times` and `internal_states` are accepted solver
knots. Calling the trajectory evaluates a durable piecewise polynomial, not a
new solve. If `evaluation_times` is supplied, `trajectory.times` and
`trajectory.states` expose those requested samples while the internal knots
remain available for explanation.

## The two methods

`method="rk4"` is the classical four-stage, fourth-order fixed-step method. It
has no error estimator. Its cubic Hermite dense output costs one additional RHS
evaluation at each endpoint. It is valuable for studying convergence and for
comparing fixed and adaptive stepping, but its validation truth level remains
`heuristic` unless an external argument establishes more.

`method="rk45"` is the Dormand–Prince 5(4) embedded pair. The fifth-order state
is accepted while the fourth/fifth difference estimates local error. For
component `i`, the scale is

\[
s_i = \mathrm{atol}_i + \mathrm{rtol}\max(|y_i^n|,|y_i^{n+1}|),
\]

and the controller accepts a step when the weighted RMS norm

\[
\left(\frac{1}{d}\sum_i(e_i/s_i)^2\right)^{1/2} \le 1.
\]

The next-step proposal uses safety factor `0.9`, growth bounds `[0.2, 10]`, and
the `-1/5` exponent appropriate to the fourth-order estimator. A rejected step
cannot immediately grow. The initial step follows scaled state, derivative,
and derivative-change estimates rather than an arbitrary fraction of the
interval.

Each accepted RK45 step also stores Shampine's quartic continuous extension.
The dense polynomial is used for requested samples, residual evidence, and
event location. It interpolates the numerical solution; it does not turn local
error estimates into a global bound.

## Events and termination

An event is a scalar function `g(t, y)`. The solver detects a sign change at
accepted step endpoints and bisects the dense polynomial until it has a small
time bracket or event residual. Direction is measured along the integration
direction.

```python
impact = solve_ivp(
    lambda t, y: [y[1], -9.81],
    (0.0, 3.0),
    [10.0, 0.0],
    events=OdeEvent(
        lambda t, y: y[0],
        name="ground",
        terminal=True,
        direction=-1,
        value_tolerance=1e-9,
    ),
)

assert impact.termination_reason == "terminal_event"
assert impact.events[0].residual_passed
```

Event detection is honest about its envelope: multiple crossings within one
accepted step, tangencies without sign change, and discontinuous event
functions can be missed or fail residual validation. Reducing `max_step` is a
useful response when crossings are closely spaced.

Hard execution limits cover step attempts, solver callback evaluations,
elapsed time, event-location iterations, stored output points, validation
callbacks, trace events, and trace bytes. A zero-argument `cancel` callback is
checked before callbacks, stages, steps, and event-location iterations.

## Reading the evidence

The common result separates solver termination from post-validation.

- `local_error_control` records accepted/rejected attempts and the largest
  weighted RMS estimate. Its scope explicitly says `not_global_error`.
- `dense_defect` samples `dP/dt - f(t, P(t))` at independently selected dense
  midpoints. It is backward-residual evidence for the interpolant, not a
  forward-error certificate.
- `invariants` records independently computed initial values, maximum drift,
  thresholds, and pass/fail decisions.
- `reference_solution` compares against a caller-supplied analytic or trusted
  reference under explicit tolerances.
- event records retain the final bracket, residual, direction, and location
  iterations.

A solver can reach the requested bound and still return
`status="validation_failed"`. Conversely, an exhausted budget retains its
partial trajectory and evidence but does not claim success.

## Failure as a teaching example

The problem

\[
y'=-1000(y-\cos t)-\sin t,\qquad y(0)=1
\]

has the benign-looking solution `cos(t)` but a rapidly decaying stiff mode.
`radau`, `bdf`, `lsoda`, and SUNDIALS methods are classified as unsupported in
this release. Requesting one raises `OdeUnsupportedError` before evaluating the
callback. Forcing RK45 with a small evaluation budget demonstrates step
rejection or budget exhaustion; it does not silently relabel an explicit method
as stiff-capable.

Use SciPy Radau, SciPy BDF, or SUNDIALS outside Sage.js when a qualified stiff
solver is required. The checked corpus preserves a SciPy Radau oracle for this
case so future stiff work has a concrete acceptance target.

## Visual explanations

The solver records semantic `step` and `event` trace entries. The visualizer
turns those records and accepted trajectory knots into semantic `PlotSpec`
objects:

- `trajectory`: each component against time plus located events;
- `phase`: the first two state components plus located events;
- `step_size`: accepted and rejected step sizes; and
- `local_error`: embedded weighted-RMS estimates and the acceptance threshold.

Animations contain computed knots only, retain fixed layer topology, are
deterministically capped at 64 frames, and embed a static PlotSpec fallback.
PlotSpec supplies accessible descriptions and renderer-independent JSON.

## Evidence and implementation references

- [Backend survey](backend-survey.md)
- [Qualified capability matrix](capabilities.json)
- [Corpus](../../../test/numerics/ode/corpus.json)
- [Frozen SciPy oracle](../../../test/numerics/ode/scipy-oracles.json)
- [Benchmark method and evidence](performance.md)
- [Integration requests](integration-requests.md)
