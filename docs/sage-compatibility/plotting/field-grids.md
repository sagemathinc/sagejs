# Sage 2D scalar and vector fields

This slice implements the shared mathematical core for `contour_plot`,
`density_plot`, `implicit_plot`, `region_plot`, `plot_vector_field`, and
`plot_slope_field`.

## Coordinate and sampling contract

- Rectangular grids contain both endpoints.
- `plot_points=n` means `n` samples in each direction; `(nx, ny)` is also
  supported.
- Scalar matrices are always `z[y_index][x_index]`, matching Sage's contour
  and density primitives.
- The complete grid is materialized once and has a hard default limit of one
  million evaluations.
- Failed, complex, and non-finite evaluations become `None` and `False` in an
  accompanying finite mask. Counts and reason classes are retained as
  metadata and PlotSpec diagnostics.
- Explicit contour levels must be finite and strictly increasing. Integer or
  omitted levels are materialized deterministically rather than delegated to
  Matplotlib's locator heuristics. This is a documented Plotly-native
  translation.

The pinned values in
[`oracle/field-grids.json`](oracle/field-grids.json) were obtained from
SageMath 10.9.post1 with `/home/user/bin/sagelite`.

## Plotly lowering

Contour, density, implicit, and region layers lower to Plotly `contour` or
`heatmap` traces without erasing their semantic kind or sampled mask. Vector
and slope fields retain raw `u` and `v` components in PlotSpec and lower to
deterministic scatter line segments with arrowheads. This is intentionally a
translated quiver representation because Plotly has no native 2D quiver trace.

All supplied options receive a `supported`, `translated`, or `unsupported`
outcome in `metadata.style_decisions`. Unknown or currently unrepresented
options raise `NotImplementedError`; no option is silently discarded. Tooling
can call the normalization helpers with `reject_unsupported=False` to inspect
the complete outcome list without constructing a layer.

Finite numeric grids use a bulk ordinary-Python path. If an evaluation raises,
the sampler retries point by point so that every remaining hole and exception
class is retained. Plotting callables are therefore expected to be pure, as
they are in Sage's numerical evaluator. The native-disabled benchmark covers a
160,000-sample scalar grid and a 10,000-sample vector grid with checksum
comparison against CPython.

## Current integration boundary

The qualified `sage.plot` constructors return a `PlotSpec` in this isolated
slice. Central integration must:

1. export the five new strict modules in `pyrightconfig.json` and the package
   graph;
2. delegate the six field layer kinds from the shared PlotSpec lowerer to
   `lower_field_layer`;
3. wrap constructor results in the common `Graphics` bridge while preserving
   each layer, diagnostic, and provenance record;
4. register `test/sage-2d-fields.cjs` in the Node test manifest; and
5. update the exhaustive plotting coverage ledger only after those hooks pass.

Symbolic expressions and relations are deliberately rejected in the strict
sampler until the central Sage expression-to-callable bridge is connected.
Callable numerical fields are fully supported by this slice. As in Sage's
`equify`, callable region predicates use Python truthiness; the sign-based
conversion for symbolic inequalities belongs to the pending expression bridge.
