# Plan for complete Sage 2D plotting coverage

## Objective

Make Sage.js implement the complete documented, user-visible SageMath 10.9
2D plotting contract, with differential evidence against Sage for every public
operation and option family.

This is a worthwhile project and it can be executed systematically. It is not
a single feature extraction: Sage 2D plotting is a subsystem containing core
graphics objects, primitives, numerical sampling, colors, composition,
animation, export, and renderer behavior. The first task is therefore to turn
“100% coverage” into a versioned ledger whose completion can be measured.

The reference target is the locally installed SageMath `10.9.post1`. The Sage
2D graphics reference and the installed source/docstrings are the authorities:

- <https://doc.sagemath.org/html/en/reference/plotting/>
- <https://doc.sagemath.org/html/en/reference/plotting/genindex-all.html>

## What “100%” means

Sage.js may claim complete coverage only when every in-scope ledger entry is
green in all of these dimensions:

1. **Import surface** — documented modules, public functions, classes,
   aliases, methods, attributes, signatures, defaults, and module identities.
2. **Semantic behavior** — accepted inputs, coercions, option normalization,
   return types, primitive composition, mutation, equality where defined,
   warnings, and exception types/messages where users can observe them.
3. **Numerical behavior** — sampling, adaptive refinement, exclusions,
   discontinuities, complex-value handling, interpolation, grids, and
   deterministic behavior under fixed random seeds.
4. **Rendering behavior** — all documented visual properties are represented
   by the Sage.js renderer. Images need perceptual and geometric equivalence,
   not byte identity with Matplotlib.
5. **Display and export** — notebook display, HTML, PNG, SVG, supported vector
   or animation formats, sizing, transparency, and save/show behavior.
6. **Integration behavior** — plots produced by graphs, matrices, symbolic
   expressions, lists, and objects implementing `_plot_` or `plot` protocols.
7. **Portability and performance** — correct dynamic fallbacks on supported
   platforms and bounded performance on representative workloads.

“A function with the right name exists” is not coverage. A feature is partial
until its complete option and error contract has differential tests.

### Renderer-specific boundary

Literal identity with Matplotlib objects or pixel-for-pixel output is neither
portable nor a useful Sage.js contract. Nevertheless, documented methods such
as `Graphics.matplotlib()` must remain in the ledger. Each must be implemented
with equivalent observable behavior or kept red; it cannot silently be
excluded while the project claims 100%.

Where Plotly cannot express a Sage feature, the project should add a
deterministic SVG/canvas renderer or a small render-neutral scene layer rather
than distort the Sage API. An incompatibility may be documented, but any such
incompatibility prevents an unqualified “100% Sage coverage” claim.

## Initial baseline

The installed Sage package contains 30 relevant `sage.plot` modules after
excluding the `sage.plot.all` aggregator and the separate 3D package. The 2D
reference also includes `sage.graphs.graph_plot`.

The surface includes these major groups:

- general: `graphics`, `primitive`, `plot`, `colors`, `animate`, and
  `multigraphics`;
- function/data plots: `complex_plot`, `contour_plot`, `density_plot`,
  `plot_field`, `streamline_plot`, `scatter_plot`, `step`, `histogram`, and
  `bar_chart`;
- object plots: graph plotting and `matrix_plot`;
- shapes: `arc`, `arrow`, `bezier_path`, `circle`, `disk`, `ellipse`, `line`,
  `point`, `polygon`, `text`, and the three hyperbolic-geometry modules;
- infrastructure: `misc` and the public helpers in `plot` and `colors`.

Sage.js already has substantial implementations in `src/baselib/graphics.py`,
including most top-level constructors, numerical plots, colors, composition,
animation, hyperbolic shapes, and Plotly display. Commit `0458618d` completed
the reviewed `sage.plot.misc` helper cluster. This is a strong starting point,
but the existing registration metadata correctly describes the subsystem as
partial: most implementations have not been audited option-by-option, most
documented `sage.plot.*` module paths do not yet exist, and rendering coverage
is not yet measured against a complete oracle.

The current monolithic file is an implementation inventory, not proof of
compatibility. This project should expect many fixes to be small and a few
renderer/composition gaps to be architectural.

