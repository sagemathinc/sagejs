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

Run `node --test test/website.cjs` after changing the site or its data. The
GitHub Pages workflow validates the site before deploying it.

Serve the directory locally to exercise `fetch()`:

```sh
python3 -m http.server --directory website 8000
```
