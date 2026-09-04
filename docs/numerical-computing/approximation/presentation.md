# Approximation explanations and semantic views

Approximation results own their mathematical explanation and semantic view.
They return canonical plotting documents from `sagejs.plotting`; renderers may
lower those documents later, but no approximation method imports Plotly,
browser state, or a display backend.

## Successful interpolation

```python
from sagejs.numerics.approximation import interpolate

result = interpolate([-1, 0, 1], [1, 0, 1], trace="summary")

explanation = result.explanation()
assert explanation["outcome"]["validation_passed"]
assert explanation["construction"]["representation"] == "second-barycentric-form"

spec = result.to_plot_spec(samples=201)
assert [layer.kind for layer in spec.layers] == ["line", "point"]

animation = result.to_animation(samples=129, max_frames=16)
assert animation.frames[-1].label == "samples 3/3"
```

The line layer is the validated approximant. The point layer contains only the
detached construction samples. Stable layer IDs and kinds are retained across
animation frames. Spline animations reveal completed polynomial segments;
Chebyshev animations show successive coefficient prefixes rather than
pretending each DCT coefficient is an independent error proof.

## Finite-difference stencil refinement

```python
import math

from sagejs.numerics.approximation import finite_difference

result = finite_difference(math.exp, 1.0, derivative=math.exp)
animation = result.to_animation()

assert [frame.label for frame in animation.frames] == [
    "coarse stencil",
    "halved stencil",
]
```

Both frames use the actual stored sample points, values, and weights from
execution. Creating the view does not call the user's function again. The
point layer metadata carries the signed stencil weights while the plotted
ordinates remain the sampled function values.

## Failed construction

```python
import math

from sagejs.numerics.approximation import finite_difference

failed = finite_difference(
    math.exp,
    0.0,
    step=10.0,
    derivative=math.exp,
    atol=1e-300,
    rtol=1e-300,
)

assert not failed.success
assert failed.explanation()["outcome"]["status"] == "validation_failed"
assert failed.to_plot_spec().layers[0].kind == "text"
assert len(failed.to_animation().frames) == 2
```

A failed result has no validated curve. Its `PlotSpec` therefore contains an
instructive semantic text layer rather than graphing a rejected model. The two
failure frames distinguish the planned method from the structured stop or
validation outcome. Elapsed-time failures retain
`outcome.stop_reason="maximum_elapsed_time"` even before a shared status
registry is combined with this isolated lane.

## Independent resource envelopes

- `NumericalTrace` retains at most its declared event and UTF-8 byte budgets;
  phase events are subject to the same deterministic decimation as every other
  event.
- `to_plot_spec()` accepts 2 through 4097 curve samples.
- `to_animation()` accepts 2 through 257 curve samples and 2 through 64
  requested frames.
- Every animation additionally enforces at most 200,000 semantic data scalars,
  an 8 MiB serialized payload, four layers per frame, and 22.4 seconds of
  declared playback duration.

These are materialization limits, not renderer hints. Requests beyond them
raise before allocating frames, and presentation never spends the numerical
callback, iteration, or elapsed-time budget.
