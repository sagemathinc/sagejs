# Parameter sweeps as retained numerical evidence

`SweepResult` is both an aggregate execution record and a teaching surface.
Its presentation API never calls the original evaluator and never fills a
failed item with an interpolated value:

```python
explanation = result.explanation()
print(result.explain())

plot = result.to_plot_spec(
    x_path="/parameter/rate",
    y_path="/value/value/0",
    x_label="decay rate",
    y_label="retained y(2)",
)
animation = result.to_animation(
    x_path="/parameter/rate",
    y_path="/value/value/0",
    x_label="decay rate",
    y_label="retained y(2)",
)
```

The paths are RFC 6901 JSON pointers relative to each retained
`SweepItemResult` record. They are data selectors, not executable callbacks.
A selector that is missing, nonnumeric, or nonfinite for any successful item
fails closed. Failed and skipped items remain in `explanation()` and PlotSpec
provenance, but receive no synthetic coordinate.

## What the explanation claims

The structured explanation separates three facts that are easy to conflate:

- scheduler completion: whether each item ran under its fixed credits;
- nested numerical validation: whether a retained standard numerical result
  reports passing independent validation evidence; and
- arbitrary callback completion: a JSON value may be returned successfully
  without being a standard validated numerical result.

Thus a generic sweep never upgrades “the callback returned” into a
mathematical correctness claim. ODE parameter sweeps are stronger because the
adapter accepts only successful nested `OdeResult` records; each plotted
endpoint still carries that result's truth level and validation checks.

## Animation semantics

The animation begins with the empty retained prefix and advances through exact
completed-item prefixes in input order. At most 32 frames are materialized by
default. Longer sweeps use deterministic evenly spaced prefix selection, retain
the first and final states, and set `interpolation: "none"`. A failed item may
therefore produce a frame with unchanged plot coordinates and new failure
metadata. That is intentional: the item's evidence changed, but no numerical
value was established.

Every animation exposes Play, Pause, Step, Restart, Speed, and an absolute
processed-item slider. It never autoplays or loops. The host operates those
controls over the retained frame IDs; it does not re-enter the numerical
evaluator.

## ODE teaching story

The generated
[`ode-parameter-sweep.json`](../gallery/stories/ode-parameter-sweep.json)
varies the rate in `y' = -rate*y` and compares each retained endpoint with the
independent identity `y(2) = exp(-2*rate)`. Its second case deliberately gives
the rate-2 solve only one evaluation. Four validated endpoints remain visible,
while the failed item retains `OdeSweepSolveError` and no plotted point.

Regenerate and verify the story with:

```sh
node test/numerics/gallery/generate-sweep-story.cjs --write
node --test test/numerics/gallery/sweep-gallery.test.cjs
```

The checked artifact records result, animation, Plotly, scalar, frame, and
callback-count measurements under explicit fail-closed budgets.
