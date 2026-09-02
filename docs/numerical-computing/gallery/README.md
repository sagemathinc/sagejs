# Numerical teaching gallery

The checked cross-domain laboratory in this directory is the P7 teaching and
explanation layer for the current numerical product:

- [`index.html`](index.html) is a complete static lesson and the progressively
  enhanced gallery entry point;
- [`evidence.json`](evidence.json) contains nine stories and eighteen success
  or failure cases generated from current public numerical results;
- [`gallery.mjs`](gallery.mjs) validates resource receipts, renders the
  Plotly-compatible exports, and creates PlotSpec, Plotly JSON, and static HTML
  downloads;
- [`cross-domain.schema.json`](cross-domain.schema.json) defines the portable
  bundle contract; and
- [`integration.md`](integration.md) gives the app.sagejs.org and website
  integration boundary. [`public-surface-gaps.md`](public-surface-gaps.md)
  records the result/presentation gaps exposed without bypassing them.

The gallery is published at
[`website/numerical-computing/`](../../../website/numerical-computing/) from
the same generator; CI rejects drift between the checked evidence and public
assets. It covers scalar roots, nonlinear fitting, ODE adaptivity, linear
refinement, adaptive quadrature, polynomial approximation, eigensystems,
local optimization, and robust regression. Every story contains both normal
success and a mathematically instructive failure. The failure category is not
synonymous with `result.success == false`: the Runge story is deliberately a
successful, validated interpolation construction that is nevertheless a poor
between-node approximation.

Regenerate and test the complete laboratory with:

```sh
node test/numerics/gallery/generate-cross-domain-gallery.cjs --write
node --test test/numerics/gallery/cross-domain-gallery.test.cjs
node bench/numerical-gallery/measure.cjs
```

The checked bundle is capped at 8 MB, each story at 1.5 MB, and every
animation at 32 retained frames. Current source is substantially below those
ceilings. Generation, validation, static export, whole-page hydration, and
individual Plotly render times also have generous fail-closed release ceilings
in `evidence.json`. They catch hangs and algorithmic regressions without being
used as performance targets. The benchmark separately reports every phase and
a real Chromium render of all seventeen visual presentations.

## Evidence and replay contract

- The result record, semantic trace, PlotSpec/PlotAnimation, Plotly document,
  and accessible prose stay together.
- Visualizers may select or deterministically decimate retained states; they
  may not interpolate an uncomputed iteration.
- Callback counts are frozen before presentation and checked afterwards.
  Result visualization must not evaluate a user's function again.
- Static descriptions and result tables are present in the generated HTML
  before JavaScript runs. Animation is an optional view and never autoplays.
  The enhanced host supplies Play, Pause, Step, Restart, Speed, and Iteration
  controls over retained frame IDs. Step and Speed are explicitly host-routed
  because portable Plotly figure data has no relative-frame state or mutable
  playback-speed setting; Restart and the absolute slider also remain in the
  portable Plotly document.
- Payload measurements are generated beside the evidence and checked
  fail-closed. Python's source-side byte receipts are retained because JSON
  distinguishes `1.0` there while JavaScript reserialization does not.
- Public numerical PlotSpecs use the canonical `Axes2DSettings` `xaxis` and
  `yaxis` vocabulary accepted by shared Plotly lowering. The gallery keeps a
  bounded 2-D `line`, `point`, and `text` adapter only as a fail-closed check
  for older or independently serialized evidence.

The gallery exposed and helped resolve an important public-surface defect.
Root `NumericalResult.plot()` and `.animate()` now use only retained
`evaluation` and `iteration` events; they never sample the live callback for
presentation. The root stories render those computed points, bracket segments,
and candidates without inferring a smooth curve. Both semantic and Plotly
exports retain `computed_evidence_only` and `callback_reevaluated: false`
metadata, and focused tests freeze callback counts across presentation.

## Evidence rules

- Human narratives are selected from `success`, diagnostic code, or status in
  that order. Each rule cites JSON pointers into its case's structured result.
- A solver termination and independent validation remain distinct. In the
  discontinuity example Brent reports `converged`, while `success` is false
  because the independently checked residual is `1.0`.
- The first root story also contains a
  `sagejs.numerics.reference-comparison/v1` record. Brent and bisection execute
  separately over distinct callback instances. The record retains the complete
  bisection `NumericalResult`, derives both displayed method summaries from the
  two result records, and checks their candidate difference against the larger
  declared x-tolerance. The accessible page shows values, residuals,
  iterations, evaluations, callback calls, and the agreement test; it does not
  reconstruct a comparison from a picture or rerun either callback while
  rendering.
- Every animation retains its quantitative trace table. Playback never starts
  automatically. A reduced-motion preference disables timed Play and Speed
  while Step, Restart, and the Iteration slider remain usable with zero-duration
  transitions. The HTML contains a complete static account before JavaScript
  runs.
- The browser renderer reads PlotSpec layers directly and offers both the
  original PlotSpec/PlotAnimation JSON and a Plotly-compatible JSON document.
  The fixture also records whether the shared Plotly lowering accepted the
  current PlotSpec, rather than hiding a lowering failure.
- Manifest ceilings constrain story JSON, events per result, frames, samples per
  frame, every result and verification trace payload, and both semantic and
  Plotly animation payloads. Recorded measurements must match the loaded data.
  The gallery refuses over-budget or stale evidence instead of silently
  trimming it.

Every `canonical_python` program includes its imports, data, and callback
definitions. The corresponding “Open in Sage.js” URL encodes precisely that
source in the live app's documented source-only share format. Focused tests
decode every link and execute every program after a fresh kernel reset.

Set `SAGEJS_CHROMIUM_PATH` if Chromium is installed outside the standard
locations. Browser absence skips only the live rendering observations; schema,
fixtures, executable examples, accessibility markup, export, and non-browser
budget tests remain mandatory.
