# Sage Guided Tour compatibility corpus

This corpus pins the executable examples from Sage's public Guided Tour. It is
not a copy of Sage implementations. The generated fixture records the original
repository revision, source paths and hashes, headings, inputs, expected
outputs, and source locations.

Each `tour*.rst` file runs as one stateful Sage session. An upstream `.. skip`
directive remains skipped. Sage.js-specific exclusions and known compatibility
gaps live separately in `expectations.json`; stale expected failures are test
failures.

The current pinned gate has 410 passing examples, 6 upstream skips, and 246
location-specific expected failures. See `BOUNDARIES.md` for the point at which
remaining work requires major subsystem choices rather than low-hanging
compatibility additions.

Run the compatibility gate or a development report with:

```sh
pnpm test:tutorial
pnpm tutorial:report
```

The report also writes structured results to
`/tmp/sagejs-tutorial-results.json`, which makes it possible to group failures
by public tutorial section rather than patching individual examples.
