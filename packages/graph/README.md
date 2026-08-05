# `@sagemath/sagejs-graph`

This private workspace package is Sage.js's optional native graph backend. It
links a small Node-API boundary to the GPL-licensed igraph C library and keeps
the ordinary mathematical implementation independent of the native addon.

The boundary deliberately exchanges only plain graph data: a vertex count,
an edge array, a directed flag, and optional integer vertex colors. It exposes
isomorphism, canonical labeling, compact automorphism-group generators, and
selected layout algorithms. Boolean isomorphism uses igraph's dispatcher,
which selects tiny-graph tables, Bliss, or VF2 as appropriate. Sage.js checks
capabilities before using the other kernels and retains exact pure-Python
fallbacks.

## Reproducible source acquisition

igraph 1.0.1 is pinned by SHA-256. The canonical download is the
`native-sources-1` release of `sagemathinc/sagejs`; the official igraph GitHub
release is a fallback. Set `SAGEJS_IGRAPH_TARBALL` to use a verified local
archive. This cache policy avoids making source builds depend on the lifetime
or TLS configuration of an academic project website.

Build and test it with:

```sh
pnpm --dir packages/graph build
pnpm --dir packages/graph test
```

The package is not a public API. Its coarse data boundary is intended to make
other native engines, including OGDF for advanced layout, independently
replaceable later.
