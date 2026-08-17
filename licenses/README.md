# Third-party notices

The Sage.js language compiler descends from RapydScript-ng, JPython, and
PyLang. Those portions retain their original copyright notices and BSD license
terms; see `PYLANG-BSD-3-CLAUSE.txt` and individual source headers.

The combined Sage.js distribution is released under GPL-3.0-only.

The optional graph addon statically links the GPL-2.0-or-later igraph 1.0.1
library and its bundled Bliss implementation; see `IGRAPH-GPL-NOTICE.md`.

The native mathematics addon statically links OpenBLAS; see
`OPENBLAS-BSD-3-CLAUSE.txt` for its required copyright and license notice.

The generated distribution bundles the MIT-licensed `numpy-ts`, Cortex
Compute Engine, `tree-sitter-magma`, `tree-sitter-wolfram`, and
`tree-sitter-matlab` backends, plus the MIT-licensed
`tree-sitter-macaulay2` grammar; see `NUMPY-TS-MIT.txt`,
`CORTEX-COMPUTE-ENGINE-MIT.txt`, `TREE-SITTER-MAGMA-MIT.txt`,
`TREE-SITTER-WOLFRAM-MIT.txt`, `TREE-SITTER-MATLAB-MIT.txt`, and
`TREE-SITTER-MACAULAY2-MIT.txt`.

The Jupyter kernel bundles the MIT-licensed `zeromq.js` binding and its
MPL-2.0 `libzmq` binary; see `ZEROMQ-JS-MIT.txt` and
`LIBZMQ-MPL-2.0-NOTICE.txt`. The libzmq source corresponding to the shipped
binary is available from the upstream link recorded in that notice.

The mathematical library embeds a generated 15,000-row prefix of SageMath's
Odlyzko zeta-zero database; see `ODLYZKO-ZETA-NOTICE.md`.

The optional native mathematics addon links Andrew Sutherland's
[`smalljac` 4.1.3](https://math.mit.edu/~drew/smalljac.html) and its
[`ffpoly` 1.2.7](https://math.mit.edu/~drew/ffpoly.html) dependency.
`smalljac`'s upstream README licenses the software under GPL version 2 or
later and asks research users to cite Kiran Kedlaya and Andrew Sutherland,
“Computing L-series of hyperelliptic curves,” ANTS VIII (2008), 312–326.
The dependency build records the exact upstream URLs, versions, and SHA-256
digests used to produce the linked addon. The combined Sage.js distribution
is conveyed under GPL-3.0-only.

The native mathematics addon also compiles a patched source closure from John
Cremona's eclib for elliptic-curve 2-descent. See `ECLIB-GPL-NOTICE.md` for the
exact revision, source and patch locations, and GPL-2.0-or-later notice. The
combined Sage.js distribution is conveyed under GPL-3.0-only.
