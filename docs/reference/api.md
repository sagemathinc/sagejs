---
title: "Sage.js API reference"
docspec_version: 1
generated: true
---

# Sage.js API reference

This file is generated from the runtime DocSpec registry. Edit the
adjacent public docstring and registration metadata, then regenerate it.

## `AffineSpace`

```sage
AffineSpace(dimension: int, base: sage.Parent, names: Any='x') -> AffineSpaceParent
```

Construct affine space with the requested coordinate names.

### Example

```sage
sage: A = AffineSpace(2, QQ, 'xy')
sage: A
Affine Space of dimension 2 over Rational Field
sage: A.gens()
(x, y)
```

The coordinate ring is a FLINT-backed multivariate polynomial ring.

### Metadata

- Kind: `function`
- Module: `sage.schemes`
- Tags: algebraic geometry, affine schemes, curves, multivariate polynomials
- Backends: FLINT, Sage.js algebraic geometry layer
- Sage compatibility: partial — Affine plane curves, hypersurface components, and rational plane-curve intersections are supported. General schemes and primary decomposition remain outside the current implementation.
- Limitations: General primary decomposition is not implemented, and complete Gröbner-fan enumeration currently covers the twisted-cubic determinantal ideal.

### Provenance

- `sage-derived` — [SageMath schemes and plane curves API](https://doc.sagemath.org/html/en/reference/curves/); license GPL-2.0-or-later
- `library-backed` — [FLINT multivariate polynomial arithmetic](https://flintlib.org/doc/)

## `animate`

```sage
animate(frames: Any, **options: Any) -> Animation
```

Animate an iterable of Sage graphics or plottable symbolic objects.

The optional `delay` is measured in hundredths of a second, matching
SageMath.  `iterations=0` denotes unrestricted interactive replay.

### Metadata

- Kind: `function`
- Module: `sage.plot`
- Tags: graphics, plotting, 2D graphics, 3D graphics, animation
- Backends: Plotly, Sage.js adaptive sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Sage-compatible semantic graphics with Plotly rendering

### Provenance

- `sage-derived` — [SageMath plotting API and object model](https://doc.sagemath.org/html/en/reference/plotting/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/)

### References

- [Plotly JavaScript Open Source Graphing Library](https://plotly.com/javascript/).

## `arc`

```sage
arc(center: Any, r1: Any, r2: Any=None, angle: Any=0, sector: Any=None, **options: Any) -> Graphics
```

Return a circular or elliptical arc over an angular sector.

### Metadata

- Kind: `function`
- Module: `sage.plot`
- Tags: graphics, plotting, 2D graphics, ellipses
- Backends: Plotly, Sage.js adaptive sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Sage-compatible semantic graphics with Plotly rendering

### Provenance

- `sage-derived` — [SageMath plotting API and object model](https://doc.sagemath.org/html/en/reference/plotting/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/)

### References

- [Plotly JavaScript Open Source Graphing Library](https://plotly.com/javascript/).

## `arrow`

```sage
arrow(tailpoint: Any, headpoint: Any, **options: Any) -> Graphics
```

Return a directed line segment from `tailpoint` to `headpoint`.

### Metadata

- Kind: `function`
- Module: `sage.plot`
- Tags: graphics, plotting, 2D graphics, arrows
- Backends: Plotly, Sage.js adaptive sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Sage-compatible semantic graphics with Plotly rendering

### Provenance

- `sage-derived` — [SageMath plotting API and object model](https://doc.sagemath.org/html/en/reference/plotting/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/)

### References

- [Plotly JavaScript Open Source Graphing Library](https://plotly.com/javascript/).

## `arrow2d`

```sage
arrow(tailpoint: Any, headpoint: Any, **options: Any) -> Graphics
```

Return a directed line segment from `tailpoint` to `headpoint`.

### Metadata

- Kind: `function`
- Module: `sage.plot`
- Tags: graphics, plotting, 2D graphics, arrows
- Backends: Plotly, Sage.js adaptive sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Sage-compatible semantic graphics with Plotly rendering

### Provenance

- `sage-derived` — [SageMath plotting API and object model](https://doc.sagemath.org/html/en/reference/plotting/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/)

### References

- [Plotly JavaScript Open Source Graphing Library](https://plotly.com/javascript/).

## `arrow3d`

```sage
arrow3d(start: Any, end: Any, width: Any=1, radius: Any=None, head_radius: Any=None, head_len: Any=None, **options: Any) -> Graphics3d
```

Draw an arrow from `start` to `end` in three dimensions.

### Metadata

- Kind: `function`
- Module: `sage.plot.plot3d`
- Tags: graphics, 3D graphics, arrows
- Backends: Plotly, Sage.js rectangular sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Semantic 3D primitives with Plotly rendering

### Provenance

- `sage-derived` — [SageMath 3D plotting API and object model](https://doc.sagemath.org/html/en/reference/plot3d/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/3d-charts/)

## `axes`

```sage
axes(scale: Any=1, radius: Any=None, **options: Any) -> Graphics3d
```

Create the three positive coordinate axes as 3D arrows.

### Metadata

- Kind: `function`
- Module: `sage.plot.plot3d`
- Tags: graphics, 3D graphics, axes, arrows
- Backends: Plotly, Sage.js rectangular sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Semantic 3D primitives with Plotly rendering

### Provenance

- `sage-derived` — [SageMath 3D plotting API and object model](https://doc.sagemath.org/html/en/reference/plot3d/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/3d-charts/)

## `bar_chart`

```sage
bar_chart(values: Any, **options: Any) -> Graphics
```

Return a graphics object containing a vertical bar chart.

### Metadata

- Kind: `function`
- Module: `sage.plot`
- Tags: graphics, plotting, 2D graphics, charts
- Backends: Plotly, Sage.js adaptive sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Sage-compatible semantic graphics with Plotly rendering

### Provenance

- `sage-derived` — [SageMath plotting API and object model](https://doc.sagemath.org/html/en/reference/plotting/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/)

### References

- [Plotly JavaScript Open Source Graphing Library](https://plotly.com/javascript/).

## `bezier_path`

```sage
bezier_path(path: Any, **options: Any) -> Graphics
```

Return the Bézier path described by Sage's list-of-curves format.

The first curve contains both endpoints. Each later curve inherits its
first endpoint from the preceding curve and supplies zero, one, or two
control points followed by its new endpoint.

### Metadata

- Kind: `function`
- Module: `sage.plot`
- Tags: graphics, plotting, 2D graphics, curves
- Backends: Plotly, Sage.js adaptive sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Sage-compatible semantic graphics with Plotly rendering

### Provenance

- `sage-derived` — [SageMath plotting API and object model](https://doc.sagemath.org/html/en/reference/plotting/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/)

### References

- [Plotly JavaScript Open Source Graphing Library](https://plotly.com/javascript/).

## `bezier3d`

```sage
bezier3d(path: Any, **options: Any) -> Graphics3d
```

Draw a three-dimensional Bézier path.

The first curve contains both endpoints. Later curves inherit their
starting point from the previous curve. Each curve may have zero, one,
or two control points, matching Sage's `bezier3d` path convention.

### Examples

```sage
sage: path = [[(0,0,0), (.5,.1,.2), (.75,3,-1), (1,1,0)],
....:         [(.5,1,.2), (1,.5,0)], [(.7,.2,.5)]]
sage: bezier3d(path, color='green')
Graphics3d Object
```

### Metadata

- Kind: `function`
- Module: `sage.plot.plot3d`
- Tags: graphics, 3D graphics, curves, Bézier paths
- Backends: Plotly, Sage.js rectangular sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Semantic 3D primitives with Plotly rendering

### Provenance

- `sage-derived` — [SageMath 3D plotting API and object model](https://doc.sagemath.org/html/en/reference/plot3d/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/3d-charts/)

## `circle`

```sage
circle(center: Any, radius: Any, **options: Any) -> Graphics
```

Return a circle centered at `center` with the given radius.

### Metadata

- Kind: `function`
- Module: `sage.plot`
- Tags: graphics, plotting, 2D graphics, circles
- Backends: Plotly, Sage.js adaptive sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Sage-compatible semantic graphics with Plotly rendering

### Provenance

- `sage-derived` — [SageMath plotting API and object model](https://doc.sagemath.org/html/en/reference/plotting/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/)

### References

- [Plotly JavaScript Open Source Graphing Library](https://plotly.com/javascript/).

## `Color`

```sage
Color(red: Any='#0000ff', green: Any=None, blue: Any=None, space: str='rgb') -> None
```

A Sage-compatible RGB color with color-space conversions.

### Metadata

- Kind: `function`
- Module: `sage.plot`
- Tags: graphics, plotting, 2D graphics, 3D graphics, colors
- Backends: Plotly, Sage.js adaptive sampler
- Sage compatibility: partial — Sage RGB, HSV, HLS, and HSL construction and conversion are supported with portable CSS color output.
- Algorithm: Sage-compatible semantic graphics with Plotly rendering

### Provenance

- `sage-derived` — [SageMath plotting API and object model](https://doc.sagemath.org/html/en/reference/plotting/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/)

### References

- [Plotly JavaScript Open Source Graphing Library](https://plotly.com/javascript/).

## `complex_plot`

```sage
complex_plot(function_value: Any, x_range: Any, y_range: Any, contoured: bool=False, tiled: bool=False, cmap: Any=None, contour_type: str='logarithmic', contour_base: Any=None, dark_rate: float=0.5, nphases: int=10, **options: Any) -> Graphics
```

Plot a complex function using Sage's domain-coloring convention.

Function argument is represented by hue and magnitude by lightness.
`contoured=True` adds magnitude contours; `tiled=True` also adds evenly
spaced phase contours.

### Examples

```sage
sage: complex_plot(lambda z: z^5 + z - 1 + 1/z,
....:              (-3, 3), (-3, 3))
Graphics object consisting of 1 graphics primitive
```

### Metadata

- Kind: `function`
- Module: `sage.plot`
- Tags: graphics, plotting, 2D graphics, complex analysis, domain coloring
- Backends: Plotly, Sage.js adaptive sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Sage-compatible semantic graphics with Plotly rendering

### Provenance

- `sage-derived` — [SageMath plotting API and object model](https://doc.sagemath.org/html/en/reference/plotting/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/)

### References

- [Plotly JavaScript Open Source Graphing Library](https://plotly.com/javascript/).

## `complex_to_cmap_rgb`

```sage
complex_to_cmap_rgb(z_values: Any, cmap: Any='turbo', contoured: bool=False, tiled: bool=False, contour_type: str='logarithmic', contour_base: Any=None, dark_rate: float=0.5, nphases: int=10) -> list[list[list[float]]]
```

Convert complex values to RGB using a Sage-compatible colormap.

The argument selects a point in the colormap and the magnitude controls
lightness. Common matplotlib names such as `'viridis'`, `'plasma'`,
`'inferno'`, `'cividis'`, `'turbo'`, `'twilight'`, and `'hsv'`
are built in without importing matplotlib.  A list of colors or a callable
returning an RGB(A) tuple is also accepted.

### Examples

```sage
sage: complex_to_cmap_rgb([[0, 1]], cmap='viridis')[0][0]
[0.0, 0.0, 0.0]
sage: len(complex_to_cmap_rgb([[1 + I]], cmap='plasma')[0][0])
3
```

### Metadata

- Kind: `function`
- Module: `sage.plot`
- Tags: graphics, plotting, 2D graphics, complex analysis, domain coloring, colormaps
- Backends: Plotly, Sage.js adaptive sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Sage-compatible semantic graphics with Plotly rendering

### Provenance

- `sage-derived` — [SageMath plotting API and object model](https://doc.sagemath.org/html/en/reference/plotting/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/)

### References

- [Plotly JavaScript Open Source Graphing Library](https://plotly.com/javascript/).

## `complex_to_rgb`

```sage
complex_to_rgb(z_values: Any, contoured: bool=False, tiled: bool=False, contour_type: str='logarithmic', contour_base: Any=None, dark_rate: float=0.5, nphases: int=10) -> list[list[list[float]]]
```

Convert a rectangular grid of complex values to Sage domain colors.

Argument determines hue. Magnitude determines lightness, either smoothly
or through optional logarithmic/linear contours and phase tiles.

### Examples

```sage
sage: colors = complex_to_rgb([[0, 1, 10]])[0]
sage: len(colors), colors[0], len(colors[1])
(3, [0.0, 0.0, 0], 3)
```

### Metadata

- Kind: `function`
- Module: `sage.plot`
- Tags: graphics, plotting, 2D graphics, complex analysis, domain coloring
- Backends: Plotly, Sage.js adaptive sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Sage-compatible semantic graphics with Plotly rendering

### Provenance

- `sage-derived` — [SageMath plotting API and object model](https://doc.sagemath.org/html/en/reference/plotting/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/)

### References

- [Plotly JavaScript Open Source Graphing Library](https://plotly.com/javascript/).

## `contour_plot`

```sage
contour_plot(function_value: Any, xrange: Any, yrange: Any, **options: Any) -> Graphics
```

Plot a sampled scalar function as a filled contour grid.

### Metadata

- Kind: `function`
- Module: `sage.plot`
- Tags: graphics, plotting, 2D graphics, contours
- Backends: Plotly, Sage.js adaptive sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Sage-compatible semantic graphics with Plotly rendering

### Provenance

- `sage-derived` — [SageMath plotting API and object model](https://doc.sagemath.org/html/en/reference/plotting/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/)

### References

- [Plotly JavaScript Open Source Graphing Library](https://plotly.com/javascript/).

## `cube`

```sage
cube(center: Any=[0, 0, 0], size: Any=1, color: Any=None, frame_thickness: Any=0, frame_color: Any=None, **options: Any) -> Graphics3d
```

Return a cube centered at `center` with side length `size`.

### Metadata

- Kind: `function`
- Module: `sage.plot.plot3d`
- Tags: graphics, 3D graphics, shapes, platonic solids
- Backends: Plotly, Sage.js rectangular sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Semantic 3D primitives with Plotly rendering

### Provenance

- `sage-derived` — [SageMath 3D plotting API and object model](https://doc.sagemath.org/html/en/reference/plot3d/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/3d-charts/)

## `Curve`

```sage
Curve(polynomial: Any) -> AffinePlaneCurve
```

Construct an affine plane curve from a multivariate polynomial.

### Example

```sage
sage: x, y = AffineSpace(2, QQ, 'xy').gens()
sage: C = Curve((x^2 + y^2 - 1) * (x^3 + y^3 - 1))
sage: C.irreducible_components()
[Closed subscheme of Affine Space of dimension 2 over Rational Field defined by:
  x^2 + y^2 - 1, Closed subscheme of Affine Space of dimension 2 over Rational Field defined by:
  x^3 + y^3 - 1]
```

Hypersurface components use FLINT multivariate factorization. Plane-curve
intersections over `QQ` use a resultant followed by factorization and
Gröbner bases. General primary decomposition is not yet implemented.

### Metadata

- Kind: `function`
- Module: `sage.schemes`
- Tags: algebraic geometry, affine schemes, curves, multivariate polynomials
- Backends: FLINT, Sage.js algebraic geometry layer
- Sage compatibility: partial — Affine plane curves, hypersurface components, and rational plane-curve intersections are supported. General schemes and primary decomposition remain outside the current implementation.
- Limitations: General primary decomposition is not implemented, and complete Gröbner-fan enumeration currently covers the twisted-cubic determinantal ideal.

### Provenance

- `sage-derived` — [SageMath schemes and plane curves API](https://doc.sagemath.org/html/en/reference/curves/); license GPL-2.0-or-later
- `library-backed` — [FLINT multivariate polynomial arithmetic](https://flintlib.org/doc/)

## `cylindrical_plot3d`

```sage
cylindrical_plot3d(function_value: Any, urange: Any, vrange: Any, **options: Any) -> Graphics3d
```

Plot a radial function in cylindrical coordinates.

### Metadata

- Kind: `function`
- Module: `sage.plot.plot3d`
- Tags: graphics, 3D graphics, surfaces, coordinate transforms
- Backends: Plotly, Sage.js rectangular sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Semantic 3D primitives with Plotly rendering

### Provenance

- `sage-derived` — [SageMath 3D plotting API and object model](https://doc.sagemath.org/html/en/reference/plot3d/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/3d-charts/)

## `density_plot`

```sage
density_plot(function_value: Any, xrange: Any, yrange: Any, **options: Any) -> Graphics
```

Plot the values of a function of two variables as a color density.

### Metadata

- Kind: `function`
- Module: `sage.plot`
- Tags: graphics, plotting, 2D graphics, scalar fields
- Backends: Plotly, Sage.js adaptive sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Sage-compatible semantic graphics with Plotly rendering

### Provenance

- `sage-derived` — [SageMath plotting API and object model](https://doc.sagemath.org/html/en/reference/plotting/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/)

### References

- [Plotly JavaScript Open Source Graphing Library](https://plotly.com/javascript/).

## `DiGraph.is_dag`

```sage
is_dag() -> bool
```

Return the result of the Sage-compatible `is_dag` graph operation.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sagejs-original` — Sage.js graph implementation; license GPL-3.0-only

## `DiGraph.is_directed_acyclic`

```sage
is_directed_acyclic() -> bool
```

Check whether the digraph is acyclic or not.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.digraph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/digraph.py`:998](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/digraph.py#L998); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `DiGraph.reverse`

```sage
reverse() -> DiGraph
```

Return a copy of digraph with edges reversed in direction.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.digraph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/digraph.py`:1859](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/digraph.py#L1859); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `DiGraph.strongly_connected_components`

```sage
strongly_connected_components() -> list[list[Any]]
```

Return the strongly connected components.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sagejs-original` — Sage.js graph implementation; license GPL-3.0-only

## `DiGraph.topological_sort`

```sage
topological_sort(**_options: Any) -> list[Any]
```

Return a topological sort of the digraph if it is acyclic.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.digraph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/digraph.py`:2877](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/digraph.py#L2877); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `digraphs.Circuit`

```sage
Circuit(order: int) -> DiGraph
```

Return the circuit on `n` vertices.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.digraph_generators`
- Tags: graph theory, generators
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/digraph_generators.py`:913](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/digraph_generators.py#L913); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `digraphs.Complete`

```sage
Complete(order: int) -> DiGraph
```

Return the complete digraph on `n` vertices.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.digraph_generators`
- Tags: graph theory, generators
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/digraph_generators.py`:865](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/digraph_generators.py#L865); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `digraphs.Path`

```sage
Path(order: int) -> DiGraph
```

Return a directed path on `n` vertices.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.digraph_generators`
- Tags: graph theory, generators
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/digraph_generators.py`:347](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/digraph_generators.py#L347); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `dimension_cusp_forms`

```sage
dimension_cusp_forms(group: Any, weight: Any=2) -> int
```

Return the dimension of a space of cuspidal modular forms.

`group` may be a positive level (interpreted as `Gamma0(level)`), a
`Gamma0` or `Gamma1` subgroup, or a Dirichlet character. Dimensions
for congruence subgroups use exact Riemann--Roch formulas; character
spaces use the Cohen--Oesterlé formula.

### Examples

```sage
sage: dimension_cusp_forms(Gamma0(11), 2)
1
sage: dimension_cusp_forms(Gamma0(1), 12)
1
sage: eps = DirichletGroup(13).gen(0)^2
sage: dimension_cusp_forms(eps, 2)
1
```

Weight-one cases that require the Schaeffer algorithm raise
`NotImplementedError` instead of returning an unproved value.

### Metadata

- Kind: `function`
- Module: `sage.modular.dims`
- Tags: modular forms, dimensions, cusp forms, Dirichlet characters
- Backends: Sage.js exact arithmetic, FLINT
- Sage compatibility: partial — Implemented Gamma0, Gamma1, and Dirichlet-character cases match SageMath; unresolved weight-one Schaeffer cases raise NotImplementedError.
- Algorithm: Exact Riemann--Roch and Cohen--Oesterlé dimension formulas
- Limitations: Some weight-one cusp dimensions requiring the Schaeffer algorithm are not implemented.

### Provenance

- `sage-derived` — [SageMath modular dimension API](https://doc.sagemath.org/html/en/reference/modfrm/sage/modular/dims.html); license GPL-2.0-or-later
- `literature-implemented` — Riemann--Roch and Cohen--Oesterlé formulas

### References

- Henri Cohen, Joseph Oesterlé, [Dimensions des espaces de formes modulaires](https://doi.org/10.1007/BFb0065297) (1977).

## `dimension_eis`

```sage
dimension_eis(group: Any, weight: Any=2) -> int
```

Return the dimension of the Eisenstein subspace.

Accepted groups and characters are the same as for
`dimension_cusp_forms`. The result is an exact integer obtained from
cusp data or the Cohen--Oesterlé character formula.

### Metadata

- Kind: `function`
- Module: `sage.modular.dims`
- Tags: modular forms, dimensions, Eisenstein series, Dirichlet characters
- Backends: Sage.js exact arithmetic, FLINT
- Sage compatibility: partial — Implemented Gamma0, Gamma1, and Dirichlet-character cases match SageMath; unresolved weight-one Schaeffer cases raise NotImplementedError.
- Algorithm: Exact Riemann--Roch and Cohen--Oesterlé dimension formulas
- Limitations: Some weight-one cusp dimensions requiring the Schaeffer algorithm are not implemented.

### Provenance

- `sage-derived` — [SageMath modular dimension API](https://doc.sagemath.org/html/en/reference/modfrm/sage/modular/dims.html); license GPL-2.0-or-later
- `literature-implemented` — Riemann--Roch and Cohen--Oesterlé formulas

### References

- Henri Cohen, Joseph Oesterlé, [Dimensions des espaces de formes modulaires](https://doi.org/10.1007/BFb0065297) (1977).

## `dimension_modular_forms`

```sage
dimension_modular_forms(group: Any, weight: Any=2) -> int
```

Return cusp dimension plus Eisenstein dimension for `group`.

### Metadata

- Kind: `function`
- Module: `sage.modular.dims`
- Tags: modular forms, dimensions, ambient spaces, Dirichlet characters
- Backends: Sage.js exact arithmetic, FLINT
- Sage compatibility: partial — Implemented Gamma0, Gamma1, and Dirichlet-character cases match SageMath; unresolved weight-one Schaeffer cases raise NotImplementedError.
- Algorithm: Exact Riemann--Roch and Cohen--Oesterlé dimension formulas
- Limitations: Some weight-one cusp dimensions requiring the Schaeffer algorithm are not implemented.

### Provenance

- `sage-derived` — [SageMath modular dimension API](https://doc.sagemath.org/html/en/reference/modfrm/sage/modular/dims.html); license GPL-2.0-or-later
- `literature-implemented` — Riemann--Roch and Cohen--Oesterlé formulas

### References

- Henri Cohen, Joseph Oesterlé, [Dimensions des espaces de formes modulaires](https://doi.org/10.1007/BFb0065297) (1977).

## `DirichletGroup`

```sage
DirichletGroup(modulus: Any, base_ring: Any=None, zeta: Any=None) -> DirichletGroup_class
```

Return the group of Dirichlet characters modulo `modulus`.

Characters are exact, iterable, multiplicative, and valued in a
cyclotomic field.  FLINT supplies the unit-group decomposition and native
character arithmetic.

### Examples

```sage
sage: G = DirichletGroup(20)
sage: G.order(), G.modulus()
(8, 20)
sage: eps = G.gen(0)
sage: eps(3) * eps(7) == eps(21)
True
```

A custom exact value field may be supplied, optionally together with a
root of unity whose order is divisible by the exponent of the character
group.

### Metadata

- Kind: `function`
- Module: `sage.modular.dirichlet`
- Tags: number theory, Dirichlet characters, finite abelian groups, modular forms
- Backends: FLINT, Sage.js native helpers
- Sage compatibility: partial — Standard groups, generators, evaluation, parity, conductors, Galois orbits, decomposition, and exact custom value fields with a supplied root of unity are supported.
- Algorithm: FLINT unit-group decomposition and character evaluation with Sage.js exact cyclotomic values
- Limitations: Analytic sums currently return values in QQbar rather than coercing them back into a custom value field.

### Provenance

- `sage-derived` — [SageMath Dirichlet character API](https://doc.sagemath.org/html/en/reference/modfrm/sage/modular/dirichlet.html); license GPL-2.0-or-later
- `library-backed` — [FLINT Dirichlet characters](https://flintlib.org/doc/dirichlet.html)
- `sagejs-original` — Sage.js parent/element and exact cyclotomic integration

### References

- The FLINT contributors, [FLINT Dirichlet characters](https://flintlib.org/doc/dirichlet.html).

## `disk`

```sage
disk(center: Any, radius: Any, angle: Any, **options: Any) -> Graphics
```

Return a filled or outlined circular/elliptical sector.

### Metadata

- Kind: `function`
- Module: `sage.plot`
- Tags: graphics, plotting, 2D graphics, regions
- Backends: Plotly, Sage.js adaptive sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Sage-compatible semantic graphics with Plotly rendering

### Provenance

- `sage-derived` — [SageMath plotting API and object model](https://doc.sagemath.org/html/en/reference/plotting/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/)

### References

- [Plotly JavaScript Open Source Graphing Library](https://plotly.com/javascript/).

## `dodecahedron`

```sage
dodecahedron(center: Any=[0, 0, 0], size: Any=1, **options: Any) -> Graphics3d
```

Return a regular dodecahedron centered at `center`.

### Metadata

- Kind: `function`
- Module: `sage.plot.plot3d`
- Tags: graphics, 3D graphics, shapes, platonic solids
- Backends: Plotly, Sage.js rectangular sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Semantic 3D primitives with Plotly rendering

### Provenance

- `sage-derived` — [SageMath 3D plotting API and object model](https://doc.sagemath.org/html/en/reference/plot3d/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/3d-charts/)

## `EisensteinForms`

```sage
EisensteinForms(group: Any=1, weight: Any=2, base_ring: Any=None, use_cache: bool=True, prec: Any=6) -> EisensteinSubspace
```

Construct the Eisenstein subspace of `ModularForms(group, weight)`.

Basis elements retain their parent and can be expanded later to a
different precision with `q_expansion(prec)`.

### Examples

```sage
sage: E = EisensteinForms(389, 2)
sage: b = E.basis(prec=20)[0]
sage: b.q_expansion(100).precision_absolute()
100
```

### Metadata

- Kind: `function`
- Module: `sage.modular.modform.constructor`
- Tags: modular forms, spaces, Eisenstein series, q-expansions
- Backends: FLINT, Sage.js exact arithmetic
- Sage compatibility: extension — The supported exact space and q-expansion operations follow SageMath; Sage.js does not yet implement the complete Hecke-module surface.
- Algorithm: Exact dimension formulas and native Eisenstein coefficient generation
- Limitations: Only QQ is currently accepted as the ambient base ring. General Hecke operators and cusp-form bases are not implemented.

### Provenance

- `sage-derived` — [SageMath modular forms API](https://doc.sagemath.org/html/en/reference/modfrm/); license GPL-2.0-or-later
- `library-backed` — [FLINT exact arithmetic](https://flintlib.org/)
- `sagejs-original` — Lightweight parent-aware modular-form implementation

### References

- The FLINT contributors, [FLINT: Fast Library for Number Theory](https://flintlib.org/).

## `EisensteinSeriesElement.q_expansion`

```sage
q_expansion(prec: Any=None) -> Any
```

Return the `q`-expansion to absolute precision `O(q^prec)`.

### Parameters

- `prec` — nonnegative integer; when omitted, use the precision
  requested when this basis element was constructed.

### Examples

The level-389 weight-2 Eisenstein form can be displayed briefly and
then expanded farther without reconstructing its parent:

```sage
sage: E = EisensteinForms(389, 2)
sage: b = E.basis(prec=8)[0]
sage: b.q_expansion(5)
1 + 6/97*q + 18/97*q^2 + 24/97*q^3 + 42/97*q^4 + O(q^5)
```

### Implementation

Level-one divisor sums are generated in one native FLINT sieve.
Prime-level oldforms use the exact degeneracy map `q -> q^N`.

### Metadata

- Kind: `method`
- Module: `sage.modular.modform.element`
- Tags: modular forms, Eisenstein series, q-expansions, power series
- Backends: FLINT, Sage.js native helpers
- Sage compatibility: compatible — Returns an exact power series with Sage-style absolute precision notation.
- Algorithm: Native exact divisor-sum sieve and degeneracy maps
- Limitations: The currently constructed Eisenstein spaces cover the implemented congruence-subgroup cases.

### Provenance

- `sage-derived` — [SageMath modular-form element API](https://doc.sagemath.org/html/en/reference/modfrm/sage/modular/modform/element.html); license GPL-2.0-or-later
- `library-backed` — [FLINT exact arithmetic](https://flintlib.org/)
- `sagejs-original` — Native coefficient sieve and parent integration

### References

- The FLINT contributors, [FLINT: Fast Library for Number Theory](https://flintlib.org/).

## `EisensteinSubspace.basis`

```sage
basis(prec: Any=None) -> list[Any]
```

Return a basis of modular forms, optionally with display precision.

### Parameters

- `prec` — nonnegative integer or `None`. If specified, basis
  entries are displayed to `O(q^prec)`. They retain their parent
  and can subsequently be expanded to any supported precision with
  `q_expansion`.

This optional argument is a convenient Sage.js extension: SageMath's
`basis()` currently uses the space's default precision instead.

### Metadata

- Kind: `method`
- Module: `sage.modular.modform.eis_submodule`
- Tags: modular forms, Eisenstein series, basis, q-expansions
- Backends: FLINT, Sage.js native helpers
- Sage compatibility: extension — The basis is Sage-compatible; the optional prec keyword is a Sage.js convenience extension.
- Algorithm: Exact Eisenstein coefficient construction with lazy precision extension

### Provenance

- `sage-derived` — [SageMath Eisenstein subspace API](https://doc.sagemath.org/html/en/reference/modfrm/); license GPL-2.0-or-later
- `sagejs-original` — Precision-aware retained-parent basis elements

## `ellipse`

```sage
ellipse(center: Any, r1: Any, r2: Any, angle: Any=0, **options: Any) -> Graphics
```

Return an optionally rotated ellipse centered at `(x, y)`.

### Metadata

- Kind: `function`
- Module: `sage.plot`
- Tags: graphics, plotting, 2D graphics, ellipses
- Backends: Plotly, Sage.js adaptive sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Sage-compatible semantic graphics with Plotly rendering

### Provenance

- `sage-derived` — [SageMath plotting API and object model](https://doc.sagemath.org/html/en/reference/plotting/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/)

### References

- [Plotly JavaScript Open Source Graphing Library](https://plotly.com/javascript/).

## `EllipticCurve`

```sage
EllipticCurve(data: Any, coefficients: Any=None) -> EllipticCurveParent
```

Construct an elliptic curve in general Weierstrass form.

```sage
sage: E = EllipticCurve([0,0,1,-1,0])
sage: E
Elliptic Curve defined by y^2 + y = x^3 - x over Rational Field
sage: 10 * E([0,0])
(161/16 : -2065/64 : 1)
```

### Metadata

- Kind: `function`
- Module: `sage.schemes.elliptic_curves.constructor`
- Aliases: `EllipticCurve_from_j`
- Tags: elliptic curves, number theory, Weierstrass equations, modular forms
- Backends: Sage.js exact arithmetic
- Sage compatibility: partial — General Weierstrass construction, rational point arithmetic, native projective prime-field scalar multiplication, explicit-kernel normalized Vélu isogenies, basic invariants, global minimal models, complete Tate local data and conductors over QQ, small Cremona labels, and coefficient lists are supported.
- Limitations: General ranks, descent, isogeny classes, polynomial-kernel Kohel isogenies, duals, and square-root Vélu need additional arithmetic algorithms or databases.

### Provenance

- `sage-derived` — [SageMath elliptic curves API](https://doc.sagemath.org/html/en/reference/arithmetic_curves/); license GPL-2.0-or-later

## `exit`

```sage
quit(code: Any=None) -> None
```

Exit the current Sage.js or Python session.

`quit()` exits successfully. An integer argument becomes the process exit
status, matching Python's interactive convenience function.

### Metadata

- Kind: `function`
- Module: `builtins`
- Tags: runtime, interactive, process
- Backends: Sage.js runtime
- Sage compatibility: compatible — Raises SystemExit with the optional supplied status.

### Provenance

- `software-derived` — [Python site.Quitter interactive API](https://docs.python.org/3/library/constants.html); license PSF-2.0

## `factor`

```sage
factor(value: Any) -> Any
```

Return the exact factorization of an integer or factorable element.

Integer factorization is computed by FLINT and returned as a Sage-style
factorization object, so it can be iterated over as `(prime, exponent)`
pairs.

### Examples

```sage
sage: factor(2026)
2 * 1013
sage: list(factor(-12))
[(2, 2), (3, 1)]
```

JavaScript `number` inputs must be safe integers. Sage integer literals
automatically use `BigInt` when necessary.

### Metadata

- Kind: `function`
- Module: `sage.arith.misc`
- Tags: arithmetic, factorization
- Backends: FLINT
- Sage compatibility: compatible — Matches the documented SageMath result for the supported integer inputs.
- Algorithm: FLINT integer factorization

### Provenance

- `sage-derived` — [SageMath arithmetic API](https://doc.sagemath.org/html/en/reference/rings_standard/sage/arith/misc.html); license GPL-2.0-or-later
- `library-backed` — [FLINT](https://flintlib.org/doc/)

### References

- The FLINT contributors, [FLINT: Fast Library for Number Theory](https://flintlib.org/).

## `fast_callable`

```sage
fast_callable(expression: Any, vars: Sequence[Any] | None=None) -> Any
```

Compile a symbolic expression to a hot JavaScript numeric function.

### Metadata

- Kind: `function`
- Module: `sage.symbolic`
- Tags: symbolic mathematics, evaluation, performance
- Backends: Cortex Compute Engine
- Sage compatibility: partial — Compiles supported real-valued symbolic expressions directly to JavaScript numeric functions.
- Algorithm: MathJSON adapter over Cortex Compute Engine
- Limitations: The current compiler targets JavaScript numeric evaluation.

### Provenance

- `sage-derived` — [SageMath symbolic API](https://doc.sagemath.org/html/en/reference/calculus/); license GPL-2.0-or-later
- `library-backed` — [Cortex Compute Engine](https://cortexjs.io/compute-engine/)

### References

- [Cortex Compute Engine](https://cortexjs.io/compute-engine/).

## `frame_labels`

```sage
frame_labels(lower_left: Any, upper_right: Any, label_lower_left: Any, label_upper_right: Any, eps: Any=1, **options: Any) -> Graphics3d
```

Draw Sage-style endpoint and midpoint labels around a 3D frame.

### Metadata

- Kind: `function`
- Module: `sage.plot.plot3d`
- Tags: graphics, 3D graphics, frames, labels
- Backends: Plotly, Sage.js rectangular sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Semantic 3D primitives with Plotly rendering

### Provenance

- `sage-derived` — [SageMath 3D plotting API and object model](https://doc.sagemath.org/html/en/reference/plot3d/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/3d-charts/)

## `frame3d`

```sage
frame3d(lower_left: Any, upper_right: Any, **options: Any) -> Graphics3d
```

Draw the twelve edges of an axis-aligned three-dimensional frame.

### Metadata

- Kind: `function`
- Module: `sage.plot.plot3d`
- Tags: graphics, 3D graphics, frames
- Backends: Plotly, Sage.js rectangular sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Semantic 3D primitives with Plotly rendering

### Provenance

- `sage-derived` — [SageMath 3D plotting API and object model](https://doc.sagemath.org/html/en/reference/plot3d/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/3d-charts/)

## `GF`

```sage
GF(order: Any, name: Any=None, modulus: Any=None, names: Any=None) -> Any
```

Construct the finite field with `order` elements.

The order must be a prime power.  Prime fields and extension fields use
FLINT arithmetic and participate in Sage.js parent/coercion semantics.
`name` (or `names`) names an extension-field generator.

### Examples

```sage
sage: GF(7)
Finite Field of size 7
sage: K.<a> = GF(9)
sage: a^8
1
sage: K['x']
Univariate Polynomial Ring in x over Finite Field in a of size 3^2
```

Extension moduli are irreducible and normalized to monic. Passing
`modulus='primitive'` uses the backend's primitive Conway polynomial.

### Metadata

- Kind: `function`
- Module: `sage.rings.finite_rings.finite_field_constructor`
- Tags: rings, finite fields, field construction, extension fields
- Backends: FLINT
- Sage compatibility: partial — Prime-power construction and standard generator naming are compatible, including explicit irreducible modulus polynomials.
- Algorithm: FLINT finite-field and modular arithmetic

### Provenance

- `sage-derived` — [SageMath finite rings API](https://doc.sagemath.org/html/en/reference/finite_rings/); license GPL-2.0-or-later
- `library-backed` — [FLINT finite-field and modular arithmetic](https://flintlib.org/doc/)

### References

- The FLINT contributors, [FLINT: Fast Library for Number Theory](https://flintlib.org/).

## `Graph.add_clique`

```sage
add_clique(vertices: Any) -> None
```

Add a clique to the graph with the given vertices.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generic_graph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generic_graph.py`:19673](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L19673); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.add_cycle`

```sage
add_cycle(vertices: Any) -> None
```

Add a cycle to the graph with the given vertices.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generic_graph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generic_graph.py`:19771](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L19771); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.add_edge`

```sage
add_edge(*edge_data: Any) -> None
```

Add an edge from `u` to `v`.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generic_graph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generic_graph.py`:12608](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L12608); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.add_edges`

```sage
add_edges(edges: Any) -> None
```

Add edges from an iterable container.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generic_graph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generic_graph.py`:12671](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L12671); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.add_path`

```sage
add_path(vertices: Any) -> None
```

Add a path to the graph with the given vertices.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generic_graph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generic_graph.py`:19837](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L19837); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.add_vertex`

```sage
add_vertex(vertex: Any=None) -> Any
```

Create an isolated vertex.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generic_graph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generic_graph.py`:11647](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L11647); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.add_vertices`

```sage
add_vertices(vertices: Any) -> None
```

Add vertices to the (di)graph from an iterable container of vertices.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generic_graph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generic_graph.py`:11681](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L11681); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.adjacency_matrix`

```sage
adjacency_matrix(**_options: Any) -> Any
```

Return the adjacency matrix of the (di)graph.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generic_graph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generic_graph.py`:2269](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L2269); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.allows_loops`

```sage
allows_loops(value: Any=None) -> bool
```

Return whether loops are permitted in the (di)graph.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generic_graph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generic_graph.py`:3541](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L3541); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.allows_multiple_edges`

```sage
allows_multiple_edges(value: Any=None) -> bool
```

Return whether multiple edges are permitted in the (di)graph.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generic_graph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generic_graph.py`:3852](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L3852); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.automorphism_group`

```sage
automorphism_group(edge_labels: bool=False, **_options: Any) -> GraphAutomorphismGroup
```

Return the automorphism group of the graph.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generic_graph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generic_graph.py`:24638](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L24638); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.average_degree`

```sage
average_degree() -> float
```

Return the average degree of the graph.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generic_graph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generic_graph.py`:14052](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L14052); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.breadth_first_search`

```sage
breadth_first_search(start: Any, distance: Any=None, **_options: Any) -> Iterator[Any]
```

Return an iterator over the vertices in a breadth-first ordering.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generic_graph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generic_graph.py`:19274](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L19274); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.bridges`

```sage
bridges(labels: bool=True) -> list[Any]
```

Return the result of the Sage-compatible `bridges` graph operation.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sagejs-original` — Sage.js graph implementation; license GPL-3.0-only

## `Graph.canonical_label`

```sage
canonical_label(partition: Any=None, certificate: bool=False, edge_labels: bool=False, **_options: Any) -> Any
```

Return the canonical graph.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generic_graph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generic_graph.py`:25481](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L25481); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.cartesian_product`

```sage
cartesian_product(other: GenericGraph) -> GenericGraph
```

Return the Cartesian product of `self` and `other`.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generic_graph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generic_graph.py`:20251](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L20251); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.center`

```sage
center() -> list[Any]
```

Return the set of vertices in the center of the DiGraph.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.digraph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/digraph.py`:2710](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/digraph.py#L2710); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.chromatic_number`

```sage
chromatic_number(**options: Any) -> int
```

Return the minimal number of colors needed to color the vertices of the graph.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.graph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/graph.py`:3443](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/graph.py#L3443); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.clique_maximum`

```sage
clique_maximum(**_options: Any) -> list[Any]
```

Return the vertex set of a maximal order complete subgraph.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.graph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/graph.py`:6073](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/graph.py#L6073); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.clique_number`

```sage
clique_number(**_options: Any) -> int
```

Return the order of the largest clique of the graph.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.graph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/graph.py`:6158](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/graph.py#L6158); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.coloring`

```sage
coloring(hex_colors: bool=False, **_options: Any) -> Any
```

Return the first (optimal) proper vertex-coloring found.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.graph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/graph.py`:3588](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/graph.py#L3588); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.complement`

```sage
complement() -> GenericGraph
```

Return the complement of the (di)graph.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generic_graph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generic_graph.py`:19884](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L19884); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.components`

```sage
components(sort: bool=False) -> list[list[Any]]
```

Return the result of the Sage-compatible `components` graph operation.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sagejs-original` — Sage.js graph implementation; license GPL-3.0-only

## `Graph.connected_component_containing_vertex`

```sage
connected_component_containing_vertex(vertex: Any) -> list[Any]
```

Return the result of the Sage-compatible `connected_component_containing_vertex` graph operation.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sagejs-original` — Sage.js graph implementation; license GPL-3.0-only

## `Graph.connected_components`

```sage
connected_components(sort: bool=False) -> list[list[Any]]
```

Return the result of the Sage-compatible `connected_components` graph operation.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sagejs-original` — Sage.js graph implementation; license GPL-3.0-only

## `Graph.copy`

```sage
copy(immutable: bool=False) -> GenericGraph
```

Change the graph implementation.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generic_graph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generic_graph.py`:1294](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L1294); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.degree`

```sage
degree(vertex: Any=None) -> Any
```

Return the degree (in + out for digraphs) of a vertex or of vertices.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generic_graph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generic_graph.py`:13980](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L13980); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.degree_sequence`

```sage
degree_sequence() -> list[int]
```

Return the degree sequence of this (di)graph.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generic_graph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generic_graph.py`:14200](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L14200); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.delete_edge`

```sage
delete_edge(*edge_data: Any) -> None
```

Delete the edge from `u` to `v`.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generic_graph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generic_graph.py`:12910](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L12910); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.delete_edges`

```sage
delete_edges(edges: Any) -> None
```

Delete edges from an iterable container.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generic_graph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generic_graph.py`:12983](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L12983); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.delete_vertex`

```sage
delete_vertex(vertex: Any) -> None
```

Delete vertex, removing all incident edges.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generic_graph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generic_graph.py`:11719](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L11719); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.delete_vertices`

```sage
delete_vertices(vertices: Any) -> None
```

Delete vertices from the (di)graph taken from an iterable container of vertices.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generic_graph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generic_graph.py`:11796](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L11796); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.density`

```sage
density() -> float
```

Return the density of the (di)graph.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generic_graph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generic_graph.py`:4524](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L4524); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.depth_first_search`

```sage
depth_first_search(start: Any, **_options: Any) -> Iterator[Any]
```

Return an iterator over the vertices in a depth-first ordering.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generic_graph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generic_graph.py`:19499](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L19499); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.diameter`

```sage
diameter() -> Any
```

Return the diameter of the DiGraph.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.digraph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/digraph.py`:2542](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/digraph.py#L2542); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.distance`

```sage
distance(source_vertex: Any, target_vertex: Any, **_options: Any) -> Any
```

Return the (directed) distance from `u` to `v` in the (di)graph.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generic_graph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generic_graph.py`:16636](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L16636); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.distances_all_pairs`

```sage
distances_all_pairs() -> dict[Any, dict[Any, Any]]
```

Return the result of the Sage-compatible `distances_all_pairs` graph operation.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sagejs-original` — Sage.js graph implementation; license GPL-3.0-only

## `Graph.eccentricity`

```sage
eccentricity(vertex: Any=None) -> Any
```

Return the eccentricity of vertex (or vertices) `v`.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.digraph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/digraph.py`:2257](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/digraph.py#L2257); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.edge_iterator`

```sage
edge_iterator(labels: bool=True, sort: bool=False, **_options: Any) -> list[Any]
```

Return an iterator over edges.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generic_graph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generic_graph.py`:13669](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L13669); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.edge_label`

```sage
edge_label(source_vertex: Any, target_vertex: Any) -> Any
```

Return the label of an edge.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generic_graph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generic_graph.py`:13804](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L13804); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.edges`

```sage
edges(labels: bool=True, sort: bool=False, **_options: Any) -> list[Any]
```

Return a `~EdgesView` of edges.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generic_graph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generic_graph.py`:13388](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L13388); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.get_pos`

```sage
get_pos() -> Any
```

Return the position dictionary.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generic_graph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generic_graph.py`:4219](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L4219); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.girth`

```sage
girth() -> Any
```

Return the girth of the graph.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generic_graph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generic_graph.py`:16869](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L16869); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.graph_name`

```sage
graph_name(value: Any=None) -> str
```

Return the result of the Sage-compatible `graph_name` graph operation.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sagejs-original` — Sage.js graph implementation; license GPL-3.0-only

## `Graph.graph6_string`

```sage
graph6_string() -> str
```

Return the graph6 representation of the graph as an ASCII string.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.graph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/graph.py`:1365](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/graph.py#L1365); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.graphplot`

```sage
graphplot(**options: Any) -> GraphPlot
```

Return a `~sage.graphs.graph_plot.GraphPlot` object.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generic_graph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generic_graph.py`:22235](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L22235); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.has_edge`

```sage
has_edge(source_vertex: Any, target_vertex: Any, label: Any=...) -> bool
```

Check whether `(u, v)` is an edge of the (di)graph.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generic_graph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generic_graph.py`:13355](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L13355); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.has_loops`

```sage
has_loops() -> bool
```

Return whether there are loops in the (di)graph.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generic_graph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generic_graph.py`:3497](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L3497); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.has_vertex`

```sage
has_vertex(vertex: Any) -> bool
```

Check if `vertex` is one of the vertices of this graph.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generic_graph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generic_graph.py`:11850](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L11850); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.in_degree`

```sage
in_degree(vertex: Any=None) -> Any
```

Same as degree, but for in degree.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.digraph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/digraph.py`:1374](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/digraph.py#L1374); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.independent_set`

```sage
independent_set(**_options: Any) -> list[Any]
```

Return a maximum independent set.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.graph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/graph.py`:6455](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/graph.py#L6455); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.is_bipartite`

```sage
is_bipartite(certificate: bool=False) -> Any
```

Check whether the graph is bipartite.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generic_graph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generic_graph.py`:4565](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L4565); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.is_connected`

```sage
is_connected() -> bool
```

Return the result of the Sage-compatible `is_connected` graph operation.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sagejs-original` — Sage.js graph implementation; license GPL-3.0-only

## `Graph.is_directed`

```sage
is_directed() -> bool
```

Since digraph is directed, return `True`.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.digraph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/digraph.py`:985](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/digraph.py#L985); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.is_eulerian`

```sage
is_eulerian() -> bool
```

Check whether the graph is Eulerian.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generic_graph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generic_graph.py`:4687](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L4687); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.is_forest`

```sage
is_forest() -> bool
```

Test if the graph is a forest, i.e. a disjoint union of trees.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.graph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/graph.py`:1706](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/graph.py#L1706); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.is_isomorphic`

```sage
is_isomorphic(other: Any, certificate: bool=False, edge_labels: bool=False, **_options: Any) -> Any
```

Test for isomorphism between `self` and `other`.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generic_graph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generic_graph.py`:25152](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L25152); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.is_regular`

```sage
is_regular(degree: Any=None) -> bool
```

Check whether this graph is (`k`-)regular.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generic_graph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generic_graph.py`:14229](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L14229); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.is_tree`

```sage
is_tree() -> bool
```

Test if the graph is a tree.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.graph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/graph.py`:1546](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/graph.py#L1546); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.layout`

```sage
layout(layout: str | None=None, save_pos: bool=False, **_options: Any) -> dict[Any, Any]
```

Return a layout for the vertices of this graph.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generic_graph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generic_graph.py`:21227](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L21227); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.loop_edges`

```sage
loop_edges(labels: bool=True) -> list[Any]
```

Return a list of all loops in the (di)graph.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generic_graph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generic_graph.py`:3638](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L3638); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.max_degree`

```sage
max_degree() -> int
```

Return the result of the Sage-compatible `max_degree` graph operation.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sagejs-original` — Sage.js graph implementation; license GPL-3.0-only

## `Graph.maximum_clique`

```sage
maximum_clique(**_options: Any) -> list[Any]
```

Return the result of the Sage-compatible `maximum_clique` graph operation.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sagejs-original` — Sage.js graph implementation; license GPL-3.0-only

## `Graph.maximum_degree`

```sage
maximum_degree() -> int
```

Return the result of the Sage-compatible `maximum_degree` graph operation.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sagejs-original` — Sage.js graph implementation; license GPL-3.0-only

## `Graph.min_degree`

```sage
min_degree() -> int
```

Return the result of the Sage-compatible `min_degree` graph operation.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sagejs-original` — Sage.js graph implementation; license GPL-3.0-only

## `Graph.min_spanning_tree`

```sage
min_spanning_tree(starting_vertex: Any=None) -> GenericGraph
```

Return the edges of a minimum spanning tree.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generic_graph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generic_graph.py`:4996](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L4996); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.minimum_degree`

```sage
minimum_degree() -> int
```

Return the result of the Sage-compatible `minimum_degree` graph operation.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sagejs-original` — Sage.js graph implementation; license GPL-3.0-only

## `Graph.neighbor_iterator`

```sage
neighbor_iterator(vertex: Any) -> Iterator[Any]
```

Return an iterator over neighbors of `vertex`.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generic_graph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generic_graph.py`:12290](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L12290); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.neighbors`

```sage
neighbors(vertex: Any) -> list[Any]
```

Return a list of neighbors (in and out if directed) of `vertex`.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generic_graph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generic_graph.py`:12463](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L12463); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.neighbors_in`

```sage
neighbors_in(vertex: Any) -> list[Any]
```

Return the list of the in-neighbors of a given vertex.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.digraph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/digraph.py`:1304](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/digraph.py#L1304); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.neighbors_out`

```sage
neighbors_out(vertex: Any) -> list[Any]
```

Return the list of the out-neighbors of a given vertex.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.digraph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/digraph.py`:1358](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/digraph.py#L1358); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.num_edges`

```sage
num_edges() -> int
```

Return the result of the Sage-compatible `num_edges` graph operation.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sagejs-original` — Sage.js graph implementation; license GPL-3.0-only

## `Graph.num_verts`

```sage
num_verts() -> int
```

Return the result of the Sage-compatible `num_verts` graph operation.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sagejs-original` — Sage.js graph implementation; license GPL-3.0-only

## `Graph.order`

```sage
order() -> int
```

Return the number of vertices.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generic_graph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generic_graph.py`:4799](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L4799); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.out_degree`

```sage
out_degree(vertex: Any=None) -> Any
```

Same as degree, but for out degree.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.digraph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/digraph.py`:1445](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/digraph.py#L1445); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.plot`

```sage
plot(**options: Any) -> Any
```

Return a `~sage.plot.graphics.Graphics` object representing the (di)graph.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generic_graph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generic_graph.py`:22318](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L22318); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.radius`

```sage
radius() -> Any
```

Return the radius of the DiGraph.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.digraph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/digraph.py`:2474](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/digraph.py#L2474); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.relabel`

```sage
relabel(perm: Any=None, inplace: bool=True, **_options: Any) -> Any
```

Relabel the vertices of `self`.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generic_graph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generic_graph.py`:24111](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L24111); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.set_edge_label`

```sage
set_edge_label(source_vertex: Any, target_vertex: Any, label: Any) -> None
```

Set the edge label of a given edge.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generic_graph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generic_graph.py`:13260](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L13260); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.set_pos`

```sage
set_pos(pos: Any) -> None
```

Set the position dictionary.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generic_graph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generic_graph.py`:4340](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L4340); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.shortest_path`

```sage
shortest_path(u: Any, v: Any, **_options: Any) -> list[Any]
```

Return a list of vertices representing some shortest path from `u` to `v`.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generic_graph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generic_graph.py`:17687](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L17687); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.show`

```sage
show(**options: Any) -> Any
```

Show the (di)graph.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generic_graph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generic_graph.py`:22646](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L22646); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.size`

```sage
size() -> int
```

Return the number of edges.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generic_graph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generic_graph.py`:4827](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L4827); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.spanning_tree`

```sage
spanning_tree(starting_vertex: Any=None) -> GenericGraph
```

Return the result of the Sage-compatible `spanning_tree` graph operation.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sagejs-original` — Sage.js graph implementation; license GPL-3.0-only

## `Graph.sparse6_string`

```sage
sparse6_string() -> str
```

Return the sparse6 representation of the graph as an ASCII string.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.graph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/graph.py`:1403](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/graph.py#L1403); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.subgraph`

```sage
subgraph(vertices: Any=None, edges: Any=None, **_options: Any) -> GenericGraph
```

Return the subgraph containing the given vertices and edges.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generic_graph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generic_graph.py`:14273](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L14273); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.to_directed`

```sage
to_directed() -> DiGraph
```

Since the graph is already directed, simply returns a copy of itself.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.digraph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/digraph.py`:1083](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/digraph.py#L1083); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.to_undirected`

```sage
to_undirected() -> Graph
```

Return an undirected Graph (without bipartite constraint) of the given object.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.bipartite_graph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/bipartite_graph.py`:1660](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/bipartite_graph.py#L1660); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.vertex_cover`

```sage
vertex_cover(**_options: Any) -> list[Any]
```

Return a minimum vertex cover of `self` represented by a set of vertices.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.bipartite_graph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/bipartite_graph.py`:2556](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/bipartite_graph.py#L2556); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.vertex_iterator`

```sage
vertex_iterator(sort: bool=False, **_options: Any) -> list[Any]
```

Return an iterator over the given vertices.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generic_graph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generic_graph.py`:12213](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L12213); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.vertices`

```sage
vertices(sort: bool=False, **_options: Any) -> list[Any]
```

Return a list of the vertices.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generic_graph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generic_graph.py`:12361](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L12361); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `Graph.weighted`

```sage
weighted(value: Any=None) -> bool
```

Whether the (di)graph is to be considered as a weighted (di)graph.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generic_graph`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generic_graph.py`:4380](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generic_graph.py#L4380); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `GraphAutomorphism.dict`

```sage
dict() -> dict[Any, Any]
```

Return the vertex-image dictionary of this automorphism.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sagejs-original` — Sage.js graph implementation; license GPL-3.0-only

## `GraphAutomorphismGroup.cardinality`

```sage
cardinality() -> int
```

Return the number of orderings allowed by the structure.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.pq_trees`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/pq_trees.py`:746](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/pq_trees.py#L746); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `GraphAutomorphismGroup.gens`

```sage
gens() -> 'tuple[GraphAutomorphism, ...]'
```

Return compact generators of the graph automorphism group.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sagejs-original` — Sage.js graph implementation; license GPL-3.0-only

## `GraphAutomorphismGroup.list`

```sage
list() -> list[GraphAutomorphism]
```

Return the result of the Sage-compatible `list` graph operation.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sagejs-original` — Sage.js graph implementation; license GPL-3.0-only

## `GraphAutomorphismGroup.order`

```sage
order() -> int
```

Return the number of vertices of the graph.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generators.luw_graphs`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generators/luw_graphs.py`:218](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generators/luw_graphs.py#L218); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `GraphDatabase.close`

```sage
close() -> None
```

Return the result of the Sage-compatible `close` graph operation.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sagejs-original` — Sage.js graph implementation; license GPL-3.0-only

## `GraphDatabase.count`

```sage
count(**conditions: Any) -> int
```

Return the result of the Sage-compatible `count` graph operation.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sagejs-original` — Sage.js graph implementation; license GPL-3.0-only

## `GraphDatabase.graphs`

```sage
graphs(**conditions: Any) -> list[Graph]
```

Return the result of the Sage-compatible `graphs` graph operation.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sagejs-original` — Sage.js graph implementation; license GPL-3.0-only

## `GraphDatabase.query`

```sage
query(query_dict: Any=None, display_cols: Any=None, limit: int | None=None, **conditions: Any) -> GraphQuery
```

Create a GraphQuery on this database.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.graph_database`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/graph_database.py`:1020](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/graph_database.py#L1020); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `graphics_array`

```sage
graphics_array(graphics: Any, rows: Any=None, columns: Any=None) -> GraphicsArray
```

Arrange several two-dimensional graphics objects in a rectangular grid.

The input may already be a nested list of rows. For a flat list, specify
either `rows` or `columns`; omitting both creates one horizontal row.

### Examples

```sage
sage: G = graphics_array([plot(sin(x), (x, 0, 2*pi)), circle((0, 0), 1)])
sage: G.nrows(), G.ncols()
(1, 2)
```

### Metadata

- Kind: `function`
- Module: `sage.plot`
- Tags: graphics, plotting, 2D graphics, composition
- Backends: Plotly, Sage.js adaptive sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Sage-compatible semantic graphics with Plotly rendering

### Provenance

- `sage-derived` — [SageMath plotting API and object model](https://doc.sagemath.org/html/en/reference/plotting/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/)

### References

- [Plotly JavaScript Open Source Graphing Library](https://plotly.com/javascript/).

## `GraphPlot.plot`

```sage
plot() -> Any
```

Return a graphics object representing the (di)graph.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.graph_plot`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/graph_plot.py`:1147](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/graph_plot.py#L1147); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `GraphPlot.plotly`

```sage
plotly() -> Any
```

Return the Plotly figure representing this graph plot.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sagejs-original` — Sage.js graph implementation; license GPL-3.0-only

## `GraphPlot.show`

```sage
show(**options: Any) -> GraphPlot
```

Show the (di)graph associated with this `GraphPlot` object.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.graph_plot`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/graph_plot.py`:1109](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/graph_plot.py#L1109); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `GraphQuery.count`

```sage
count() -> int
```

Return the result of the Sage-compatible `count` graph operation.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sagejs-original` — Sage.js graph implementation; license GPL-3.0-only

## `GraphQuery.get_graphs_list`

```sage
get_graphs_list() -> list[Graph]
```

Return a list of Sage Graph objects that satisfy the query.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.graph_database`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/graph_database.py`:727](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/graph_database.py#L727); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `GraphQuery.list`

```sage
list() -> list[Graph]
```

Return the result of the Sage-compatible `list` graph operation.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sagejs-original` — Sage.js graph implementation; license GPL-3.0-only

## `GraphQuery.query_iterator`

```sage
query_iterator(immutable: Any=None) -> Iterator[Graph]
```

Return an iterator over the results list of the `~GraphQuery`.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.graph_database`
- Tags: graph theory, graphs
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/graph_database.py`:549](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/graph_database.py#L549); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `graphs.BullGraph`

```sage
BullGraph(immutable: bool=False) -> Graph
```

Return a bull graph with 5 nodes.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generators.basic`
- Tags: graph theory, generators
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generators/basic.py`:23](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generators/basic.py#L23); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `graphs.CompleteBipartiteGraph`

```sage
CompleteBipartiteGraph(left: int, right: int, set_position: bool=True, immutable: bool=False, name: str | None=None) -> Graph
```

Return a Complete Bipartite Graph on `p + q` vertices.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generators.basic`
- Tags: graph theory, generators
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generators/basic.py`:555](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generators/basic.py#L555); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `graphs.CompleteGraph`

```sage
CompleteGraph(order: int, immutable: bool=False) -> Graph
```

Return a complete graph on `n` nodes.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generators.basic`
- Tags: graph theory, generators
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generators/basic.py`:382](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generators/basic.py#L382); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `graphs.CycleGraph`

```sage
CycleGraph(order: int, immutable: bool=False) -> Graph
```

Return a cycle graph with `n` nodes.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generators.basic`
- Tags: graph theory, generators
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generators/basic.py`:282](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generators/basic.py#L282); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `graphs.DiamondGraph`

```sage
DiamondGraph(immutable: bool=False) -> Graph
```

Return a diamond graph with 4 nodes.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generators.basic`
- Tags: graph theory, generators
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generators/basic.py`:794](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generators/basic.py#L794); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `graphs.DodecahedralGraph`

```sage
DodecahedralGraph(immutable: bool=False) -> Graph
```

Return a Dodecahedral graph (with 20 nodes).

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generators.platonic_solids`
- Tags: graph theory, generators
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generators/platonic_solids.py`:237](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generators/platonic_solids.py#L237); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `graphs.EmptyGraph`

```sage
EmptyGraph(immutable: bool=False) -> Graph
```

Return an empty graph (0 nodes and 0 edges).

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generators.basic`
- Tags: graph theory, generators
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generators/basic.py`:933](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generators/basic.py#L933); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `graphs.GeneralizedPetersenGraph`

```sage
GeneralizedPetersenGraph(order: int, step: int, immutable: bool=False, name: str | None=None) -> Graph
```

Return a generalized Petersen graph with `2n` nodes. The variables `n`, `k` are integers such that `n>2` and `0<k\leq\lfloor(n-1)`/`2\rfloor`

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generators.families`
- Tags: graph theory, generators
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generators/families.py`:1697](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generators/families.py#L1697); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `graphs.Grid2dGraph`

```sage
Grid2dGraph(rows: int, columns: int, set_positions: bool=True, immutable: bool=False, name: str | None=None) -> Graph
```

Return a `2`-dimensional grid graph with `p \times q` nodes (`p` rows and `q` columns).

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generators.basic`
- Tags: graph theory, generators
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generators/basic.py`:1110](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generators/basic.py#L1110); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `graphs.HexahedralGraph`

```sage
HexahedralGraph(immutable: bool=False) -> Graph
```

Return a hexahedral graph (with 8 nodes).

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generators.platonic_solids`
- Tags: graph theory, generators
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generators/platonic_solids.py`:78](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generators/platonic_solids.py#L78); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `graphs.HouseGraph`

```sage
HouseGraph(immutable: bool=False) -> Graph
```

Return a house graph with 5 nodes.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generators.basic`
- Tags: graph theory, generators
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generators/basic.py`:1317](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generators/basic.py#L1317); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `graphs.IcosahedralGraph`

```sage
IcosahedralGraph(immutable: bool=False) -> Graph
```

Return an Icosahedral graph (with 12 nodes).

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generators.platonic_solids`
- Tags: graph theory, generators
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generators/platonic_solids.py`:185](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generators/platonic_solids.py#L185); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `graphs.OctahedralGraph`

```sage
OctahedralGraph(immutable: bool=False) -> Graph
```

Return an Octahedral graph (with 6 nodes).

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generators.platonic_solids`
- Tags: graph theory, generators
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generators/platonic_solids.py`:134](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generators/platonic_solids.py#L134); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `graphs.PathGraph`

```sage
PathGraph(order: int, pos: Any=None, immutable: bool=False, name: str | None=None) -> Graph
```

Return a path graph with `n` nodes.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generators.basic`
- Tags: graph theory, generators
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generators/basic.py`:1553](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generators/basic.py#L1553); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `graphs.PetersenGraph`

```sage
PetersenGraph(immutable: bool=False) -> Graph
```

Return the Petersen Graph.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generators.smallgraphs`
- Tags: graph theory, generators
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generators/smallgraphs.py`:4603](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generators/smallgraphs.py#L4603); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `graphs.RandomGNP`

```sage
RandomGNP(n: int, p: float, seed: Any=None, fast: bool=True, algorithm: str='Sage', immutable: bool=False) -> Graph
```

Return a random graph on `n` vertices.

Every possible edge is inserted independently with probability `p`.

### Input

- `n` -- nonnegative number of vertices
- `p` -- edge probability in the interval `[0, 1]`
- `seed` -- optional local random seed
- `fast` -- use the sparse `O(n+m)` Batagelj--Brandes algorithm
- `algorithm` -- `'Sage'` (or `'sage'`); `'networkx'` is
  accepted only when that optional Python package is available
- `immutable` -- request an immutable graph (currently accepted for
  Sage call compatibility; immutable graphs are not yet implemented)

### Examples

The endpoints `p=0` and `p=1` are deterministic:

```sage
    sage: graphs.RandomGNP(5, 0).size()
    0
    sage: graphs.RandomGNP(4, 1)
    Complete graph: Graph on 4 vertices
```

A seed makes a generated graph reproducible without changing the
process-wide Sage random state:

```sage
    sage: a = graphs.RandomGNP(12, .3, seed=7)
    sage: b = graphs.RandomGNP(12, .3, seed=7)
    sage: a.edges(sort=True, labels=False) == b.edges(sort=True, labels=False)
    True
```

Graph plots are ordinary composable graphics, as in Sage:

```sage
    sage: rows = [[graphs.RandomGNP(3+i+3*j, .43, seed=i+3*j).plot(
    ....:          vertex_size=10, vertex_labels=False) for i in range(3)]
    ....:         for j in range(3)]
    sage: graphics_array(rows)
    Graphics Array of size 3 x 3
```

This API and documentation are adapted from
`sage.graphs.generators.random.RandomGNP` (GPL-2.0-or-later).

### Metadata

- Kind: `method`
- Module: `sage.graphs.generators.random`
- Tags: graph theory, random graphs, Erdos-Renyi, generators
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The Sage algorithm is implemented, including sparse and quadratic paths. The optional networkx algorithm and immutable graph representation are not bundled.
- Algorithm: Batagelj--Brandes skip sampling or Bernoulli scan
- Limitations: algorithm='networkx' requires an external backend. immutable=True is accepted but does not yet freeze the graph.

### Provenance

- `sage-derived` — [SageMath RandomGNP API and documentation](https://doc.sagemath.org/html/en/reference/graphs/sage/graphs/generators/random.html); license GPL-2.0-or-later
- `literature-implemented` — Batagelj--Brandes sparse random graph algorithm

### References

- Vladimir Batagelj, Ulrik Brandes, [Efficient generation of large random networks](https://doi.org/10.1103/PhysRevE.71.036113) (2005).

## `graphs.StarGraph`

```sage
StarGraph(leaves: int, immutable: bool=False) -> Graph
```

Return a star graph with `n + 1` nodes.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generators.basic`
- Tags: graph theory, generators
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generators/basic.py`:1675](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generators/basic.py#L1675); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `graphs.TetrahedralGraph`

```sage
TetrahedralGraph(immutable: bool=False) -> Graph
```

Return a tetrahedral graph (with 4 nodes).

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generators.platonic_solids`
- Tags: graph theory, generators
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generators/platonic_solids.py`:21](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generators/platonic_solids.py#L21); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `graphs.WheelGraph`

```sage
WheelGraph(order: int, immutable: bool=False) -> Graph
```

Return a Wheel graph with `n` nodes.

### Sage.js status

This entry is implemented and exercised by the Sage.js graph semantic corpus. The executable examples below define the currently verified option surface.

### Metadata

- Kind: `method`
- Module: `sage.graphs.generators.families`
- Tags: graph theory, generators
- Backends: Sage.js graph algorithms
- Sage compatibility: partial — The documented executable surface is supported; some specialized Sage backends and optional keywords are not bundled.
- Limitations: Consult the verified examples for the currently tested option surface.

### Provenance

- `sage-derived` — [SageMath `src/sage/graphs/generators/families.py`:3651](https://github.com/sagemath/sage/blob/09472ff530d280d0c9f44fdc5a9c3e856ed95b37/src/sage/graphs/generators/families.py#L3651); revision 09472ff530d280d0c9f44fdc5a9c3e856ed95b37; license GPL-2.0-or-later

## `help`

```sage
help(item: Any=None) -> None
```

Print concise Python-style help derived from Sage.js metadata.

### Metadata

- Kind: `function`
- Module: `builtins`
- Tags: documentation, introspection
- Backends: Sage.js runtime
- Sage compatibility: compatible — Provides concise runtime help for installed APIs.

### Provenance

- `sagejs-original`

## `histogram`

```sage
histogram(datalist: Any, **options: Any) -> Graphics
```

Compute and draw a histogram of numerical data.

Common Sage options include `bins`, `range`, `density`, `cumulative`,
`color`, `edgecolor`, `alpha`, and `label`.

### Examples

```sage
sage: histogram([1, 1, 2, 3], bins=3)
Graphics object consisting of 1 graphics primitive
```

### Metadata

- Kind: `function`
- Module: `sage.plot`
- Tags: graphics, plotting, 2D graphics, statistics
- Backends: Plotly, Sage.js adaptive sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Sage-compatible semantic graphics with Plotly rendering

### Provenance

- `sage-derived` — [SageMath plotting API and object model](https://doc.sagemath.org/html/en/reference/plotting/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/)

### References

- [Plotly JavaScript Open Source Graphing Library](https://plotly.com/javascript/).

## `hue`

```sage
hue(value: Any, saturation: Any=1, brightness: Any=1) -> tuple[float, float, float]
```

Return an RGB triple from hue, saturation, and brightness.

### Metadata

- Kind: `function`
- Module: `sage.plot`
- Tags: graphics, plotting, 2D graphics, colors
- Backends: Plotly, Sage.js adaptive sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Sage-compatible semantic graphics with Plotly rendering

### Provenance

- `sage-derived` — [SageMath plotting API and object model](https://doc.sagemath.org/html/en/reference/plotting/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/)

### References

- [Plotly JavaScript Open Source Graphing Library](https://plotly.com/javascript/).

## `hyperbolic_arc`

```sage
hyperbolic_arc(a: Any, b: Any, model: str='UHP', **options: Any) -> Graphics
```

Plot the hyperbolic geodesic from `a` to `b`.

### Metadata

- Kind: `function`
- Module: `sage.plot`
- Tags: graphics, plotting, 2D graphics, hyperbolic geometry
- Backends: Plotly, Sage.js adaptive sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Sage-compatible semantic graphics with Plotly rendering

### Provenance

- `sage-derived` — [SageMath plotting API and object model](https://doc.sagemath.org/html/en/reference/plotting/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/)

### References

- [Plotly JavaScript Open Source Graphing Library](https://plotly.com/javascript/).

## `hyperbolic_polygon`

```sage
hyperbolic_polygon(points: Any, model: str='UHP', resolution: int=100, **options: Any) -> Graphics
```

Plot a polygon whose sides are hyperbolic geodesics.

### Metadata

- Kind: `function`
- Module: `sage.plot`
- Tags: graphics, plotting, 2D graphics, hyperbolic geometry
- Backends: Plotly, Sage.js adaptive sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Sage-compatible semantic graphics with Plotly rendering

### Provenance

- `sage-derived` — [SageMath plotting API and object model](https://doc.sagemath.org/html/en/reference/plotting/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/)

### References

- [Plotly JavaScript Open Source Graphing Library](https://plotly.com/javascript/).

## `hyperbolic_regular_polygon`

```sage
hyperbolic_regular_polygon(sides: int, i_angle: Any, center: Any=None, **options: Any) -> Graphics
```

Plot a regular hyperbolic polygon in the upper-half-plane model.

### Metadata

- Kind: `function`
- Module: `sage.plot`
- Tags: graphics, plotting, 2D graphics, hyperbolic geometry
- Backends: Plotly, Sage.js adaptive sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Sage-compatible semantic graphics with Plotly rendering

### Provenance

- `sage-derived` — [SageMath plotting API and object model](https://doc.sagemath.org/html/en/reference/plotting/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/)

### References

- [Plotly JavaScript Open Source Graphing Library](https://plotly.com/javascript/).

## `hyperbolic_triangle`

```sage
hyperbolic_triangle(a: Any, b: Any, c: Any, model: str='UHP', **options: Any) -> Graphics
```

Plot a hyperbolic triangle with vertices `a`, `b`, and `c`.

### Metadata

- Kind: `function`
- Module: `sage.plot`
- Tags: graphics, plotting, 2D graphics, hyperbolic geometry
- Backends: Plotly, Sage.js adaptive sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Sage-compatible semantic graphics with Plotly rendering

### Provenance

- `sage-derived` — [SageMath plotting API and object model](https://doc.sagemath.org/html/en/reference/plotting/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/)

### References

- [Plotly JavaScript Open Source Graphing Library](https://plotly.com/javascript/).

## `icosahedron`

```sage
icosahedron(center: Any=[0, 0, 0], size: Any=1, **options: Any) -> Graphics3d
```

Return a regular icosahedron centered at `center`.

### Metadata

- Kind: `function`
- Module: `sage.plot.plot3d`
- Tags: graphics, 3D graphics, shapes, platonic solids
- Backends: Plotly, Sage.js rectangular sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Semantic 3D primitives with Plotly rendering

### Provenance

- `sage-derived` — [SageMath 3D plotting API and object model](https://doc.sagemath.org/html/en/reference/plot3d/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/3d-charts/)

## `implicit_plot`

```sage
implicit_plot(function_value: Any, xrange: Any, yrange: Any, **options: Any) -> Graphics
```

Plot the plane curve where a function is zero or an equality holds.

### Metadata

- Kind: `function`
- Module: `sage.plot`
- Tags: graphics, plotting, 2D graphics, implicit curves
- Backends: Plotly, Sage.js adaptive sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Sage-compatible semantic graphics with Plotly rendering

### Provenance

- `sage-derived` — [SageMath plotting API and object model](https://doc.sagemath.org/html/en/reference/plotting/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/)

### References

- [Plotly JavaScript Open Source Graphing Library](https://plotly.com/javascript/).

## `implicit_plot3d`

```sage
implicit_plot3d(function_value: Any, xrange: Any, yrange: Any, zrange: Any, **options: Any) -> Graphics3d
```

Plot an implicit surface in three variables.

The first argument may be an expression interpreted as `f = 0` or a
symbolic equality, which is reduced to `left - right = 0`. Each range
has Sage form `(variable, minimum, maximum)` or a three-item list.

### Examples

```sage
sage: var('x,y,z')
(x, y, z)
sage: implicit_plot3d(x^2+y^2+z^2 == 1,
....:     (x,-2,2), (y,-2,2), (z,-2,2))
Graphics3d Object
```

The current renderer samples a deterministic rectangular grid and emits a
Plotly isosurface.  It does not yet implement Sage's adaptive marching
cubes refinements.

### Metadata

- Kind: `function`
- Module: `sage.plot.plot3d.implicit_plot3d`
- Tags: graphics, 3D graphics, implicit surfaces, symbolic equations
- Backends: Plotly, Sage.js rectangular sampler
- Sage compatibility: partial — Sage expressions, equalities, ranges, and common options are supported; adaptive meshing is not yet implemented.
- Algorithm: Rectangular scalar-field sampling and Plotly isosurface
- Limitations: Adaptive marching-cubes refinement is not implemented.

### Provenance

- `sage-derived` — [SageMath 3D plotting API](https://doc.sagemath.org/html/en/reference/plot3d/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js isosurface rendering](https://plotly.com/javascript/3d-isosurface-plots/)

### References

- [Plotly.js 3D Isosurface Plots](https://plotly.com/javascript/3d-isosurface-plots/).

## `IndexFaceSet`

```sage
IndexFaceSet(faces: Any, point_list: Any=None, enclosed: bool=False, texture_list: Any=None, **options: Any) -> None
```

A Sage-compatible indexed collection of polygonal faces.

Faces may be specified either by indices into `point_list` or directly as
lists of three-dimensional points.  The latter form automatically shares
equal vertices, matching Sage's constructor.

### Examples

```sage
sage: S = IndexFaceSet([[(1,0,0), (0,1,0), (0,0,1)]])
sage: S.index_faces()
[[0, 1, 2]]
sage: S.vertex_list()
[[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]
```

### Metadata

- Kind: `function`
- Module: `sage.plot.plot3d`
- Tags: graphics, 3D graphics, polygons, meshes, data structures
- Backends: Plotly, Sage.js rectangular sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Semantic 3D primitives with Plotly rendering

### Provenance

- `sage-derived` — [SageMath 3D plotting API and object model](https://doc.sagemath.org/html/en/reference/plot3d/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/3d-charts/)

## `is_prime`

```sage
is_prime(value: Any) -> _Bool
```

Return whether `value` is prime, using FLINT's primality test.

### Metadata

- Kind: `function`
- Module: `sage.arith.misc`
- Tags: arithmetic, primes, primality
- Backends: FLINT
- Sage compatibility: compatible — Matches the documented SageMath result for the supported integer inputs.
- Algorithm: FLINT primality testing

### Provenance

- `sage-derived` — [SageMath arithmetic API](https://doc.sagemath.org/html/en/reference/rings_standard/sage/arith/misc.html); license GPL-2.0-or-later
- `library-backed` — [FLINT](https://flintlib.org/doc/)

### References

- The FLINT contributors, [FLINT: Fast Library for Number Theory](https://flintlib.org/).

## `line`

```sage
line(points: Any, **options: Any) -> Graphics
```

Return a graphics object containing a line through `points`.

### Metadata

- Kind: `function`
- Module: `sage.plot`
- Tags: graphics, plotting, 2D graphics, lines
- Backends: Plotly, Sage.js adaptive sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Sage-compatible semantic graphics with Plotly rendering

### Provenance

- `sage-derived` — [SageMath plotting API and object model](https://doc.sagemath.org/html/en/reference/plotting/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/)

### References

- [Plotly JavaScript Open Source Graphing Library](https://plotly.com/javascript/).

## `line2d`

```sage
line(points: Any, **options: Any) -> Graphics
```

Return a graphics object containing a line through `points`.

### Metadata

- Kind: `function`
- Module: `sage.plot`
- Tags: graphics, plotting, 2D graphics, lines
- Backends: Plotly, Sage.js adaptive sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Sage-compatible semantic graphics with Plotly rendering

### Provenance

- `sage-derived` — [SageMath plotting API and object model](https://doc.sagemath.org/html/en/reference/plotting/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/)

### References

- [Plotly JavaScript Open Source Graphing Library](https://plotly.com/javascript/).

## `line3d`

```sage
line3d(points: Any, **options: Any) -> Graphics3d
```

Return a line through three-dimensional `points`.

### Metadata

- Kind: `function`
- Module: `sage.plot.plot3d`
- Tags: graphics, 3D graphics, lines
- Backends: Plotly, Sage.js rectangular sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Semantic 3D primitives with Plotly rendering

### Provenance

- `sage-derived` — [SageMath 3D plotting API and object model](https://doc.sagemath.org/html/en/reference/plot3d/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/3d-charts/)

## `list_plot`

```sage
list_plot(data: Any, plotjoined: bool=False, **options: Any) -> Graphics
```

Plot a sequence of y-values or a sequence of `(x, y)` pairs.

### Metadata

- Kind: `function`
- Module: `sage.plot`
- Tags: graphics, plotting, 2D graphics, data
- Backends: Plotly, Sage.js adaptive sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Sage-compatible semantic graphics with Plotly rendering

### Provenance

- `sage-derived` — [SageMath plotting API and object model](https://doc.sagemath.org/html/en/reference/plotting/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/)

### References

- [Plotly JavaScript Open Source Graphing Library](https://plotly.com/javascript/).

## `list_plot_loglog`

```sage
list_plot_loglog(data: Any, plotjoined: bool=False, **options: Any) -> Graphics
```

Plot list data with logarithmic horizontal and vertical axes.

### Metadata

- Kind: `function`
- Module: `sage.plot`
- Tags: graphics, plotting, 2D graphics, logarithmic axes
- Backends: Plotly, Sage.js adaptive sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Sage-compatible semantic graphics with Plotly rendering

### Provenance

- `sage-derived` — [SageMath plotting API and object model](https://doc.sagemath.org/html/en/reference/plotting/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/)

### References

- [Plotly JavaScript Open Source Graphing Library](https://plotly.com/javascript/).

## `list_plot_semilogx`

```sage
list_plot_semilogx(data: Any, plotjoined: bool=False, **options: Any) -> Graphics
```

Plot list data with a logarithmic horizontal axis.

### Metadata

- Kind: `function`
- Module: `sage.plot`
- Tags: graphics, plotting, 2D graphics, logarithmic axes
- Backends: Plotly, Sage.js adaptive sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Sage-compatible semantic graphics with Plotly rendering

### Provenance

- `sage-derived` — [SageMath plotting API and object model](https://doc.sagemath.org/html/en/reference/plotting/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/)

### References

- [Plotly JavaScript Open Source Graphing Library](https://plotly.com/javascript/).

## `list_plot_semilogy`

```sage
list_plot_semilogy(data: Any, plotjoined: bool=False, **options: Any) -> Graphics
```

Plot list data with a logarithmic vertical axis.

### Metadata

- Kind: `function`
- Module: `sage.plot`
- Tags: graphics, plotting, 2D graphics, logarithmic axes
- Backends: Plotly, Sage.js adaptive sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Sage-compatible semantic graphics with Plotly rendering

### Provenance

- `sage-derived` — [SageMath plotting API and object model](https://doc.sagemath.org/html/en/reference/plotting/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/)

### References

- [Plotly JavaScript Open Source Graphing Library](https://plotly.com/javascript/).

## `list_plot3d`

```sage
list_plot3d(values: Any, interpolation_type: str='default', point_list: Any=None, **options: Any) -> Graphics3d
```

Plot a matrix, rectangular array, or list of `(x, y, z)` samples.

Rectangular data preserves its exact grid.  Scattered samples use
Plotly's planar Delaunay triangulation; one or two samples become a point
or line exactly as in Sage.  The `default` and `linear` interpolation
modes are currently supported; higher-order Clough--Tocher and spline
interpolation report that they are not implemented instead of silently
returning a different surface.

### Metadata

- Kind: `function`
- Module: `sage.plot.plot3d`
- Tags: graphics, 3D graphics, surfaces, data plots, interpolation
- Backends: Plotly, Sage.js rectangular sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Semantic 3D primitives with Plotly rendering

### Provenance

- `sage-derived` — [SageMath 3D plotting API and object model](https://doc.sagemath.org/html/en/reference/plot3d/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/3d-charts/)

## `log2`

```sage
log2
```

The natural logarithm of `2`.

### Examples

```sage
sage: log2
log(2)
sage: float(log2)
0.6931471805599453
```

### Metadata

- Kind: `constant`
- Module: `sage.functions.constants`
- Tags: symbolic constants, logarithms
- Backends: Sage.js symbolic engine
- Sage compatibility: compatible — Sage.js displays this constant canonically as log(2).

### Provenance

- `sage-derived` — [SageMath symbolic constants API](https://doc.sagemath.org/html/en/reference/functions/sage/functions/constants.html); license GPL-2.0-or-later

## `ManinPresentation`

```sage
ManinPresentation(projective_line: P1List) -> None
```

A minimal weight-2 `Gamma_0(N)` modular-symbol presentation.

This is built natively from a connected well-formed fundamental domain.
Paired interior and boundary paths are eliminated structurally, leaving
the `E1` paths together with order-two and order-three stabilizer paths.

### Metadata

- Kind: `class`
- Module: `sage.modular.modsym.manin_symbol_list`
- Tags: number theory, modular symbols, fundamental domains, Manin relations
- Backends: Sage.js native C
- Sage compatibility: extension — This explicit presentation-inspection object is a Sage.js API; its weight-2 dimension agrees with SageMath.
- Algorithm: Connected Farey-triangle fundamental domain with structural elimination of F, E2, and T32 paths
- Limitations: The public object exposes presentation metadata; the retained paths and reductions are consumed internally by the exact Hecke engine. Boundary maps and explicit modular-symbol elements remain future work.

### Provenance

- `literature-implemented` — [Pollack and Stevens, Overconvergent modular symbols and p-adic L-functions](https://doi.org/10.24033/asens.2139)
- `software-derived` — [PARI/GP src/basemath/modsym.c](https://pari.math.u-bordeaux.fr/); revision 0f5a08ee7e; license GPL-2.0-or-later
- `sagejs-original` — Preallocated array-and-index fundamental-domain implementation

## `ManinRelations`

```sage
ManinRelations(projective_line: P1List, modulus: Any) -> None
```

Sparse weight-2 `Gamma_0(N)` Manin relations over `GF(p)`.

Rows use the two-term relations `x + S*x` and the three-term
relations `x + R*x + R^2*x`, stored in native compressed-row form.

### Metadata

- Kind: `class`
- Module: `sage.modular.modsym.manin_symbol_list`
- Tags: number theory, modular symbols, sparse matrices, finite fields
- Backends: Sage.js native CSR, Sage.js minimal Manin presentation, FLINT nmod_mat
- Sage compatibility: extension — This explicit relation-matrix object is a Sage.js API. Its quotient dimension agrees with weight-2 Gamma0 modular symbols away from bad reduction characteristics.
- Algorithm: Orbit representatives for x + S*x and x + R*x + R^2*x over a prime field, with rank and dimension obtained from a minimal fundamental-domain presentation in characteristic greater than 3
- Limitations: Characteristic 2 and 3 still use dense FLINT elimination below 20 million matrix cells. Boundary maps, cuspidal subspaces, Hecke actions, and rational lifting are not yet part of this object.

### Provenance

- `literature-implemented` — [William Stein, Modular Forms: A Computational Approach](https://wstein.org/books/modform/)
- `sagejs-original` — Pre-sized native compressed-row relation builder
- `software-derived` — [PARI/GP src/basemath/modsym.c](https://pari.math.u-bordeaux.fr/); revision 0f5a08ee7e; license GPL-2.0-or-later

### References

- William Stein, [Modular Forms: A Computational Approach](https://wstein.org/books/modform/) (2007).

## `matrix`

```sage
matrix(*args: Any) -> Matrix
```

Construct a dense matrix, optionally over an explicit base ring.

Sage's common row-list, flat-list, dimension, and entry-function forms are
supported. Exact matrices use FLINT on native hosts; `RDF`/`CDF` and
arbitrary-precision real/complex matrices use FLINT, Arb, and ACB.

### Examples

```sage
sage: A = matrix(ZZ, 2, [1, 2, 3, 4])
sage: A.det()
-2
sage: A.rref()
[1 0]
[0 1]
```

### Metadata

- Kind: `function`
- Module: `sage.matrix.constructor`
- Tags: linear algebra, matrices, construction, exact arithmetic, numerical linear algebra
- Backends: FLINT, Arb, ACB
- Sage compatibility: partial — Common dense constructors and implemented matrix methods are Sage-compatible; sparse matrices are not yet available.
- Algorithm: Native FLINT dense matrices, including Arb/ACB approximate arithmetic
- Limitations: Sparse matrix construction is not implemented.

### Provenance

- `sage-derived` — [SageMath matrix API](https://doc.sagemath.org/html/en/reference/matrices/); license GPL-2.0-or-later
- `library-backed` — [FLINT, Arb, and ACB](https://flintlib.org/doc/)

### References

- The FLINT contributors, [FLINT: Fast Library for Number Theory](https://flintlib.org/).

## `matrix_plot`

```sage
matrix_plot(matrix_value: Any, xrange: Any=None, yrange: Any=None, **options: Any) -> Graphics
```

Plot a matrix or rectangular array as a color-valued grid.

### Metadata

- Kind: `function`
- Module: `sage.plot`
- Tags: graphics, plotting, 2D graphics, matrices
- Backends: Plotly, Sage.js adaptive sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Sage-compatible semantic graphics with Plotly rendering

### Provenance

- `sage-derived` — [SageMath plotting API and object model](https://doc.sagemath.org/html/en/reference/plotting/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/)

### References

- [Plotly JavaScript Open Source Graphing Library](https://plotly.com/javascript/).

## `MatrixGroup`

```sage
MatrixGroup(generators: Any) -> MatrixGroupParent
```

Construct the finite matrix group generated by square matrices.

```sage
sage: M = MatrixSpace(GF(7), 2)
sage: G = MatrixGroup([M([[1,0],[-1,1]]), M([[1,1],[0,1]])])
sage: G.order()
336
```

The current implementation enumerates finite groups and computes
conjugacy classes using the conjugation action of the generators.

### Metadata

- Kind: `function`
- Module: `sage.groups`
- Tags: group theory, finite groups, permutation groups, matrix groups
- Backends: FLINT matrices with Sage.js finite group closure
- Sage compatibility: partial — The guided-tour finite group operations are compatible; large groups need non-enumerative algorithms.
- Limitations: Generic permutation and matrix groups are explicitly enumerated and are therefore intended for small orders.

### Provenance

- `sage-derived` — [SageMath finite groups API](https://doc.sagemath.org/html/en/reference/groups/); license GPL-2.0-or-later

## `Mod`

```sage
Mod(value: Any, modulus: Any) -> IntegerModElement
```

Construct `value` in the ring of integers modulo `modulus`.

### Metadata

- Kind: `function`
- Module: `sage.rings.finite_rings.integer_mod`
- Tags: rings, finite fields, residue rings, modular arithmetic, element construction
- Backends: FLINT
- Sage compatibility: partial — The supported arithmetic is Sage-compatible; the current constructor requires modulus at least 2.
- Algorithm: FLINT finite-field and modular arithmetic
- Limitations: Moduli 0 and 1 are not currently constructed.

### Provenance

- `sage-derived` — [SageMath finite rings API](https://doc.sagemath.org/html/en/reference/finite_rings/); license GPL-2.0-or-later
- `library-backed` — [FLINT finite-field and modular arithmetic](https://flintlib.org/doc/)

### References

- The FLINT contributors, [FLINT: Fast Library for Number Theory](https://flintlib.org/).

## `ModularForms`

```sage
ModularForms(group: Any=1, weight: Any=2, base_ring: Any=None, use_cache: bool=True, prec: Any=6) -> ModularFormsSpace
```

Construct the implemented ambient space of modular forms.

`group` is a level or congruence subgroup, `weight` is nonnegative,
and `prec` controls the default displayed q-expansion precision.
Initial ambient spaces are exact over `QQ`.

### Examples

```sage
sage: M = ModularForms(Gamma0(11), 2)
sage: M.dimension()
2
sage: M.cuspidal_subspace().dimension()
1
```

This foundation currently provides exact dimensions, cusp/Eisenstein
subspaces, and Eisenstein q-expansions.  It is not yet SageMath's complete
Hecke-module implementation.

### Metadata

- Kind: `function`
- Module: `sage.modular.modform.constructor`
- Tags: modular forms, spaces, ambient spaces
- Backends: FLINT, Sage.js exact arithmetic
- Sage compatibility: partial — The supported exact space and q-expansion operations follow SageMath; Sage.js does not yet implement the complete Hecke-module surface.
- Algorithm: Exact dimension formulas and native Eisenstein coefficient generation
- Limitations: Only QQ is currently accepted as the ambient base ring. General Hecke operators and cusp-form bases are not implemented.

### Provenance

- `sage-derived` — [SageMath modular forms API](https://doc.sagemath.org/html/en/reference/modfrm/); license GPL-2.0-or-later
- `library-backed` — [FLINT exact arithmetic](https://flintlib.org/)
- `sagejs-original` — Lightweight parent-aware modular-form implementation

### References

- The FLINT contributors, [FLINT: Fast Library for Number Theory](https://flintlib.org/).

## `ModularSymbols`

```sage
ModularSymbols(group: Any=1, weight: Any=2, sign: Any=0, base_ring: Any=None) -> ModularSymbolsSpace
```

Construct a modular-symbol Hecke module.

Weight-2 full `Gamma_0(N)` spaces with sign zero provide exact matrices
for every Hecke operator `T_n`. Prime operators are assembled natively
from a minimal Manin presentation; general indices use multiplicativity
and the weight-2 prime-power recurrence. Higher even weights over `QQ`
use exact triple Manin symbols `(i,u,v)` and construct sign `0`, `+1`,
or `-1` directly; prime Hecke operators use Cremona--Heilbronn matrices
and composite indices use multiplicativity and prime-power recurrences.
Passing a Dirichlet character constructs the exact character quotient
over its cyclotomic value field. The native presentation incorporates
character normalization scalars, parity, sign relations, boundary maps,
and the nebentypus factor in the Hecke recurrence.

### Metadata

- Kind: `function`
- Module: `sage.modular.modsym.modsym`
- Tags: number theory, modular symbols, modular forms, Dirichlet characters, Hecke operators, q-expansions
- Backends: FLINT, FLINT generic-ring exact algebraic matrices, Sage.js portable C modular-symbol core, Sage.js native P1List and Manin presentation
- Sage compatibility: partial — Gamma0 spaces with trivial or Dirichlet character use exact Manin presentations in weights at least two. The native engine constructs all three signs, boundary and cuspidal spaces, diamond operators, and exact T_n matrices with the Sage-compatible nebentypus recurrence. Gamma1 and q-expansion coverage remains more selective.
- Limitations: The full star matrix of a sign-zero character space is not yet exposed; construct sign=1 or sign=-1 directly. Arbitrary rational-path elements with nonconstant coefficient polynomials are not yet exposed in character spaces. Large character value fields currently use general qqbar elimination and need a specialized cyclotomic-number-field performance path.

### Provenance

- `sage-derived` — [SageMath modular symbols API and guided tour](https://doc.sagemath.org/html/en/reference/modsym/); license GPL-2.0-or-later
- `software-derived` — Author-owned original Magma Geometry/ModSym implementation, especially core.m, boundary.m, and operators.m
- `software-derived` — [PARI/GP well-formed fundamental domain and path reduction strategy](https://pari.math.u-bordeaux.fr/); revision 0f5a08ee7e; license GPL-2.0-or-later
- `sagejs-original` — Portable preallocated C Hecke assembler, strict-Python Hecke algebra integration, and FLINT matrix boundary

## `ModularSymbolsSpace.boundary_map`

```sage
boundary_map() -> ModularSymbolsBoundaryMap
```

Return the exact map from modular symbols to cusp divisors.

Rows of the matrix are boundaries of the domain basis vectors. Its
kernel is the cuspidal submodule.

```sage
sage: M = ModularSymbols(11)
sage: M.boundary_map().matrix()
[ 1 -1]
[ 0  0]
[ 0  0]
```

### Metadata

- Kind: `method`
- Module: `sage.modular.modsym.space`
- Tags: number theory, modular symbols, boundary maps, cusps, exact linear algebra
- Backends: Sage.js portable C modular-symbol core, FLINT exact matrices
- Sage compatibility: compatible — The weight-2 Gamma0 API follows SageMath matrix and subspace conventions, including row-action operator matrices.
- Algorithm: Cremona Gamma0 cusp equivalence and endpoint divisors
- Limitations: This general native implementation currently covers weight 2, Gamma0, and trivial character.

### Provenance

- `sage-derived` — [SageMath modular-symbol API](https://doc.sagemath.org/html/en/reference/modsym/); license GPL-2.0-or-later
- `software-derived` — [PARI/GP src/basemath/modsym.c](https://pari.math.u-bordeaux.fr/); revision 0f5a08ee7e; license GPL-2.0-or-later
- `sagejs-original` — Portable preallocated coordinate and subspace adapter

### References

- William Stein, [Modular Forms: A Computational Approach](https://wstein.org/books/modform/).
- John Cremona, [Algorithms for Modular Elliptic Curves](https://johncremona.github.io/book/fulltext/).

## `ModularSymbolsSpace.cuspidal_submodule`

```sage
cuspidal_submodule() -> ModularSymbolsSpace
```

Return the exact kernel of the boundary map.

### Metadata

- Kind: `method`
- Module: `sage.modular.modsym.space`
- Tags: number theory, modular symbols, cuspidal subspaces, kernels, Hecke modules
- Backends: Sage.js portable C modular-symbol core, FLINT exact matrices
- Sage compatibility: compatible — The weight-2 Gamma0 API follows SageMath matrix and subspace conventions, including row-action operator matrices.
- Algorithm: Exact FLINT kernel of the boundary matrix
- Limitations: This general native implementation currently covers weight 2, Gamma0, and trivial character.

### Provenance

- `sage-derived` — [SageMath modular-symbol API](https://doc.sagemath.org/html/en/reference/modsym/); license GPL-2.0-or-later
- `software-derived` — [PARI/GP src/basemath/modsym.c](https://pari.math.u-bordeaux.fr/); revision 0f5a08ee7e; license GPL-2.0-or-later
- `sagejs-original` — Portable preallocated coordinate and subspace adapter

### References

- William Stein, [Modular Forms: A Computational Approach](https://wstein.org/books/modform/).
- John Cremona, [Algorithms for Modular Elliptic Curves](https://johncremona.github.io/book/fulltext/).

## `ModularSymbolsSpace.decomposition`

```sage
decomposition(bound: Any=None, anemic: bool=True, **_kwds: Any) -> list[ModularSymbolsSpace]
```

Decompose this space into simple modules for Hecke operators.

The implementation follows the standard modular-symbol algorithm:
factor characteristic polynomials of successive `T_p`, and split by
the left kernels of their irreducible factors.  A constituent whose
restricted characteristic polynomial is irreducible is certified
simple as a module for the commutative Hecke algebra.

With `anemic=False`, repeated anemic constituents are further split
by every bad-prime `U_p`. Diamond operators are already scalar on the
fixed-character spaces currently supported by the native engine, so
they require no additional kernels.

```sage
sage: M = ModularSymbols(389, 2, sign=1)
sage: [A.dimension() for A in M.decomposition()]
[1, 1, 2, 3, 6, 20]
```

Exact decomposition also works over cyclotomic character fields:

```sage
sage: G = DirichletGroup(37)
sage: M = ModularSymbols(G.0, 5)
sage: [A.dimension() for A in M.decomposition(bound=2)]
[1, 1, 24]
```

### Metadata

- Kind: `method`
- Module: `sage.modular.modsym.space`
- Tags: number theory, modular symbols, decomposition, simple factors, Hecke modules, newforms
- Backends: Sage.js portable C modular-symbol core, FLINT exact matrices, characteristic polynomials, rational factorization, and Trager number-field factorization, Completely split-prime cyclotomic kernels with exact CRT certificates
- Sage compatibility: compatible — Anemic decomposition by good Hecke operators follows SageMath. Passing anemic=False further refines repeated constituents by every bad-prime U_p; diamond operators are scalar on fixed-character spaces.
- Algorithm: Successive good-prime Hecke characteristic-polynomial factorization and exact factor kernels
- Limitations: Correctness is certified by irreducible restricted characteristic polynomials; unresolved repeated factors remain grouped if the requested bound is too small.

### Provenance

- `sage-derived` — [SageMath modular-symbol API](https://doc.sagemath.org/html/en/reference/modsym/); license GPL-2.0-or-later
- `software-derived` — [PARI/GP src/basemath/modsym.c](https://pari.math.u-bordeaux.fr/); revision 0f5a08ee7e; license GPL-2.0-or-later
- `sagejs-original` — Portable preallocated coordinate and subspace adapter

### References

- William Stein, [Modular Forms: A Computational Approach](https://wstein.org/books/modform/).
- John Cremona, [Algorithms for Modular Elliptic Curves](https://johncremona.github.io/book/fulltext/).

## `ModularSymbolsSpace.degeneracy_map`

```sage
degeneracy_map(codomain: Any, index: Any=1) -> ModularSymbolsDegeneracyMap
```

Return an exact level-lowering degeneracy map.

`codomain` may be a modular-symbol space or its level. The target
must divide this space's level; level-raising maps are not yet
implemented. The returned morphism exposes `matrix()`, `rank()`,
`kernel()`, `image()`, and evaluation on modular symbols.

```sage
sage: M = ModularSymbols(22, 2, sign=1)
sage: d = M.degeneracy_map(11, 1)
sage: (d.matrix().dimensions(), d.rank())
((5, 2), 2)
```

### Metadata

- Kind: `method`
- Module: `sage.modular.modsym.space`
- Tags: number theory, modular symbols, degeneracy maps, oldforms, Hecke modules, exact linear algebra
- Backends: Sage.js portable C modular-symbol core, FLINT exact matrices
- Sage compatibility: partial — Exact level-lowering Gamma0 maps over QQ follow SageMath in every weight at least two and all three signs. Level raising and explicit character-valued maps are not yet implemented.
- Algorithm: Native Merel-Heilbronn lowering followed by exact basis restriction
- Limitations: Level-raising and character-valued degeneracy maps are not yet exposed.

### Provenance

- `sage-derived` — [SageMath modular-symbol API](https://doc.sagemath.org/html/en/reference/modsym/); license GPL-2.0-or-later
- `software-derived` — [PARI/GP src/basemath/modsym.c](https://pari.math.u-bordeaux.fr/); revision 0f5a08ee7e; license GPL-2.0-or-later
- `sagejs-original` — Portable preallocated coordinate and subspace adapter

### References

- William Stein, [Modular Forms: A Computational Approach](https://wstein.org/books/modform/).
- John Cremona, [Algorithms for Modular Elliptic Curves](https://johncremona.github.io/book/fulltext/).

## `ModularSymbolsSpace.hecke_matrix`

```sage
hecke_matrix(index: Any) -> Any
```

Return the exact matrix of the Hecke operator `T_index`.

For a full weight-2 `Gamma_0(N)` space with sign zero, every positive
index is supported. Prime matrices are computed by the portable C
Manin-symbol engine. Composite indices use commuting prime factors,
`U_p` powers at bad primes, and
`T_(p^r) = T_p T_(p^(r-1)) - p T_(p^(r-2))` at good primes.

```sage
sage: M = ModularSymbols(1000, 2)
sage: M.hecke_matrix(6).trace()
60
```

### Metadata

- Kind: `method`
- Module: `sage.modular.modsym.space`
- Tags: number theory, modular symbols, Hecke operators, exact matrices
- Backends: Sage.js portable C modular-symbol core, FLINT integer and rational matrices
- Sage compatibility: compatible — Full weight-2 Gamma0 sign-zero spaces support exact T_n matrices for every positive index. Higher-weight Gamma0 spaces over QQ support all signs and exact T_n matrices.
- Algorithm: Native prime Hecke matrices, Cremona-Heilbronn representatives, multiplicativity, Up powers, and the weight-k good-prime recurrence
- Limitations: The native engine currently requires Gamma0 spaces with trivial character over QQ; ambient, cuspidal, and directly constructed signed restrictions are supported.

### Provenance

- `literature-implemented` — [William Stein, Modular Forms: A Computational Approach](https://wstein.org/books/modform/)
- `software-derived` — [PARI/GP src/basemath/modsym.c](https://pari.math.u-bordeaux.fr/); revision 0f5a08ee7e; license GPL-2.0-or-later

## `ModularSymbolsSpace.minus_submodule`

```sage
minus_submodule() -> ModularSymbolsSpace
```

Return the `-1` eigenspace of the star involution.

### Metadata

- Kind: `method`
- Module: `sage.modular.modsym.space`
- Tags: number theory, modular symbols, star eigenspaces, minus subspaces, exact linear algebra
- Backends: Sage.js portable C modular-symbol core, FLINT exact matrices
- Sage compatibility: compatible — The weight-2 Gamma0 API follows SageMath matrix and subspace conventions, including row-action operator matrices.
- Algorithm: Exact left kernel of star plus the identity
- Limitations: This general native implementation currently covers weight 2, Gamma0, and trivial character.

### Provenance

- `sage-derived` — [SageMath modular-symbol API](https://doc.sagemath.org/html/en/reference/modsym/); license GPL-2.0-or-later
- `software-derived` — [PARI/GP src/basemath/modsym.c](https://pari.math.u-bordeaux.fr/); revision 0f5a08ee7e; license GPL-2.0-or-later
- `sagejs-original` — Portable preallocated coordinate and subspace adapter

### References

- William Stein, [Modular Forms: A Computational Approach](https://wstein.org/books/modform/).
- John Cremona, [Algorithms for Modular Elliptic Curves](https://johncremona.github.io/book/fulltext/).

## `ModularSymbolsSpace.modular_symbol`

```sage
modular_symbol(start: Any, stop: Any) -> ModularSymbolElement
```

Construct the rational path `{start, stop}` as an exact element.

Endpoints are numerator/denominator pairs; `(1, 0)` denotes infinity.
Continued-fraction reduction happens in one native call.

### Metadata

- Kind: `method`
- Module: `sage.modular.modsym.space`
- Tags: number theory, modular symbols, elements, rational paths, continued fractions
- Backends: Sage.js portable C modular-symbol core, FLINT exact matrices
- Sage compatibility: compatible — The weight-2 Gamma0 API follows SageMath matrix and subspace conventions, including row-action operator matrices.
- Algorithm: Native continued-fraction reduction into the minimal E1 basis
- Limitations: This general native implementation currently covers weight 2, Gamma0, and trivial character.

### Provenance

- `sage-derived` — [SageMath modular-symbol API](https://doc.sagemath.org/html/en/reference/modsym/); license GPL-2.0-or-later
- `software-derived` — [PARI/GP src/basemath/modsym.c](https://pari.math.u-bordeaux.fr/); revision 0f5a08ee7e; license GPL-2.0-or-later
- `sagejs-original` — Portable preallocated coordinate and subspace adapter

### References

- William Stein, [Modular Forms: A Computational Approach](https://wstein.org/books/modform/).
- John Cremona, [Algorithms for Modular Elliptic Curves](https://johncremona.github.io/book/fulltext/).

## `ModularSymbolsSpace.new_submodule`

```sage
new_submodule(prime: Any=None) -> ModularSymbolsSpace
```

Return the new, or `p`-new, submodule of this space.

For trivial-character Gamma0 spaces over `QQ`, this computes the
intersection of the kernels of the two level-lowering degeneracy
maps to level `N/p`, for every prime `p` dividing `N`.  All maps are
assembled natively and horizontally joined before taking one exact
kernel, following the optimized Magma modular-symbols algorithm.

```sage
sage: M = ModularSymbols(1000, 2, sign=1)
sage: N = M.new_submodule()
sage: N.dimension()
24
sage: [A.dimension() for A in N.decomposition()]
[2, 2, 2, 2, 4, 4, 4, 4]
```

### Metadata

- Kind: `method`
- Module: `sage.modular.modsym.space`
- Tags: number theory, modular symbols, new subspaces, oldforms, Hecke modules, exact linear algebra
- Backends: Sage.js portable C modular-symbol core, FLINT exact matrices, native horizontal concatenation, and kernels
- Sage compatibility: partial — Gamma0 cuspidal new and individual p-new operations over QQ follow SageMath in every weight at least two and all three signs. Primitive nebentypus spaces, and p-new spaces where the character cannot descend, are recognized over their exact character fields. At composite trivial-character level, calling this on the full space returns its cuspidal new part. Degeneracy matrices for imprimitive characters that descend are not yet implemented.
- Algorithm: One exact kernel of horizontally joined level-lowering degeneracy matrices
- Limitations: Imprimitive character spaces still need cyclotomic degeneracy matrices when their character descends to a lower level.

### Provenance

- `sage-derived` — [SageMath modular-symbol API](https://doc.sagemath.org/html/en/reference/modsym/); license GPL-2.0-or-later
- `software-derived` — [PARI/GP src/basemath/modsym.c](https://pari.math.u-bordeaux.fr/); revision 0f5a08ee7e; license GPL-2.0-or-later
- `sagejs-original` — Portable preallocated coordinate and subspace adapter
- `sage-derived` — [SageMath degeneracy-lowering new-submodule algorithm](https://github.com/sagemath/sage/blob/develop/src/sage/modular/hecke/ambient_module.py); license GPL-2.0-or-later

### References

- William Stein, [Modular Forms: A Computational Approach](https://wstein.org/books/modform/).
- John Cremona, [Algorithms for Modular Elliptic Curves](https://johncremona.github.io/book/fulltext/).

## `ModularSymbolsSpace.plus_submodule`

```sage
plus_submodule() -> ModularSymbolsSpace
```

Return the `+1` eigenspace of the star involution.

### Metadata

- Kind: `method`
- Module: `sage.modular.modsym.space`
- Tags: number theory, modular symbols, star eigenspaces, plus subspaces, exact linear algebra
- Backends: Sage.js portable C modular-symbol core, FLINT exact matrices
- Sage compatibility: compatible — The weight-2 Gamma0 API follows SageMath matrix and subspace conventions, including row-action operator matrices.
- Algorithm: Exact left kernel of star minus the identity
- Limitations: This general native implementation currently covers weight 2, Gamma0, and trivial character.

### Provenance

- `sage-derived` — [SageMath modular-symbol API](https://doc.sagemath.org/html/en/reference/modsym/); license GPL-2.0-or-later
- `software-derived` — [PARI/GP src/basemath/modsym.c](https://pari.math.u-bordeaux.fr/); revision 0f5a08ee7e; license GPL-2.0-or-later
- `sagejs-original` — Portable preallocated coordinate and subspace adapter

### References

- William Stein, [Modular Forms: A Computational Approach](https://wstein.org/books/modform/).
- John Cremona, [Algorithms for Modular Elliptic Curves](https://johncremona.github.io/book/fulltext/).

## `ModularSymbolsSpace.star_involution`

```sage
star_involution() -> ModularSymbolsLinearOperator
```

Return complex conjugation on this modular-symbol space.

### Metadata

- Kind: `method`
- Module: `sage.modular.modsym.space`
- Tags: number theory, modular symbols, star involution, complex conjugation, exact matrices
- Backends: Sage.js portable C modular-symbol core, FLINT exact matrices
- Sage compatibility: compatible — The weight-2 Gamma0 API follows SageMath matrix and subspace conventions, including row-action operator matrices.
- Algorithm: Native endpoint negation and continued-fraction Manin reduction
- Limitations: This general native implementation currently covers weight 2, Gamma0, and trivial character.

### Provenance

- `sage-derived` — [SageMath modular-symbol API](https://doc.sagemath.org/html/en/reference/modsym/); license GPL-2.0-or-later
- `software-derived` — [PARI/GP src/basemath/modsym.c](https://pari.math.u-bordeaux.fr/); revision 0f5a08ee7e; license GPL-2.0-or-later
- `sagejs-original` — Portable preallocated coordinate and subspace adapter

### References

- William Stein, [Modular Forms: A Computational Approach](https://wstein.org/books/modform/).
- John Cremona, [Algorithms for Modular Elliptic Curves](https://johncremona.github.io/book/fulltext/).

## `multi_graphics`

```sage
multi_graphics(graphics_list: Any) -> MultiGraphics
```

Draw graphics at arbitrary positions on one common canvas.

Each entry is either a `Graphics` object at Sage's default full-canvas
position or `(graphic, (left, bottom, width, height))`, with coordinates
expressed as fractions of the canvas.

### Examples

```sage
sage: g1 = plot(sin(x), (x, -pi, pi))
sage: g2 = circle((0, 0), 1, color='red')
sage: multi_graphics([g1, (g2, (0.2, 0.55, 0.3, 0.3))])
Multigraphics with 2 elements
```

### Metadata

- Kind: `function`
- Module: `sage.plot`
- Tags: graphics, plotting, 2D graphics, composition, insets
- Backends: Plotly, Sage.js adaptive sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Sage-compatible semantic graphics with Plotly rendering

### Provenance

- `sage-derived` — [SageMath plotting API and object model](https://doc.sagemath.org/html/en/reference/plotting/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/)

### References

- [Plotly JavaScript Open Source Graphing Library](https://plotly.com/javascript/).

## `next_prime`

```sage
next_prime(value: Any) -> Any
```

Return the smallest prime strictly greater than `value` using FLINT.

### Metadata

- Kind: `function`
- Module: `sage.arith.misc`
- Tags: arithmetic, primes
- Backends: FLINT
- Sage compatibility: compatible — Matches the documented SageMath result for the supported integer inputs.
- Algorithm: FLINT next-prime search

### Provenance

- `sage-derived` — [SageMath arithmetic API](https://doc.sagemath.org/html/en/reference/rings_standard/sage/arith/misc.html); license GPL-2.0-or-later
- `library-backed` — [FLINT](https://flintlib.org/doc/)

### References

- The FLINT contributors, [FLINT: Fast Library for Number Theory](https://flintlib.org/).

## `NumberField`

```sage
NumberField(polynomial: Any, names: Any=None) -> NumberFieldParent
```

Construct the exact simple field `QQ[a]/(polynomial)`.

### Metadata

- Kind: `function`
- Module: `sage.rings.number_field.number_field`
- Tags: number theory, number fields, algebraic numbers, exact arithmetic
- Backends: Sage.js exact quotient arithmetic, FLINT polynomials
- Sage compatibility: partial — Simple fields over QQ have exact arithmetic and Sage-style generators, certified maximal orders, integral bases, field discriminants, and exact HNF ideal lattices. Galois groups are identified natively through degree four.
- Limitations: General unit groups, nonquadratic class groups, and Galois groups above degree four await further native number-field algorithms. Modified Round Four and OM/MaxMin currently have bounded domains. Unsupported local shapes use a certified exact fallback; arbitrary-size primes are never narrowed to a machine word.

### Provenance

- `sage-derived` — [SageMath number field API](https://doc.sagemath.org/html/en/reference/number_fields/); license GPL-2.0-or-later
- `library-backed` — [FLINT polynomial arithmetic](https://flintlib.org/doc/)
- `literature-implemented` — [Kappe--Warren criterion for quartic Galois groups](https://doi.org/10.1016/j.aim.2020.107282)
- `literature-implemented` — Zassenhaus round-two maximal-order algorithm via exact trace radicals and integral overorder enumeration
- `literature-implemented` — Buchmann--Lenstra composite-component cycles, Newton polygons, modified Round Four, and OM/MaxMin local bases

## `numerical_integral`

```sage
numerical_integral(function_value: Any, a: Any, b: Any=None, algorithm: str='qag', max_points: int=87, params: Any=None, eps_abs: float=0.000001, eps_rel: float=0.000001, rule: int=6) -> tuple[float, float]
```

Numerically integrate a real function and estimate absolute error.

The default adaptive implementation uses an embedded 10/21-point
Gauss-Kronrod pair and QUADPACK-style error rescaling.  Sage's `qag`,
`qags`, and non-adaptive `qng` algorithm names are accepted; `qags`
currently uses adaptive subdivision without epsilon extrapolation, and
every `rule` value uses the same 10/21-point embedded pair.

### Metadata

- Kind: `function`
- Module: `sage.symbolic`
- Tags: symbolic mathematics, calculus, integration, numerical
- Backends: Sage.js adaptive quadrature, Cortex Compute Engine symbolic compiler
- Sage compatibility: partial — Returns a real numerical integral and absolute-error estimate using adaptive Gauss-Kronrod quadrature.
- Algorithm: Adaptive embedded 10/21-point Gauss-Kronrod quadrature with QUADPACK-style error rescaling
- Limitations: `qags` uses adaptive subdivision without epsilon extrapolation. Rules 1 through 6 currently use the same 10/21-point pair.

### Provenance

- `sage-derived` — [SageMath numerical integration API](https://doc.sagemath.org/html/en/reference/calculus/); license GPL-2.0-or-later

## `octahedron`

```sage
octahedron(center: Any=[0, 0, 0], size: Any=1, **options: Any) -> Graphics3d
```

Return a regular octahedron centered at `center`.

### Metadata

- Kind: `function`
- Module: `sage.plot.plot3d`
- Tags: graphics, 3D graphics, shapes, platonic solids
- Backends: Plotly, Sage.js rectangular sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Semantic 3D primitives with Plotly rendering

### Provenance

- `sage-derived` — [SageMath 3D plotting API and object model](https://doc.sagemath.org/html/en/reference/plot3d/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/3d-charts/)

## `P1List`

```sage
P1List(level: Any) -> None
```

The projective line `P^1(Z/NZ)` with Sage-compatible representatives.

Representative storage and indexing are native. The constructor computes
the exact cardinality first, allocates once, fills the array, sorts it in
Sage order, and builds a fixed-size open-addressed index.

```sage
sage: P = P1List(12)
sage: len(P)
24
sage: P.normalize(7, 15)
(1, 9)
sage: P.apply_S(P.apply_S(10))
10
```

### Metadata

- Kind: `class`
- Module: `sage.modular.modsym.p1list`
- Tags: number theory, modular symbols, projective line, Manin relations
- Backends: Sage.js native C, FLINT nmod_mat
- Sage compatibility: compatible — Representative ordering, normalization, I, S, and the historical order-three T action agree with SageMath. apply_R and apply_translation are explicit extensions.
- Algorithm: Exact cardinality preallocation, canonical normalization, lexicographic representatives, open-addressed indexing, a preallocated Pollack--Stevens fundamental domain, and batched exact path reduction for weight-2 Hecke matrices
- Limitations: Levels are currently limited to signed 32-bit positive integers.

### Provenance

- `sage-derived` — [SageMath P1List implementation](https://github.com/sagemath/sage/blob/develop/src/sage/modular/modsym/p1list.pyx); license GPL-2.0-or-later
- `sagejs-original` — [William Stein JSage Zig P1List](https://github.com/sagemathinc/JSage/blob/2582234b6f76f8a5e1cecae319ae1a098d9b3c50/lib/src/modular/p1list.zig); revision 2582234b6f76f8a5e1cecae319ae1a098d9b3c50

## `P1List.hecke_matrix`

```sage
hecke_matrix(prime: Any) -> Any
```

Return the exact weight-2 `T_p` (or `U_p`) matrix in the native
minimal Manin basis.

The index must be prime. If it divides the level this constructs
`U_p`; otherwise it constructs `T_p`. Path reduction and matrix
assembly happen in one native batch, so matrix entries never cross
the JavaScript boundary individually.

```sage
sage: P1List(11).hecke_matrix(2)
[ 3  0  0]
[ 1 -2  0]
[ 1  0 -2]
```

### Metadata

- Kind: `method`
- Module: `sage.modular.modsym.p1list`
- Tags: number theory, modular symbols, Hecke operators, Manin symbols
- Backends: Sage.js portable C modular-symbol core, FLINT integer matrices
- Sage compatibility: extension — The matrix is expressed in Sage.js's minimal E1 Manin basis; traces and characteristic polynomials agree with SageMath and PARI.
- Algorithm: Pollack--Stevens fundamental domain, continued-fraction Manin reduction, and standard Tp/Up representatives
- Limitations: The low-level method accepts prime indices only. Use ModularSymbols(...).hecke_matrix(n) for composite indices.

### Provenance

- `software-derived` — [PARI/GP src/basemath/modsym.c](https://pari.math.u-bordeaux.fr/); revision 0f5a08ee7e; license GPL-2.0-or-later
- `sagejs-original` — Portable preallocated path reducer and batched row-major Hecke assembler

## `P1List.higher_weight_presentation`

```sage
higher_weight_presentation(weight: Any, sign: Any=0) -> Any
```

Return the exact triple-Manin-symbol presentation over `QQ`.

### Metadata

- Kind: `method`
- Module: `sage.modular.modsym.manin_symbol_list`
- Tags: number theory, modular symbols, higher weight, Manin symbols, exact linear algebra
- Backends: Sage.js native signed union-find, FLINT sparse rational matrices
- Sage compatibility: extension — Exposes the internal exact quotient and reduction matrix used by higher-weight Gamma0 modular symbols.
- Algorithm: Triple (i,u,v) generators; signed two-term union-find; binomial order-three relations; exact sparse FLINT RREF
- Limitations: Very large presentations need the planned fully sparse reduction-map representation to avoid dense output.

### Provenance

- `literature-implemented` — [William Stein, Computing with Modular Symbols](https://wstein.org/books/modform/modform/modular_symbols.html)
- `sage-derived` — [SageMath manin_symbol_list and relation_matrix](https://github.com/sagemath/sage/tree/develop/src/sage/modular/modsym); license GPL-2.0-or-later

## `parametric_plot`

```sage
parametric_plot(functions: Sequence[Any], *range_args: Any, **options: Any) -> Graphics
```

Plot a two-component parametric plane curve.

### Metadata

- Kind: `function`
- Module: `sage.plot`
- Tags: graphics, plotting, 2D graphics, parametric
- Backends: Plotly, Sage.js adaptive sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Sage-compatible semantic graphics with Plotly rendering

### Provenance

- `sage-derived` — [SageMath plotting API and object model](https://doc.sagemath.org/html/en/reference/plotting/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/)

### References

- [Plotly JavaScript Open Source Graphing Library](https://plotly.com/javascript/).

## `parametric_plot3d`

```sage
parametric_plot3d(functions: Sequence[Any], urange: Any, vrange: Any=None, plot_points: Any='automatic', **options: Any) -> Graphics3d
```

Plot a parametric space curve or parametric surface.

### Metadata

- Kind: `function`
- Module: `sage.plot.plot3d`
- Tags: graphics, 3D graphics, parametric plots
- Backends: Plotly, Sage.js rectangular sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Semantic 3D primitives with Plotly rendering

### Provenance

- `sage-derived` — [SageMath 3D plotting API and object model](https://doc.sagemath.org/html/en/reference/plot3d/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/3d-charts/)

## `PermutationGroup`

```sage
PermutationGroup(generators: Any) -> PermutationGroupParent
```

Construct the finite permutation group generated by cycle data.

```sage
sage: G = PermutationGroup(['(1,2,3)(4,5)', '(3,4)'])
sage: G.order()
120
sage: G.is_abelian()
False
```

Small groups are represented concretely by enumerating the closure of the
generators. Centers and derived subgroups are computed from those actual
elements.

### Metadata

- Kind: `function`
- Module: `sage.groups`
- Tags: group theory, finite groups, permutation groups, matrix groups
- Backends: Sage.js finite permutation closure
- Sage compatibility: partial — The guided-tour finite group operations are compatible; large groups need non-enumerative algorithms.
- Limitations: Generic permutation and matrix groups are explicitly enumerated and are therefore intended for small orders.

### Provenance

- `sage-derived` — [SageMath finite groups API](https://doc.sagemath.org/html/en/reference/groups/); license GPL-2.0-or-later

## `plot`

```sage
plot(funcs: Any, *range_args: Any, **options: Any) -> Any
```

Plot a callable, symbolic expression, or list of functions on an interval.

Both `plot(f, xmin, xmax)` and Sage's `plot(f, (x, xmin, xmax))`
forms are accepted. Adaptive sampling produces a semantic `Graphics`
object whose rich representation is portable Plotly data.

### Examples

```sage
sage: g = plot(sin(x), (x, 0, 2*pi), color='navy')
sage: len(g)
1
```

Use `show(g)` in a notebook for rich display, or `g.save(...)` on a
host with a supported Plotly export route.

### Metadata

- Kind: `function`
- Module: `sage.plot`
- Tags: graphics, plotting, 2D graphics, adaptive sampling
- Backends: Plotly, Sage.js adaptive sampler
- Sage compatibility: partial — Core Sage call forms and common options are supported; the complete Sage plotting option and primitive catalog is larger.
- Algorithm: Sage-compatible semantic graphics with Plotly rendering

### Provenance

- `sage-derived` — [SageMath plotting API and object model](https://doc.sagemath.org/html/en/reference/plotting/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/)

### References

- [Plotly JavaScript Open Source Graphing Library](https://plotly.com/javascript/).

## `plot_loglog`

```sage
plot_loglog(funcs: Any, *range_args: Any, **options: Any) -> Graphics
```

Plot functions with logarithmic horizontal and vertical axes.

### Metadata

- Kind: `function`
- Module: `sage.plot`
- Tags: graphics, plotting, 2D graphics, logarithmic axes
- Backends: Plotly, Sage.js adaptive sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Sage-compatible semantic graphics with Plotly rendering

### Provenance

- `sage-derived` — [SageMath plotting API and object model](https://doc.sagemath.org/html/en/reference/plotting/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/)

### References

- [Plotly JavaScript Open Source Graphing Library](https://plotly.com/javascript/).

## `plot_semilogx`

```sage
plot_semilogx(funcs: Any, *range_args: Any, **options: Any) -> Graphics
```

Plot functions with a logarithmic horizontal axis.

### Metadata

- Kind: `function`
- Module: `sage.plot`
- Tags: graphics, plotting, 2D graphics, logarithmic axes
- Backends: Plotly, Sage.js adaptive sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Sage-compatible semantic graphics with Plotly rendering

### Provenance

- `sage-derived` — [SageMath plotting API and object model](https://doc.sagemath.org/html/en/reference/plotting/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/)

### References

- [Plotly JavaScript Open Source Graphing Library](https://plotly.com/javascript/).

## `plot_semilogy`

```sage
plot_semilogy(funcs: Any, *range_args: Any, **options: Any) -> Graphics
```

Plot functions with a logarithmic vertical axis.

### Metadata

- Kind: `function`
- Module: `sage.plot`
- Tags: graphics, plotting, 2D graphics, logarithmic axes
- Backends: Plotly, Sage.js adaptive sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Sage-compatible semantic graphics with Plotly rendering

### Provenance

- `sage-derived` — [SageMath plotting API and object model](https://doc.sagemath.org/html/en/reference/plotting/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/)

### References

- [Plotly JavaScript Open Source Graphing Library](https://plotly.com/javascript/).

## `plot_slope_field`

```sage
plot_slope_field(function_value: Any, xrange: Any, yrange: Any, **options: Any) -> Graphics
```

Plot short normalized line segments with slope `function_value`.

### Metadata

- Kind: `function`
- Module: `sage.plot`
- Tags: graphics, plotting, 2D graphics, differential equations
- Backends: Plotly, Sage.js adaptive sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Sage-compatible semantic graphics with Plotly rendering

### Provenance

- `sage-derived` — [SageMath plotting API and object model](https://doc.sagemath.org/html/en/reference/plotting/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/)

### References

- [Plotly JavaScript Open Source Graphing Library](https://plotly.com/javascript/).

## `plot_step_function`

```sage
plot_step_function(values: Any, vertical_lines: bool=True, **options: Any) -> Graphics
```

Plot the step function defined by a sequence of `(x, y)` pairs.

### Metadata

- Kind: `function`
- Module: `sage.plot`
- Tags: graphics, plotting, 2D graphics, data
- Backends: Plotly, Sage.js adaptive sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Sage-compatible semantic graphics with Plotly rendering

### Provenance

- `sage-derived` — [SageMath plotting API and object model](https://doc.sagemath.org/html/en/reference/plotting/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/)

### References

- [Plotly JavaScript Open Source Graphing Library](https://plotly.com/javascript/).

## `plot_vector_field`

```sage
plot_vector_field(functions: Any, xrange: Any, yrange: Any, **options: Any) -> Graphics
```

Plot a two-dimensional vector field on a rectangular sample grid.

The two components may be symbolic expressions or callables.  Invalid
values are omitted, matching Sage's masked-vector behavior.

### Metadata

- Kind: `function`
- Module: `sage.plot`
- Tags: graphics, plotting, 2D graphics, vector fields
- Backends: Plotly, Sage.js adaptive sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Sage-compatible semantic graphics with Plotly rendering

### Provenance

- `sage-derived` — [SageMath plotting API and object model](https://doc.sagemath.org/html/en/reference/plotting/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/)

### References

- [Plotly JavaScript Open Source Graphing Library](https://plotly.com/javascript/).

## `plot_vector_field3d`

```sage
plot_vector_field3d(functions: Sequence[Any], xrange: Any, yrange: Any, zrange: Any, plot_points: Any=5, colors: Any='jet', center_arrows: bool=False, **options: Any) -> Graphics3d
```

Plot a sampled vector field in three-dimensional space.

Vectors are normalized by the largest sampled norm, as in Sage. A single
Plotly cone trace keeps even fairly dense fields responsive. Set
`center_arrows=True` to center each arrow at its sample point.

### Examples

```sage
sage: x, y, z = var('x y z')
sage: plot_vector_field3d((x*cos(z), -y*cos(z), sin(z)),
....:     (x,0,pi), (y,0,pi), (z,0,pi), plot_points=4)
Graphics3d Object
```

### Metadata

- Kind: `function`
- Module: `sage.plot.plot3d`
- Tags: graphics, 3D graphics, vector fields
- Backends: Plotly, Sage.js rectangular sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Semantic 3D primitives with Plotly rendering

### Provenance

- `sage-derived` — [SageMath 3D plotting API and object model](https://doc.sagemath.org/html/en/reference/plot3d/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/3d-charts/)

## `plot3d`

```sage
plot3d(func: Any, urange: Any, vrange: Any, adaptive: bool=False, transformation: Any=None, **options: Any) -> Graphics3d
```

Plot a function of two variables as a three-dimensional surface.

### Metadata

- Kind: `function`
- Module: `sage.plot.plot3d`
- Tags: graphics, 3D graphics, surfaces
- Backends: Plotly, Sage.js rectangular sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Semantic 3D primitives with Plotly rendering

### Provenance

- `sage-derived` — [SageMath 3D plotting API and object model](https://doc.sagemath.org/html/en/reference/plot3d/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/3d-charts/)

## `point`

```sage
point(points: Any, **options: Any) -> Graphics
```

Return a graphics object containing one or more points.

### Metadata

- Kind: `function`
- Module: `sage.plot`
- Tags: graphics, plotting, 2D graphics, points
- Backends: Plotly, Sage.js adaptive sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Sage-compatible semantic graphics with Plotly rendering

### Provenance

- `sage-derived` — [SageMath plotting API and object model](https://doc.sagemath.org/html/en/reference/plotting/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/)

### References

- [Plotly JavaScript Open Source Graphing Library](https://plotly.com/javascript/).

## `point2d`

```sage
point(points: Any, **options: Any) -> Graphics
```

Return a graphics object containing one or more points.

### Metadata

- Kind: `function`
- Module: `sage.plot`
- Tags: graphics, plotting, 2D graphics, points
- Backends: Plotly, Sage.js adaptive sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Sage-compatible semantic graphics with Plotly rendering

### Provenance

- `sage-derived` — [SageMath plotting API and object model](https://doc.sagemath.org/html/en/reference/plotting/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/)

### References

- [Plotly JavaScript Open Source Graphing Library](https://plotly.com/javascript/).

## `point3d`

```sage
point3d(points: Any, **options: Any) -> Graphics3d
```

Return one or more points in three-dimensional space.

### Metadata

- Kind: `function`
- Module: `sage.plot.plot3d`
- Tags: graphics, 3D graphics, points
- Backends: Plotly, Sage.js rectangular sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Semantic 3D primitives with Plotly rendering

### Provenance

- `sage-derived` — [SageMath 3D plotting API and object model](https://doc.sagemath.org/html/en/reference/plot3d/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/3d-charts/)

## `points`

```sage
point(points: Any, **options: Any) -> Graphics
```

Return a graphics object containing one or more points.

### Metadata

- Kind: `function`
- Module: `sage.plot`
- Tags: graphics, plotting, 2D graphics, points
- Backends: Plotly, Sage.js adaptive sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Sage-compatible semantic graphics with Plotly rendering

### Provenance

- `sage-derived` — [SageMath plotting API and object model](https://doc.sagemath.org/html/en/reference/plotting/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/)

### References

- [Plotly JavaScript Open Source Graphing Library](https://plotly.com/javascript/).

## `polar_plot`

```sage
polar_plot(funcs: Any, *range_args: Any, **options: Any) -> Graphics
```

Plot one or more functions in polar coordinates.

The input function gives the radius `r` as a function of angle `theta`.
All adaptive sampling and line options accepted by `plot` are supported.

### Metadata

- Kind: `function`
- Module: `sage.plot`
- Tags: graphics, plotting, 2D graphics, polar coordinates
- Backends: Plotly, Sage.js adaptive sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Sage-compatible semantic graphics with Plotly rendering

### Provenance

- `sage-derived` — [SageMath plotting API and object model](https://doc.sagemath.org/html/en/reference/plotting/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/)

### References

- [Plotly JavaScript Open Source Graphing Library](https://plotly.com/javascript/).

## `polygon`

```sage
polygon(points: Any, **options: Any) -> Graphics
```

Return a filled polygon through `points`.

### Metadata

- Kind: `function`
- Module: `sage.plot`
- Tags: graphics, plotting, 2D graphics, polygons
- Backends: Plotly, Sage.js adaptive sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Sage-compatible semantic graphics with Plotly rendering

### Provenance

- `sage-derived` — [SageMath plotting API and object model](https://doc.sagemath.org/html/en/reference/plotting/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/)

### References

- [Plotly JavaScript Open Source Graphing Library](https://plotly.com/javascript/).

## `polygon2d`

```sage
polygon(points: Any, **options: Any) -> Graphics
```

Return a filled polygon through `points`.

### Metadata

- Kind: `function`
- Module: `sage.plot`
- Tags: graphics, plotting, 2D graphics, polygons
- Backends: Plotly, Sage.js adaptive sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Sage-compatible semantic graphics with Plotly rendering

### Provenance

- `sage-derived` — [SageMath plotting API and object model](https://doc.sagemath.org/html/en/reference/plotting/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/)

### References

- [Plotly JavaScript Open Source Graphing Library](https://plotly.com/javascript/).

## `polygon3d`

```sage
polygon3d(points: Any, **options: Any) -> Graphics3d
```

Draw a single polygon with vertices in three-dimensional space.

### Metadata

- Kind: `function`
- Module: `sage.plot.plot3d`
- Tags: graphics, 3D graphics, polygons, meshes
- Backends: Plotly, Sage.js rectangular sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Semantic 3D primitives with Plotly rendering

### Provenance

- `sage-derived` — [SageMath 3D plotting API and object model](https://doc.sagemath.org/html/en/reference/plot3d/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/3d-charts/)

## `polygons3d`

```sage
polygons3d(faces: Any, points: Any, **options: Any) -> Graphics3d
```

Draw an indexed union of polygons in three-dimensional space.

### Metadata

- Kind: `function`
- Module: `sage.plot.plot3d`
- Tags: graphics, 3D graphics, polygons, meshes
- Backends: Plotly, Sage.js rectangular sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Semantic 3D primitives with Plotly rendering

### Provenance

- `sage-derived` — [SageMath 3D plotting API and object model](https://doc.sagemath.org/html/en/reference/plot3d/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/3d-charts/)

## `PolynomialRing`

```sage
PolynomialRing(base: sage.Parent, variable: Any=None, names: Any=None, sparse: bool=False, implementation: Any=None, order: str='degrevlex') -> Any
```

Construct a univariate or multivariate polynomial ring.

Coefficient rings currently include `ZZ`, `QQ`, prime and extension
finite fields, `Zmod(n)`, exact algebraic fields, and approximate real
fields. Exact integer, rational, and finite-field arithmetic is backed by
FLINT; algebraic and approximate coefficients use a small sparse layer.
A comma-separated name list constructs a multivariate ring.

### Examples

```sage
sage: R.<x> = QQ[]
sage: (x^4 - 1).factor()
(x + 1) * (x - 1) * (x^2 + 1)
sage: S.<x,y> = GF(4, 'a')[]
sage: (x + y)^3
x^3 + x^2*y + x*y^2 + y^3
```

Supported monomial orders are `lex`, `deglex`, and `degrevlex`.
The accepted keyword surface is intentionally smaller than SageMath's
full constructor while native implementations are selected automatically.

### Metadata

- Kind: `function`
- Module: `sage.rings.polynomial.polynomial_ring_constructor`
- Aliases: `polygen`
- Tags: rings, polynomials, multivariate polynomials, exact arithmetic, approximate arithmetic
- Backends: FLINT, Sage.js sparse polynomial layer
- Sage compatibility: partial — Core univariate and multivariate construction and arithmetic are compatible over exact and approximate real coefficient rings; SageMath exposes additional constructor implementations and coefficient rings.
- Algorithm: FLINT exact polynomial arithmetic with a sparse generic layer for approximate real coefficients
- Limitations: Only lex, deglex, and degrevlex monomial orders are currently accepted. Complete Gröbner-fan enumeration currently covers the twisted-cubic determinantal ideal; arbitrary fans require a general polyhedral fan backend.

### Provenance

- `sage-derived` — [SageMath polynomial ring API](https://doc.sagemath.org/html/en/reference/polynomial_rings/); license GPL-2.0-or-later
- `library-backed` — [FLINT polynomial arithmetic](https://flintlib.org/doc/)

### References

- The FLINT contributors, [FLINT: Fast Library for Number Theory](https://flintlib.org/).

## `prime_pi`

```sage
prime_pi(value: Any) -> Any
```

Return the number of primes less than or equal to `value`.

Results are exact.  Moderate bounds are served by an incremental prime
cache, while large isolated bounds use Lehmer's combinatorial algorithm.
As in Sage, inputs are limited to integers below `2^63`.

### Examples

```sage
sage: prime_pi(10)
4
sage: prime_pi(100)
25
sage: prime_pi(10^12)
37607912018
```

### Metadata

- Kind: `function`
- Module: `sage.arith.misc`
- Tags: arithmetic, primes, prime counting
- Backends: FLINT
- Sage compatibility: compatible — Matches the documented SageMath result for the supported integer inputs.
- Algorithm: Lehmer prime counting with incremental enumeration for small bounds
- Limitations: Like Sage primecountpy, inputs at or above 2^63 are not supported.

### Provenance

- `sage-derived` — [SageMath arithmetic API](https://doc.sagemath.org/html/en/reference/rings_standard/sage/arith/misc.html); license GPL-2.0-or-later
- `library-backed` — [FLINT](https://flintlib.org/doc/)

### References

- The FLINT contributors, [FLINT: Fast Library for Number Theory](https://flintlib.org/).

## `prime_range`

```sage
prime_range(start: Any, stop: Any=None) -> Any
```

Return the primes in the half-open interval `[start, stop)`.

With one argument, return the primes from 2 up to (but not including)
`start`.

### Examples

```sage
sage: prime_range(10)
[2, 3, 5, 7]
sage: prime_range(10, 20)
[11, 13, 17, 19]
```

### Metadata

- Kind: `function`
- Module: `sage.arith.misc`
- Tags: arithmetic, primes, enumeration
- Backends: FLINT
- Sage compatibility: compatible — Matches the documented SageMath result for the supported integer inputs.
- Algorithm: Repeated FLINT next-prime search

### Provenance

- `sage-derived` — [SageMath arithmetic API](https://doc.sagemath.org/html/en/reference/rings_standard/sage/arith/misc.html); license GPL-2.0-or-later
- `library-backed` — [FLINT](https://flintlib.org/doc/)

### References

- The FLINT contributors, [FLINT: Fast Library for Number Theory](https://flintlib.org/).

## `Qp`

```sage
Qp(prime: Any, prec: Any=20) -> PAdicParent
```

Construct a capped-relative p-adic field.

### Metadata

- Kind: `function`
- Module: `sage.rings.padics.factory`
- Aliases: `Zp`
- Tags: number theory, p-adic fields, p-adic rings
- Backends: Sage.js exact rational expansion
- Sage compatibility: partial — Capped-relative parents and exact rational expansions are compatible; analytic and extension-field operations are not yet implemented.
- Algorithm: modular inversion followed by base-p digit extraction
- Limitations: Only exact rational elements are currently supported.

### Provenance

- `sage-derived` — [SageMath p-adic factory API](https://doc.sagemath.org/html/en/reference/padics/); license GPL-2.0-or-later

## `QuadraticField`

```sage
QuadraticField(radicand: Any, names: Any=None) -> QuadraticField_class
```

Construct an exact imaginary quadratic field.

Negative radicands support exact field arithmetic, the maximal order,
integral bases, discriminants, and finite ideal class groups.

### Examples

```sage
sage: K.<a> = QuadraticField(-23)
sage: K.discriminant()
-23
sage: K.class_group().invariants()
(3,)
```

### Metadata

- Kind: `function`
- Module: `sage.rings.number_field.number_field`
- Tags: number theory, quadratic fields, rings of integers, ideal class groups, binary quadratic forms
- Backends: Sage.js exact quadratic arithmetic, FLINT qfb reduced-form sieve and NUCOMP arithmetic
- Sage compatibility: partial — Negative radicands have exact arithmetic, maximal orders, integral bases, field discriminants, class numbers, and composable finite class groups with Sage-ordered invariant factors.
- Limitations: Real quadratic fields and their unit/regulator algorithms are not yet implemented by QuadraticField. Certified class numbers currently enumerate every reduced form using FLINT's modular-root sieve, so very large discriminants still need a non-enumerating or subexponential backend.

### Provenance

- `sage-derived` — [SageMath quadratic number-field and class-group API](https://doc.sagemath.org/html/en/reference/number_fields/); license GPL-2.0-or-later
- `literature-implemented` — Gauss reduction and ideal-lattice composition of positive-definite binary quadratic forms
- `library-backed` — [FLINT binary quadratic forms](https://flintlib.org/doc/qfb.html)

## `quit`

```sage
quit(code: Any=None) -> None
```

Exit the current Sage.js or Python session.

`quit()` exits successfully. An integer argument becomes the process exit
status, matching Python's interactive convenience function.

### Metadata

- Kind: `function`
- Module: `builtins`
- Tags: runtime, interactive, process
- Backends: Sage.js runtime
- Sage compatibility: compatible — Raises SystemExit with the optional supplied status.

### Provenance

- `software-derived` — [Python site.Quitter interactive API](https://docs.python.org/3/library/constants.html); license PSF-2.0

## `rainbow`

```sage
rainbow(count: int, format: str='hex') -> list[Any]
```

Return `count` evenly spaced hues as hex strings or RGB tuples.

### Metadata

- Kind: `function`
- Module: `sage.plot`
- Tags: graphics, plotting, 2D graphics, colors
- Backends: Plotly, Sage.js adaptive sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Sage-compatible semantic graphics with Plotly rendering

### Provenance

- `sage-derived` — [SageMath plotting API and object model](https://doc.sagemath.org/html/en/reference/plotting/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/)

### References

- [Plotly JavaScript Open Source Graphing Library](https://plotly.com/javascript/).

## `random_matrix`

```sage
random_matrix(base: sage.Parent, nrows: int, ncols: Any=None, algorithm: str='randomize', implementation: Any=None, *args: Any, **kwds: Any) -> Matrix
```

Construct a random dense matrix over `base`.

The dimensions are `nrows` by `ncols`; omitting `ncols` constructs
a square matrix. The common Sage keywords `density`, `x`, `y`, and
`distribution='uniform'` are supported where meaningful. Full-density
matrices over `QQ` use FLINT's two-bit rational distribution and are
constructed directly in their owned FLINT resource. This intentionally
differs from SageMath's bounded default rational distribution.

### Examples

```sage
sage: A = random_matrix(ZZ, 3, 5, x=-10, y=11)
sage: A.nrows(), A.ncols(), A.base_ring()
(3, 5, Integer Ring)
sage: random_matrix(GF(9, 'a'), 2).base_ring() is GF(9, 'a')
True
```

Sparse matrices and alternate construction algorithms are not yet
implemented.

### Metadata

- Kind: `function`
- Module: `sage.matrix.constructor`
- Tags: linear algebra, matrices, random generation, benchmarking
- Backends: FLINT, Arb, ACB
- Sage compatibility: partial — The randomize algorithm and common density/range options are compatible; specialized SageMath algorithms are not available.
- Algorithm: Native FLINT dense matrices, including Arb/ACB approximate arithmetic
- Limitations: Only algorithm=randomize is supported. Sparse output is not implemented.

### Provenance

- `sage-derived` — [SageMath matrix API](https://doc.sagemath.org/html/en/reference/matrices/); license GPL-2.0-or-later
- `library-backed` — [FLINT, Arb, and ACB](https://flintlib.org/doc/)

### References

- The FLINT contributors, [FLINT: Fast Library for Number Theory](https://flintlib.org/).

## `region_plot`

```sage
region_plot(functions: Any, xrange: Any, yrange: Any, **options: Any) -> Graphics
```

Plot the region where one or more boolean functions are true.

### Metadata

- Kind: `function`
- Module: `sage.plot`
- Tags: graphics, plotting, 2D graphics, regions
- Backends: Plotly, Sage.js adaptive sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Sage-compatible semantic graphics with Plotly rendering

### Provenance

- `sage-derived` — [SageMath plotting API and object model](https://doc.sagemath.org/html/en/reference/plotting/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/)

### References

- [Plotly JavaScript Open Source Graphing Library](https://plotly.com/javascript/).

## `revolution_plot3d`

```sage
revolution_plot3d(curve: Any, trange: Any, phirange: Any=None, parallel_axis: str='z', axis: Any=None, print_vector: bool=False, show_curve: bool=False, **options: Any) -> Graphics3d
```

Revolve a function or parametric curve around a coordinate axis.

### Metadata

- Kind: `function`
- Module: `sage.plot.plot3d`
- Tags: graphics, 3D graphics, surfaces, surfaces of revolution
- Backends: Plotly, Sage.js rectangular sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Semantic 3D primitives with Plotly rendering

### Provenance

- `sage-derived` — [SageMath 3D plotting API and object model](https://doc.sagemath.org/html/en/reference/plot3d/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/3d-charts/)

## `rgbcolor`

```sage
rgbcolor(value: Any, space: str='rgb') -> tuple[float, float, float]
```

Convert a Sage color specification to an RGB triple.

### Metadata

- Kind: `function`
- Module: `sage.plot`
- Tags: graphics, plotting, 2D graphics, colors
- Backends: Plotly, Sage.js adaptive sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Sage-compatible semantic graphics with Plotly rendering

### Provenance

- `sage-derived` — [SageMath plotting API and object model](https://doc.sagemath.org/html/en/reference/plotting/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/)

### References

- [Plotly JavaScript Open Source Graphing Library](https://plotly.com/javascript/).

## `ruler`

```sage
ruler(start: Any, end: Any, ticks: int=4, sub_ticks: int=4, absolute: bool=False, snap: bool=False, **options: Any) -> Graphics3d
```

Draw a three-dimensional ruler with labeled major and minor ticks.

### Metadata

- Kind: `function`
- Module: `sage.plot.plot3d`
- Tags: graphics, 3D graphics, frames, rulers
- Backends: Plotly, Sage.js rectangular sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Semantic 3D primitives with Plotly rendering

### Provenance

- `sage-derived` — [SageMath 3D plotting API and object model](https://doc.sagemath.org/html/en/reference/plot3d/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/3d-charts/)

## `ruler_frame`

```sage
ruler_frame(lower_left: Any, upper_right: Any, ticks: int=4, sub_ticks: int=4, **options: Any) -> Graphics3d
```

Draw three axis-aligned rulers from the lower frame corner.

### Metadata

- Kind: `function`
- Module: `sage.plot.plot3d`
- Tags: graphics, 3D graphics, frames, rulers
- Backends: Plotly, Sage.js rectangular sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Semantic 3D primitives with Plotly rendering

### Provenance

- `sage-derived` — [SageMath 3D plotting API and object model](https://doc.sagemath.org/html/en/reference/plot3d/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/3d-charts/)

## `scatter_plot`

```sage
scatter_plot(datalist: Any, **options: Any) -> Graphics
```

Return a Sage-compatible scatter plot of `(x, y)` points.

### Metadata

- Kind: `function`
- Module: `sage.plot`
- Tags: graphics, plotting, 2D graphics, statistics
- Backends: Plotly, Sage.js adaptive sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Sage-compatible semantic graphics with Plotly rendering

### Provenance

- `sage-derived` — [SageMath plotting API and object model](https://doc.sagemath.org/html/en/reference/plotting/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/)

### References

- [Plotly JavaScript Open Source Graphing Library](https://plotly.com/javascript/).

## `search_doc`

```sage
search_doc(query: Any) -> None
```

Search the docstrings of public objects loaded into Sage.js.

The search is a case-insensitive literal match over public names and
runtime docstrings.  Results include top-level functions and classes as
well as documented methods of loaded Python classes.

### Examples

```sage
sage: search_doc('q-expansion')
Search results for 'q-expansion':
    EisensteinSeriesElement.q_expansion -- Return the ...
```

This intentionally searches the locally installed Sage.js API.  It does
not imply that every object documented by the full SageMath manual is
implemented.

### Metadata

- Kind: `function`
- Module: `builtins`
- Tags: documentation, search, introspection
- Backends: Sage.js runtime
- Sage compatibility: compatible — Searches the installed Sage.js corpus only.

### Provenance

- `sagejs-original`

## `show`

```sage
show(value: Any, *others: Any, **options: Any) -> Any
```

Return `value` for rich display, combining graphics when requested.

Multiple graphics are added before display.  Notebook kernels render the
returned semantic object using Plotly-compatible HTML/data, without
requiring a Jupyter extension.

### Metadata

- Kind: `function`
- Module: `sage.plot`
- Tags: graphics, plotting, rich display, Jupyter
- Backends: Plotly, Sage.js adaptive sampler
- Sage compatibility: partial — Sage-style graphics composition is supported; display routing uses portable Plotly MIME/HTML rather than a Sage frontend.
- Algorithm: Sage-compatible semantic graphics with Plotly rendering

### Provenance

- `sage-derived` — [SageMath plotting API and object model](https://doc.sagemath.org/html/en/reference/plotting/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/)

### References

- [Plotly JavaScript Open Source Graphing Library](https://plotly.com/javascript/).

## `solve`

```sage
solve(equations: Any, *variables: Any, **options: Any) -> Any
```

Solve supported elementary symbolic equations.

One equation or a list of equations may be supplied, followed by one or
more variables. Set `solution_dict=True` for dictionary-valued
solutions.

### Examples

```sage
sage: solve(x^2 == 4, x)
[x == -2, x == 2]
```

Sage.js delegates elementary solving to Cortex Compute Engine and applies
a few exact Sage-compatible reductions.  If the backend cannot solve an
equation, Sage.js returns an equivalent unsolved relation instead of the
mathematically misleading empty list.  Coupled nonlinear systems and many
transcendental families remain outside the current supported surface.

### Metadata

- Kind: `function`
- Module: `sage.symbolic`
- Tags: symbolic mathematics, equations, solving
- Backends: Cortex Compute Engine
- Sage compatibility: partial — Supported elementary equations follow Sage-style output; unsupported families are returned as unsolved relations.
- Algorithm: MathJSON adapter over Cortex Compute Engine
- Limitations: Coupled nonlinear systems are not generally implemented. Many transcendental solution families are not implemented.

### Provenance

- `sage-derived` — [SageMath symbolic API](https://doc.sagemath.org/html/en/reference/calculus/); license GPL-2.0-or-later
- `library-backed` — [Cortex Compute Engine](https://cortexjs.io/compute-engine/)

### References

- [Cortex Compute Engine](https://cortexjs.io/compute-engine/).

## `Sp`

```sage
Sp(degree: int, field: sage.Parent) -> SymplecticGroupParent
```

Construct a finite symplectic group in its natural representation.

The order uses
`|Sp(2n,q)| = q^(n^2) product_(i=1)^n (q^(2i)-1)`.

```sage
sage: Sp(4, GF(7)).order()
276595200
```

### Metadata

- Kind: `function`
- Module: `sage.groups`
- Tags: group theory, finite groups, permutation groups, matrix groups
- Backends: Sage.js classical group formulas
- Sage compatibility: partial — The guided-tour finite group operations are compatible; large groups need non-enumerative algorithms.
- Limitations: Generic permutation and matrix groups are explicitly enumerated and are therefore intended for small orders.

### Provenance

- `sage-derived` — [SageMath finite groups API](https://doc.sagemath.org/html/en/reference/groups/); license GPL-2.0-or-later

## `sphere`

```sage
sphere(center: Any=[0, 0, 0], size: Any=1, **options: Any) -> Graphics3d
```

Return a sphere of radius `size` centered at `center`.

### Metadata

- Kind: `function`
- Module: `sage.plot.plot3d`
- Tags: graphics, 3D graphics, shapes
- Backends: Plotly, Sage.js rectangular sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Semantic 3D primitives with Plotly rendering

### Provenance

- `sage-derived` — [SageMath 3D plotting API and object model](https://doc.sagemath.org/html/en/reference/plot3d/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/3d-charts/)

## `spherical_plot3d`

```sage
spherical_plot3d(function_value: Any, urange: Any, vrange: Any, **options: Any) -> Graphics3d
```

Plot a radial function in spherical coordinates.

### Metadata

- Kind: `function`
- Module: `sage.plot.plot3d`
- Tags: graphics, 3D graphics, surfaces, coordinate transforms
- Backends: Plotly, Sage.js rectangular sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Semantic 3D primitives with Plotly rendering

### Provenance

- `sage-derived` — [SageMath 3D plotting API and object model](https://doc.sagemath.org/html/en/reference/plot3d/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/3d-charts/)

## `streamline_plot`

```sage
streamline_plot(functions: Any, xrange: Any, yrange: Any, **options: Any) -> Graphics
```

Plot integral curves of a vector field or first-order slope field.

Streamlines are integrated in both directions with a deterministic
midpoint method.  `density` controls seed count and integration step;
`start_points` supplies explicit seeds.

### Metadata

- Kind: `function`
- Module: `sage.plot`
- Tags: graphics, plotting, 2D graphics, vector fields, differential equations
- Backends: Plotly, Sage.js adaptive sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Sage-compatible semantic graphics with Plotly rendering

### Provenance

- `sage-derived` — [SageMath plotting API and object model](https://doc.sagemath.org/html/en/reference/plotting/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/)

### References

- [Plotly JavaScript Open Source Graphing Library](https://plotly.com/javascript/).

## `sudoku`

```sage
sudoku(puzzle: Matrix) -> Matrix
```

Solve a 9-by-9 Sudoku puzzle represented by a matrix.

Entries from 1 through 9 are fixed clues and zero denotes an empty cell.
The input matrix is not modified.  A `ValueError` is raised if the clues
are inconsistent or the puzzle has no solution.

### Examples

```sage
sage: A = matrix(ZZ, 9, [
....:     5,0,0,0,8,0,0,4,9, 0,0,0,5,0,0,0,3,0,
....:     0,6,7,3,0,0,0,0,1, 1,5,0,0,0,0,0,0,0,
....:     0,0,0,2,0,8,0,0,0, 0,0,0,0,0,0,0,1,8,
....:     7,0,0,0,0,4,1,5,0, 0,3,0,0,0,2,0,0,0,
....:     4,9,0,0,5,0,0,0,3])
sage: sudoku(A)[0]
(5, 1, 3, 6, 8, 7, 2, 4, 9)
```

### Metadata

- Kind: `function`
- Module: `sage.matrix.constructor`
- Tags: linear algebra, matrices, constraint solving, games
- Backends: FLINT, Arb, ACB
- Sage compatibility: partial — Solves Sage-compatible 9 by 9 integer Sudoku matrices.
- Algorithm: Native FLINT dense matrices, including Arb/ACB approximate arithmetic

### Provenance

- `sage-derived` — [SageMath matrix API](https://doc.sagemath.org/html/en/reference/matrices/); license GPL-2.0-or-later
- `library-backed` — [FLINT, Arb, and ACB](https://flintlib.org/doc/)

### References

- The FLINT contributors, [FLINT: Fast Library for Number Theory](https://flintlib.org/).

## `tetrahedron`

```sage
tetrahedron(center: Any=[0, 0, 0], size: Any=1, **options: Any) -> Graphics3d
```

Return a regular tetrahedron centered at `center`.

### Metadata

- Kind: `function`
- Module: `sage.plot.plot3d`
- Tags: graphics, 3D graphics, shapes, platonic solids
- Backends: Plotly, Sage.js rectangular sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Semantic 3D primitives with Plotly rendering

### Provenance

- `sage-derived` — [SageMath 3D plotting API and object model](https://doc.sagemath.org/html/en/reference/plot3d/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/3d-charts/)

## `text`

```sage
text(string: Any, position: Any, **options: Any) -> Graphics
```

Return a graphics object containing a positioned text label.

### Metadata

- Kind: `function`
- Module: `sage.plot`
- Tags: graphics, plotting, 2D graphics, labels
- Backends: Plotly, Sage.js adaptive sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Sage-compatible semantic graphics with Plotly rendering

### Provenance

- `sage-derived` — [SageMath plotting API and object model](https://doc.sagemath.org/html/en/reference/plotting/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/)

### References

- [Plotly JavaScript Open Source Graphing Library](https://plotly.com/javascript/).

## `text3d`

```sage
text3d(string: Any, position: Any, **options: Any) -> Graphics3d
```

Display text at a point in three-dimensional space.

### Metadata

- Kind: `function`
- Module: `sage.plot.plot3d`
- Tags: graphics, 3D graphics, text
- Backends: Plotly, Sage.js rectangular sampler
- Sage compatibility: partial — The Sage call form and core rendering semantics are supported; remaining specialized options are tracked by the graphics compatibility corpus.
- Algorithm: Semantic 3D primitives with Plotly rendering

### Provenance

- `sage-derived` — [SageMath 3D plotting API and object model](https://doc.sagemath.org/html/en/reference/plot3d/); license GPL-2.0-or-later
- `library-backed` — [Plotly.js](https://plotly.com/javascript/3d-charts/)

## `var`

```sage
var(names: str) -> Any
```

Create one or more symbolic variables and publish them in the session.

Names may be separated by commas, spaces, or both.  A single name returns
one symbolic expression; multiple names return a tuple.

### Examples

```sage
sage: var('x y')
(x, y)
sage: (x^2 + y).derivative(x)
2*x
```

### Metadata

- Kind: `function`
- Module: `sage.symbolic`
- Tags: symbolic mathematics, variables, expressions
- Backends: Cortex Compute Engine
- Sage compatibility: compatible — Matches Sage variable creation for supported names.
- Algorithm: MathJSON adapter over Cortex Compute Engine

### Provenance

- `sage-derived` — [SageMath symbolic API](https://doc.sagemath.org/html/en/reference/calculus/); license GPL-2.0-or-later
- `library-backed` — [Cortex Compute Engine](https://cortexjs.io/compute-engine/)

### References

- [Cortex Compute Engine](https://cortexjs.io/compute-engine/).

## `Zmod`

```sage
Zmod(order: Any) -> IntegerModRing
```

Construct the ring of integers modulo `order`.

Elements support exact arithmetic, inversion of units, iteration, and
matrices and polynomial rings over the resulting parent.

### Examples

```sage
sage: R = Zmod(15)
sage: R(17)
2
sage: R(2)^4
1
```

The current constructor requires `order >= 2`.

### Metadata

- Kind: `function`
- Module: `sage.rings.finite_rings.integer_mod_ring`
- Tags: rings, finite fields, residue rings, modular arithmetic
- Backends: FLINT
- Sage compatibility: partial — The supported arithmetic is Sage-compatible; the current constructor requires modulus at least 2.
- Algorithm: FLINT finite-field and modular arithmetic
- Limitations: Moduli 0 and 1 are not currently constructed.

### Provenance

- `sage-derived` — [SageMath finite rings API](https://doc.sagemath.org/html/en/reference/finite_rings/); license GPL-2.0-or-later
- `library-backed` — [FLINT finite-field and modular arithmetic](https://flintlib.org/doc/)

### References

- The FLINT contributors, [FLINT: Fast Library for Number Theory](https://flintlib.org/).