## Durable project artifacts

Create a checked-in `docs/sage-compatibility/plot2d/` area containing:

- `surface.json` — the complete public surface with a pinned Sage version and
  source hashes;
- `coverage.json` — one record per operation, method, option family, protocol,
  and output capability;
- `schema.json` — a fail-closed schema for the ledger;
- `oracle/` — compact Sage-generated semantic fixtures;
- `render-cases/` — deterministic scene descriptions and image references;
- `performance.json` — comparable benchmark definitions and budgets;
- `README.md` — how to regenerate and validate every artifact.

Each coverage record should contain at least:

```text
id
sage_module
qualified_name
kind
signature
source_hash
documented_examples
option_families
dependencies
semantic_status
render_status
platform_status
tests
known_differences
```

Allowed status values should be `missing`, `partial`, `matches`, and
`not-applicable`. `not-applicable` requires a written scope rule; it is not a
way to hide unsupported behavior.

## Work packages

### P0 — Freeze and enumerate the contract

1. Pin SageMath `10.9.post1` and hash every relevant installed source module.
2. Enumerate the module index, `sage.plot.all`, documented public objects,
   class methods/attributes, function signatures, aliases, option dictionaries,
   and examples.
3. Record APIs imported from adjacent modules, especially graph plotting,
   matrices, symbolic expressions, rich representation, and 3D conversion.
4. Compare that inventory mechanically with Sage.js globals, module paths,
   stubs, tests, and registered documentation.
5. Generate the first red/yellow/green coverage report.

Acceptance: the ledger is reproducible and fails CI if a target disappears,
an entry lacks evidence, or Sage.js claims an undocumented match.

### P1 — Oracle and differential harness

Build one reusable harness rather than a test script per function.

The Sage side must capture:

- normalized `repr`, type, module, signature, and options;
- primitive count, primitive type, normalized option dictionaries, and bounds;
- sampled coordinate/value arrays and finite/NaN masks;
- exceptions and warnings;
- normalized scene geometry before Matplotlib rendering;
- fixed-size PNG/SVG output for selected rendering cases.

The Sage.js side must produce the same normalized record. Comparisons should
support exact values, binary64 tolerances, unordered metadata, geometric
tolerances, and perceptual image thresholds as appropriate.

Acceptance: a single command runs an individual ledger entry or the complete
2D compatibility suite, and oracle regeneration is deterministic.

### P2 — Public module layout and API identity

Create ordinary strict Python modules under `src/lib/sage/plot/` for every
documented module. Initially they may expose reviewed baselib implementations;
over time, move coherent mathematical logic into those modules.

Cover:

- all documented imports and aliases;
- class `__module__`, `repr`, and inheritance relationships;
- signatures, keyword-only behavior, defaults, `.options`, and `.reset()`;
- decorators and protocol entry points used by Sage objects;
- `sage.plot.all` and top-level Sage namespace exports.

Acceptance: every import and introspection ledger entry matches Sage.

### P3 — Core graphics and primitive contract

Audit `GraphicPrimitive` and `Graphics` before polishing leaf constructors.
This layer controls every downstream result.

Cover:

- construction, indexing, iteration, length, addition, multiplication, and
  primitive ownership;
- min/max data, axes ranges, aspect ratio, legends, labels, ticks, gridlines,
  frames, clipping, z-order, and extra keywords;
- show/save option routing and precedence;
- primitive base methods, allowed options, option validation, and 2D-to-3D
  conversion;
- `_plot_`, `_rich_repr_`, and object plotting dispatch;
- stable, render-neutral scene serialization for differential testing.

Decision gate: determine whether the current Plotly-shaped primitive records
can represent the full contract. If not, introduce a backend-neutral scene IR
with Plotly and deterministic SVG adapters before adding more special cases.

Acceptance: core object and option suites pass before leaf modules are marked
complete.

### P4 — Colors, styles, text, axes, and legends

Port and audit the complete `colors` module and all cross-cutting presentation
semantics:

- `Color`, `ColorsDict`, colormaps, color parsing, conversions, arithmetic,
  named colors, `hue`, `rainbow`, and helpers;
