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

The gallery covers scalar roots, nonlinear fitting, ODE adaptivity, linear
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
ceilings. The benchmark separately reports solver/presentation generation,
JSON validation, export generation, and a real Chromium render of all seventeen
visual presentations.

## Evidence and replay contract

- The result record, semantic trace, PlotSpec/PlotAnimation, Plotly document,
  and accessible prose stay together.
- Visualizers may select or deterministically decimate retained states; they
  may not interpolate an uncomputed iteration.
- Callback counts are frozen before presentation and checked afterwards.
  Result visualization must not evaluate a user's function again.
- Static descriptions and result tables are present in the generated HTML
  before JavaScript runs. Animation is an optional view and never autoplays.
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

## Original root vertical slice

This directory defines the data contract for interactive numerical stories.
The deployable, dependency-free gallery is in
`website/numerical-computing/`. Its checked story records are generated from
the real `NumericalResult`, `NumericalTrace`, and `PlotAnimation` objects.

The manifest is deliberately small. A later domain contributes one story JSON
document and one manifest entry; it does not need to fork the renderer. The
story schema standardizes learning objectives, method assumptions, exact
language examples, success and failure cases, evidence-selected actions,
PlotSpec/Plotly metadata, accessibility, and payload measurements. A domain
may add new diagnostic codes through `narrative_catalog.diagnostics` without
adding status-string parsing to the browser.

## Evidence rules

- Human narratives are selected from `success`, diagnostic code, or status in
  that order. Each rule cites JSON pointers into its case's structured result.
- A solver termination and independent validation remain distinct. In the
  discontinuity example Brent reports `converged`, while `success` is false
  because the independently checked residual is `1.0`.
- Every animation retains its quantitative trace table. Playback never starts
  automatically, the slider remains usable with reduced motion, and the HTML
  contains a complete static account before JavaScript runs.
- The browser renderer reads PlotSpec layers directly and offers both the
  original PlotSpec/PlotAnimation JSON and a Plotly-compatible JSON document.
  The fixture also records whether the shared Plotly lowering accepted the
  current PlotSpec, rather than hiding a lowering failure.
- Manifest ceilings constrain story JSON, events per result, frames, samples per
  frame, every result and verification trace payload, and both semantic and
  Plotly animation payloads. Recorded measurements must match the loaded data.
  The gallery refuses over-budget or stale evidence instead of silently
  trimming it.

## Generate and validate

Regenerate the deterministic root fixture after the numerical contracts
change:

```sh
node test/numerics/gallery/generate-root-story.cjs --write
```

Check fixture freshness and all static/browser contracts:

```sh
node --test test/numerics/gallery/root-gallery.test.cjs
```

Set `SAGEJS_CHROMIUM_PATH` if Chromium is installed outside the standard
locations. Browser absence skips only the live rendering observation; schema,
fixtures, narrative selection, accessibility markup, export, and budget tests
remain mandatory.

## Integration boundary

The new subtree intentionally does not edit shared website routing or package
scripts. Integration should link `/numerical-computing/` from the shared site
navigation and register the focused Node test in the repository's chosen test
discovery path if directory tests are not picked up automatically.
