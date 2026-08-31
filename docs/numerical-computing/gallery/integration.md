# Integrating the numerical laboratory

The checked gallery is intentionally self-contained under
`docs/numerical-computing/gallery/`. This lane does not change shared website
routing, app navigation, package manifests, or deployment code.

## sagejs.org

Publish these four runtime assets under a stable path such as
`/numerical-computing/laboratory/`:

```text
index.html
gallery.css
gallery.mjs
evidence.json
```

Supply the repository-pinned `plotly.js-dist-min` build before the module runs,
or expose an equivalent pinned Plotly global through the site bundler. Do not
replace the checked Plotly JSON with CDN-generated figures. A strict content
security policy needs `script-src` permission for the local Plotly bundle and
the ES module; no remote network access is required.

Add one site-navigation link named “Numerical methods laboratory.” The landing
page already contains all prose, assumptions, failure explanations, and result
tables without JavaScript, so search indexing and accessibility do not depend
on Plotly.

## app.sagejs.org

Link each story's `canonical_python` field to an “Open in Sage.js” action. The
action should copy the source into a fresh numerical cell; it must not claim
that the checked result came from the new live run. The checked story and the
new computation have separate provenance.

For an embedded gallery panel:

1. fetch `evidence.json` as text;
2. call `assertGalleryBudgets(bundle, text)` before rendering;
3. render only the selected case with `renderPresentation`;
4. preserve the static description as the panel's accessible name;
5. expose the three checked exports (PlotSpec/PlotAnimation JSON, Plotly JSON,
   and script-free HTML); and
6. dispose the Plotly graph when the panel closes.

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
