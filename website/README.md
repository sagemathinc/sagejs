# Sage.js implementation dashboard

This directory is the static source for <https://sagemathinc.github.io/sagejs/>.
It intentionally has no build step or third-party browser dependencies.

`capabilities.json` is the project's machine-readable implementation map. Each
entry must distinguish:

- `state`: how much of the capability exists (`available`, `partial`, or
  `planned`);
- `quality`: how strongly it is supported (`certified`, `tested`, `prototype`,
  or `planned`);
- `evidence`: the concrete basis for the quality claim;
- `target` and `priority`: what remains and when it matters.

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