- line/marker/fill styles, opacity, thickness, dashes, and z-order;
- fonts, mathematical text, alignment, rotation, bounding boxes, and text
  colors;
- axes, scales, logarithmic bases, ticks, tick formatters, labels, titles,
  legends, and gridline style/placement.

Acceptance: option matrices and canonical rendered examples match within the
defined semantic and visual tolerances.

### P5 — Shapes and data primitives

Audit each primitive module independently:

- line, point, polygon, arrow, circle, ellipse, arc, disk, Bezier path, text;
- bar chart, histogram, scatter plot, and step plot;
- aliases such as `line2d`, `point2d`, `points`, `polygon2d`, and `arrow2d`;
- degenerate inputs, iterators, numeric rings, complex inputs, NaN/infinity,
  option conflicts, and exact error behavior;
- every documented primitive method, including 3D conversion where present.

Acceptance: every module is green independently of high-level `plot()`.

### P6 — Function plotting and numerical sampling

Treat this as mathematical infrastructure, not renderer code.

Cover:

- `plot`, `parametric_plot`, `polar_plot`, list plots, and logarithmic wrappers;
- `generate_plot_points`, adaptive refinement, randomization, initial points,
  exclusions, pole detection, fill modes, baselines, and multiple functions;
- callable expressions, ordinary callables, symbolic functions, constants,
  fast-callable compilation, imaginary tolerance, and failed evaluations;
- ranges with and without variables, reversed ranges, exact endpoints, and
  coercion from Sage numeric parents;
- dispatch to objects implementing plotting protocols.

Benchmarks must separate setup/compilation, per-point evaluation, adaptive
refinement, and renderer conversion. Optimize only measured bottlenecks while
retaining a correct dynamic fallback.

Acceptance: sampled geometry and discontinuity behavior match the Sage oracle
over a curated corpus plus randomized differential cases.

### P7 — Grid, field, and complex plots

Audit the higher-dimensional numerical 2D plots:

- contour, density, implicit, and region plots;
- matrix plots, including sparse/dense matrices, subdivisions, and colorbars;
- vector and slope fields;
- streamline integration, seeds, density, and boundary behavior;
- complex domain coloring, colormaps, contours, interpolation, and invalid
  values.

These should share tested grid-evaluation and color-mapping infrastructure
rather than independently sampling expressions.

Acceptance: numerical grids, derived geometry, color normalization, legends,
and representative images match.

### P8 — Hyperbolic plots and mathematical-object integration

Cover hyperbolic arcs, polygons, triangles, regular polygons, supported models,
model conversions, boundary cases, and errors. Then audit:

- `sage.graphs.graph_plot`, graph layout/options, labels, loops, multiedges,
  directed edges, and graph object dispatch;
- matrix object plotting;
- any documented plotting methods on adjacent Sage objects included by the 2D
  reference or reachable through the generic plotting protocol.

Acceptance: both direct constructors and object methods produce matching
primitive/scene results.

### P9 — MultiGraphics, graphics arrays, animation, display, and export

Cover:

- `MultiGraphics`, insets, positioning, append/index behavior, and layout;
- `GraphicsArray`, dimensions, composition, and shared show/save options;
- `Animation`, frame operations, concatenation, slicing, GIF/APNG/HTML behavior,
  frame options, and cleanup;
- notebook rich display and standalone HTML;
- PNG and SVG at minimum, plus every other format documented as supported;
- dimensions, DPI, transparency, backgrounds, bounding boxes, and fonts.

Acceptance: semantic object tests pass, export files are valid and
deterministic where promised, and browser rendering passes fixed-viewport
visual regression tests.

### P10 — Long-tail closure and documentation

1. Run all plotting reference examples and doctests through the differential
   harness.
2. Add property-based cases for coordinates, ranges, colors, and option
   combinations.
3. Resolve every `partial` ledger record; do not close the project with an
   unexplained skip list.
4. Replace current “partial” documentation metadata with exact compatibility
   notes derived from the ledger.
5. Publish the coverage report, performance results, renderer differences,
   and regeneration commands.

Acceptance: the fail-closed coverage report contains no `missing` or `partial`
records and all release gates pass.

## Per-operation execution loop

Use the same loop for every ledger entry:

