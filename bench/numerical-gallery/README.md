# Numerical gallery measurements

`measure.cjs` measures the P7 teaching gallery separately from numerical
solver microbenchmarks. It reports:

- checked evidence, HTML, CSS, renderer, Plotly, and export payload sizes;
- time to execute all eighteen numerical cases and construct their semantic
  presentations;
- time to parse and revalidate every resource receipt;
- time to build the static accessible document and all three export forms; and
- when Chromium is available, cold wall time to load the local page, validate
  its evidence, render seventeen Plotly figures, and register all frames.

Run it with:

```sh
node bench/numerical-gallery/measure.cjs
```

Write an explicit platform receipt only when qualification needs one:

```sh
node bench/numerical-gallery/measure.cjs \
  --write bench/numerical-gallery/results/linux-x64.json
```

The receipt includes a SHA-256 digest over the evidence generator, renderer,
CSS, and checked bundle. Timing is observational rather than a release claim;
the fail-closed byte/frame/trace budgets are enforced by the focused test.
