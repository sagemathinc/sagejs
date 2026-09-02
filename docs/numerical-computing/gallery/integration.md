# Integrating the numerical laboratory

The checked gallery is authored under `docs/numerical-computing/gallery/` and
published byte-for-byte under `website/numerical-computing/`. The cross-domain
generator owns both copies and the public manifest so a website deployment
cannot silently serve stale numerical evidence.

## sagejs.org

GitHub Pages publishes these runtime assets at `/numerical-computing/`:

```text
index.html
gallery.css
gallery.mjs
evidence.json
plotly.min.js
plotly.LICENSE.txt
gallery-manifest.json
```

The generator copies the repository-pinned `plotly.js-dist-min` build and its
license. Its version, byte size, and SHA-256 digest are recorded in the public
manifest. Do not replace the checked Plotly JSON or local renderer with CDN
assets; no remote network access is required.

Add one site-navigation link named “Numerical methods laboratory.” The landing
page already contains all prose, assumptions, failure explanations, and result
tables without JavaScript, so search indexing and accessibility do not depend
on Plotly.

## app.sagejs.org

Each story's “Open in Sage.js” action is now generated from its complete
`canonical_python` field using the app's source-only share URL. The source is
independently executable in a fresh cell. It does not claim that the checked
result came from the new live run: the checked story and new computation have
separate provenance.

For an embedded gallery panel:

1. fetch `evidence.json` as text;
2. call `assertGalleryBudgets(bundle, text)` before rendering;
3. render only the selected case with `renderPresentation`;
4. preserve the static description as the panel's accessible name;
5. expose the three checked exports (PlotSpec/PlotAnimation JSON, Plotly JSON,
   and script-free HTML); and
6. dispose the Plotly graph when the panel closes.

Root presentations are safe to create after computation: public `plot()` and
`animate()` replay retained trace evidence and do not invoke the user's
callback. Prefer `trace="evaluations"` when a signed point cloud is useful;
an iteration-only trace is still honest but can show only retained residual
magnitudes. Do not add an app-side callback sampler to make either view look
like a smooth function curve.

Domain PlotSpecs now use canonical `Axes2DSettings` records and should lower
through `sagejs.plotting.lower_plot_spec`/`lower_plot_animation`. Treat a
blocked shared-lowering receipt as an integration regression. The gallery's
bounded fallback exists for diagnosis and old evidence, not as the app's
preferred renderer.

The full documentation page renders seventeen figures for qualification. The
app should lazy-render the selected story rather than mounting all stories in
an editor session.

## Updating a story

Story changes begin in
`test/numerics/gallery/generate-cross-domain-evidence.py`. Use only public
result fields, traces, and presentation methods. Freeze callback counts before
calling the presentation layer and assert them afterwards. If the public
result does not retain enough evidence, set `public_surface_gap`, provide a
static evidence story, and ask the owning numerical domain to add a bounded
public surface. Do not reach into private solver state.

Then run:

```sh
node test/numerics/gallery/generate-cross-domain-gallery.cjs --write
node --test test/numerics/gallery/cross-domain-gallery.test.cjs
node bench/numerical-gallery/measure.cjs
```

The browser test injects the locally installed pinned Plotly distribution,
renders all seventeen figures in Chromium, checks mobile overflow and reduced
motion, and separately verifies the no-JavaScript document.
