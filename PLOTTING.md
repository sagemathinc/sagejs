# Plotting in Sage.js

Sage.js implements a small Sage-compatible semantic graphics layer and renders
it with Plotly.js in browser embeddings. The mathematical API is not a Plotly
wrapper: `plot()`, `line()`, `point()`, and `list_plot()` return composable
`Graphics` objects whose primitives retain their numerical data and options.

```py
p = plot(
    sin(x^2),
    (x, 0, 2*pi),
    color='red',
    thickness=2,
    legend_label='sin(x^2)',
    title='A first Sage.js plot',
    axes_labels=['x', 'y'],
)
q = point((0, 0), color='black', size=12)
p + q
```

The terminal representation follows Sage:

```text
Graphics object consisting of 2 graphics primitives
```

An embeddable kernel additionally returns an
`application/vnd.plotly.v1+json` display payload. Mathematical objects and
their implementation details remain inside the evaluator worker; only
structured-clone-safe traces, layout, and configuration cross the boundary.

## Supported API

Plotting v0 includes:

- composable `Graphics`, `Line`, and `Point` objects;
- primitive indexing, iteration, length, options, and representations;
- `line()` and `point()` over two-dimensional coordinate sequences;
- `list_plot()` over y-values or coordinate pairs;
- `plot()` over one symbolic expression, numerical callable, or a list of
  either;
- Sage's uniform sampling followed by recursive adaptive refinement;
- colors, opacity, line thickness and style, markers, legends, titles, axes
  labels and ranges, linear/log scales, gridlines, and aspect ratios.

Callable plots default to 200 initial points, adaptive tolerance `0.01`, and
five refinement levels, matching Sage's public defaults. Pass
`randomize=False` for deterministic sample positions.

## Embedding and rendering

The kernel result contains text for every frontend and optional rich display
data:

```js
const result = await sage.evaluate(source);

console.log(result.repr);
if (result.display) {
  await renderSageDisplay(element, result.display, Plotly);
}
```

The browser/WASM package exports the renderer separately:

```js
import {
  renderSageDisplay,
} from "@sagemath/sagejs-flint-wasm/plotly-renderer";
```

Plotly is injected by the embedding application. This keeps Plotly and its
bundle size out of the compiler, mathematical baselib, worker protocol, and
Node kernel. Applications may use the full distribution, a custom Plotly
bundle, or another renderer for the same semantic graphics objects.

Symbolic plots compile their expression once with `fast_callable()`. Cortex
Compute Engine emits the numerical JavaScript lambda and Sage.js installs it
directly, so adaptive sampling does not pay Python operator-dispatch or
general symbolic-evaluation overhead for every point.

## Deliberate current limits

Additional primitives such as parametric, polar, implicit, contour, polygon,
text, matrix, and complex plots can be ported incrementally without changing
the `Graphics` or rich-display boundary. Symbolic assumptions, equation
solving, integration, and full Sage expression compatibility are also outside
this first symbolic slice.
