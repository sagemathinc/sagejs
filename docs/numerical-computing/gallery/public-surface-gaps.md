# Public presentation gaps exposed by the gallery

The gallery consumes public numerical results only. It does not reach into
private solver state. This made two cross-cutting gaps visible.

## Root visualization spends callback budget

`NumericalResult.animate()` for scalar roots samples the live function on a
129-point grid and evaluates bracket/candidate points again. That behavior is
reasonable for an immediate live plot but cannot produce a durable replay: a
callback can be expensive, stateful, unavailable after serialization, or
unsafe outside the original resource budget.

Both root stories therefore use public `evaluation` and `iteration` trace
events. Their visual state contains only computed points, retained brackets,
and retained candidates. The bundle records the missing smooth curve and
unchanged callback counts.

A domain-level fix should retain an optional, explicitly budgeted display
sample in the result during the original computation, or provide a trace-only
public presentation mode. It should not silently evaluate the function during
`plot()` or `animate()`.

## Axis vocabulary differs from shared Plotly lowering

The shared `sagejs.plotting.lower_plot_spec` contract accepts Plotly-shaped
`axes_or_scene.xaxis` and `.yaxis` fields. Current visualizers in optimization,
ODE, linear algebra, approximation, spectral methods, and statistics emit the
older `{x: {label: ...}, y: {label: ...}}` vocabulary. Integration and the
gallery's trace-only root story already lower through the shared path.

Each checked presentation records whether shared lowering succeeded and, on
failure, the exact exception. The gallery's fallback translates only bounded
2-D `line`, `point`, and `text` layers. It is intentionally not a second
general plotting system.

The domain owners should converge on canonical `xaxis`/`yaxis` settings (or the
shared lowering should deliberately normalize the semantic `x`/`y` form).
Once shared lowering passes, the checked evidence will change from `blocked`
to `available` and the fallback can disappear.

## Failure records without a complete visual state

The nonlinear-fit callback-domain error has no fitted values and therefore no
honest fit plot. The gallery leaves it as a static narrative and structured
result table. Other failures are visualized only where the public result
retains enough evidence: shrinking brackets around a discontinuity, rejected
stiff ODE steps, an incomplete quadrature partition, budget-limited optimizer
iterates, and static singularity/conditioning/regression diagnostics.

This distinction is intentional. A uniform “always animate” API would create
pressure to fabricate states for early failures.

