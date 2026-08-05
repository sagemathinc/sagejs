# Sage.js implementation dashboard

This directory is the static source for <https://sagemathinc.github.io/sagejs/>.
It intentionally has no build step or third-party browser dependencies.

`capabilities.json` is the project's machine-readable implementation map. Each
entry must distinguish:

- `state`: how much of the capability exists (`available`, `partial`, or
  `planned`);
- `quality`: how strongly it is supported (`certified`, `tested`, `prototype`,
  or `planned`);
- `coverage`: how broad the implemented surface is, independently of quality;
- `evidence`: the concrete basis for the quality claim;
- `target` and `priority`: what remains and when it matters.

## Coverage scores

A numeric score is published only when its meaning is explicit. A measured
score records its numerator, denominator, unit, reference version, method, and
audit date. An expert estimate uses `kind: "estimated"`, is rendered with a
leading `~`, and states why a mechanical denominator is not yet available.
Capabilities without either must display `Score audit pending`; absence is not
silently converted into a zero or an optimistic estimate.

The first reproducible audit is
[`coverage/python-stdlib.json`](coverage/python-stdlib.json). It measures
top-level module breadth against CPython 3.14. The integration test
`test/coverage-python-stdlib.cjs` imports every reference name and verifies the
published numerator. This deliberately does not claim that every API inside an
importable module exists. Future audits should follow the same pattern and use
the narrowest defensible unit: public symbols, documented constructors,
algorithm cases, or a named workflow corpus.

`examples.json` is an executable cookbook. Examples are displayed inside their
capability cards and indexed by the site-wide search. `test/dashboard-examples.cjs`
runs every cell through the same polyglot kernel used by Jupyter and checks its
exact normalized output. Non-Sage examples are copied with their required cell
magic automatically.

Run `node --test test/website.cjs` after changing the site or capability data.
After changing examples, build Sage.js and run the executable corpus as well:

```sh
pnpm build
node --test --test-concurrency=1 test/dashboard-examples.cjs
```

The GitHub Pages workflow validates the static site before deploying it, and
the full integration tier executes every notebook cell.

Serve the directory locally to exercise `fetch()`:

```sh
python3 -m http.server --directory website 8000
```