1. Read the Sage 10.9 documentation, source, tests, and related protocols.
2. Capture a compact Sage oracle covering normal, boundary, invalid, and
   composition cases.
3. Measure current Sage.js behavior before editing and classify the exact gap.
4. Implement ordinary CPython-parseable Python first. Use existing native
   compilation only for a measured mathematical hot path.
5. Add focused semantic tests, scene comparisons, and visual tests where the
   operation renders.
6. Benchmark comparable in-process boundaries when performance matters.
7. Run strict typing, architecture checks, native-disabled fallback tests,
   graphics integration tests, and the applicable cross-platform CI matrix.
8. Mark a ledger item `matches` only after all linked evidence is green.

Commits should be coherent by module or shared dependency. Avoid giant
“complete plotting” commits that make regressions impossible to localize.

## Testing strategy

### Semantic tiers

- **Tier A: import/introspection** — fast tests for the complete public surface.
- **Tier B: primitive records** — exact normalized options, geometry, bounds,
  composition, warnings, and errors.
- **Tier C: numerical differential** — Sage/Sage.js arrays and adaptive paths.
- **Tier D: render differential** — deterministic SVG structure and perceptual
  PNG comparisons at fixed fonts, size, DPI, locale, and seed.
- **Tier E: integration** — notebooks, export, animation, graph/matrix objects,
  and browser display.

Every leaf API needs Tier A and B. Numerical plots also need Tier C; anything
with visual-only behavior needs Tier D; display/export APIs need Tier E.

### Visual comparison rules

Do not use screenshots as the only oracle. Compare, in order:

1. semantic scene/primitive data;
2. geometry and layout measurements;
3. SVG structure where deterministic;
4. perceptual raster output.

This makes failures explainable and avoids accepting a numerically incorrect
plot merely because two images look similar.

## Performance and resource gates

Maintain representative workloads for:

- primitive construction and large point lists;
- adaptive scalar plots with smooth and discontinuous functions;
- large grid contour/density/complex plots;
- vector fields and streamline integration;
- graph and matrix plots;
- composition, serialization, and PNG/SVG export.

Record setup time, evaluation time, render conversion, total time, peak memory,
and output size separately. Initial acceptance should require bounded scaling
and no major regression from the pre-change Sage.js baseline. Sage comparisons
must use identical in-process boundaries before reporting a speed ratio.

## Proposed sequencing and estimates

The ordering should follow shared dependencies, not the apparent simplicity of
leaf function names:

1. P0–P1: ledger and harness;
2. P2–P4: modules, core objects, and presentation semantics;
3. P5–P6: primitives and scalar/function sampling;
4. P7–P8: grids, fields, complex plots, and object integrations;
5. P9: composition, animation, display, and export;
6. P10: exhaustive closure.

An initial planning envelope is 30–60 engineering days because much production
code already exists but the audit surface is broad and renderer gaps may
require shared infrastructure. P0 will replace this rough estimate with counts
and dependency-based ranges. Parallel implementation can shorten elapsed time
only after P0–P3 stabilize the ledger, oracle format, and core scene contract.

## Immediate next actions

1. Add the machine-readable surface extractor for Sage 10.9.
2. Generate the first `surface.json` and coverage report.
3. Inventory every public `Graphics` and `GraphicPrimitive` method before
   assigning leaf-module status.
4. Build the normalized primitive/scene oracle format using line, point, text,
   and `plot()` as representative cases.
5. Decide the scene-IR/render-backend architecture based on documented features
   that current Plotly records cannot represent.
6. Complete one vertical slice—`sage.plot.line` including module imports,
   primitive behavior, options, composition, rendering, export, and 3D
   conversion—to validate the harness and completion rules.
7. Re-estimate the remaining work from the generated dependency graph, then
   execute the packages in the order above.

## Final completion gate

The project is complete only when:

- the pinned public surface is fully represented in the ledger;
- no record is `missing` or `partial`;
- all documented examples pass or have an explicitly approved change to the
  target contract;
- semantic, numerical, rendering, display, and export suites pass;
- native-disabled and supported-platform tests pass;
- performance/resource budgets pass;
- the generated report can substantiate the “100%” claim without relying on
  manual interpretation.

