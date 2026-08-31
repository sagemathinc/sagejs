# Numerical teaching gallery

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
