# Plotting in Sage.js

Sage.js implements a Sage-compatible semantic graphics layer and renders it
with Plotly.js in browser embeddings. The mathematical API is not a Plotly
wrapper: plotting functions return composable `Graphics` or `Graphics3d`
objects whose primitives retain their numerical data and options.

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

Three-dimensional plots use Sage's familiar API and compose the same way:

```py
u, v = var('u v')
wave = plot3d(
    sin(pi*(u^2 + v^2))/2,
    (u, -1, 1),
    (v, -1, 1),
    color=['navy', 'cyan', 'yellow'],
    opacity=0.85,
    mesh=True,
    frame=False,
)
wave + sphere((0, 0, 0.35), size=0.18, color='red', opacity=0.8)
```

This displays as an interactive Plotly surface and sphere, with orbit controls,
zooming, and camera rotation, while its terminal representation is Sage's
`Graphics3d Object`.

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

Three-dimensional plotting includes:

- composable `Graphics3d`, `Surface3d`, `Line3d`, and `Point3d` objects;
- `plot3d()` over symbolic expressions, numerical callables, or constants;
- `parametric_plot3d()` for space curves and parametric surfaces;
- `sphere()`, `line3d()`, and `point3d()`;
- rectangular or parametric grids with configurable `plot_points`;
- solid or gradient colors, opacity, mesh contours, sample dots, legends,
  titles, axes labels, frames, figure sizes, and aspect ratios.

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
general symbolic-evaluation overhead for every point. Symbolic 3D plots use
the same path with a compiled function of two variables.

## File export

Two-dimensional graphics, graphics arrays, and three-dimensional graphics
share one host-neutral Plotly figure representation:

```py
g = plot(prime_pi, 1, 100)
figure = g.plotly()
g.save('prime-counting.png', width=800, height=500, scale=2)
```

The Node host supports:

- `png`, `jpeg`, `webp`, and `svg` static images;
- self-contained interactive `html`;
- renderer-neutral Plotly `json`.

Static image export uses an installed Chrome or Chromium through
`playwright-core`. Set `SAGEJS_CHROMIUM_PATH` when the browser is not on the
usual executable path. HTML and JSON export do not require a browser. Image
rendering runs in an isolated helper process so Sage's synchronous `save()`
contract does not leak asynchronous JavaScript into mathematical code.
Single-executable builds embed the Plotly bundle for HTML output; their static
PNG/SVG helper is not bundled yet, so use HTML/JSON or the npm distribution
when running an SEA artifact.

Browser embeddings can provide `onGraphicsSave` when creating their session.
The bundled demo uses this callback and `downloadSageDisplay()` to turn
`g.save('plot.png')` into a browser download:

```js
const sage = await createSage({
  onGraphicsSave(request) {
    return downloadSageDisplay(
      request.display,
      request.filename,
      request.options,
      Plotly,
    );
  },
});
```

Plotly renders 3D graphics with WebGL. Raster export preserves the complete
plot; an SVG containing a 3D scene necessarily embeds the WebGL portion as a
raster image.

## Deliberate current limits

Three-dimensional surfaces currently use deterministic rectangular sampling.
Adaptive surface triangulation and coordinate transformations raise an
explicit `NotImplementedError`. Implicit surfaces, volume plots, polyhedra,
3D text, and additional solid primitives can be ported incrementally without
changing `Graphics3d` or the rich-display boundary.

Additional two-dimensional primitives such as polar, implicit, contour,
polygon, text, matrix, and complex plots remain to be ported. Symbolic
assumptions, equation solving, integration, and full Sage expression
compatibility are also outside the current symbolic slice.
