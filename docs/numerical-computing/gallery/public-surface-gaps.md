# Public presentation gaps exposed by the gallery

The gallery consumes public numerical results only. It does not reach into
private solver state. This made two cross-cutting gaps visible and supplied
the regression fixtures used to close them.

## Resolved: root visualization spent callback budget

The former scalar-root visualizer sampled the live function on a 129-point
grid and evaluated bracket/candidate points again. That could not produce a
durable replay: a callback may be expensive, stateful, unavailable after
serialization, or already at its resource limit.

`NumericalResult.plot()` and `.animate()` now use public `evaluation` and
`iteration` trace events directly. Their visual state contains only computed
points, retained brackets, and retained candidates. A trace with evaluation
events preserves signed `f(x)` values; an iteration-only trace honestly shows
residual magnitude instead. Presentation metadata states
`computed_evidence_only: true` and `callback_reevaluated: false`, and tests
assert that callback counts do not change. No smooth curve is fabricated.

## Resolved: axis vocabulary differed from shared Plotly lowering

The shared `sagejs.plotting.lower_plot_spec` contract accepts canonical
`Axes2DSettings` records with `axes_or_scene.xaxis` and `.yaxis`. Some early
domain visualizers emitted the older `{x: {label: ...}, y: {label: ...}}`
shape, so otherwise valid public PlotSpecs could not use shared lowering.

Optimization, ODE, linear algebra, approximation, spectral, and statistics
visualizers now construct their axes with `Axes2DSettings`/`AxisSettings`.
Checked presentations record successful shared lowering. The gallery retains
its deliberately tiny 2-D `line`, `point`, and `text` adapter as a fail-closed
compatibility check for older serialized evidence, not as a second plotting
system.

## Failure records without a complete visual state

The nonlinear-fit callback-domain error has no fitted values and therefore no
honest fit plot. The gallery leaves it as a static narrative and structured
result table. Other failures are visualized only where the public result
retains enough evidence: shrinking brackets around a discontinuity, rejected
stiff ODE steps, an incomplete quadrature partition, budget-limited optimizer
iterates, and static singularity/conditioning/regression diagnostics.

This distinction is intentional. A uniform “always animate” API would create
pressure to fabricate states for early failures.
