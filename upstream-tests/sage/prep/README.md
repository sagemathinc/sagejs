# Sage PREP compatibility corpus

This corpus pins every executable Sage transcript in the public MAA PREP
tutorials. It records the exact upstream revision, paths, hashes, headings,
inputs, expected output, source locations, and doctest tags; it does not copy
Sage implementations.

Each source file executes as one persistent Sage session. Upstream `.. skip`
directives remain skipped. Presentation exercises, optional external systems,
known missing subsystems, and intentional incompatibilities are classified by
exact source location in `expectations.json`. A stale expected failure is a
test failure.

Generate the pinned fixture from the matching Sage checkout and run it with:

```sh
pnpm prep:extract -- --sage-root /path/to/sage
pnpm test:prep
pnpm prep:report
```

The report writes structured per-file and per-section results to
`/tmp/sagejs-prep-results.json`.
