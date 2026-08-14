# Third-party notices

The Sage.js language compiler descends from RapydScript-ng, JPython, and
PyLang. Those portions retain their original copyright notices and BSD license
terms; see `PYLANG-BSD-3-CLAUSE.txt` and individual source headers. The
Pyjeon/PyLang `math.py` and `random.py` standard-library lineage is separately
Apache-2.0 licensed; see `PYJEON-STDLIB-APACHE-2.0-NOTICE.md` and
`APACHE-2.0.txt`.

The combined Sage.js distribution is released under GPL-3.0-only.

`THIRD-PARTY.json` is the machine-readable release authority for embedded
dependencies. It binds every entry to an exact version and source digest (or
the release commit for vendored source) and binds every referenced notice to
its SHA-256. Release acceptance fails if that inventory or any notice is
missing from the archive.

Each SEA executable embeds Node.js 26.7.0. Its complete upstream license and
bundled third-party terms are in `NODE-26.7.0-LICENSE.txt`; the inventory binds
the exact builder authority for each platform. Linux builders use the pinned
Node source archive; macOS and Windows use the pinned official binary archive.

The optional graph addon statically links the GPL-2.0-or-later igraph 1.0.1
library and its bundled Bliss implementation; see `IGRAPH-GPL-NOTICE.md`.

The native GMP, MPFR, MPC, FLINT, M4RI, FFLAS-FFPACK, Givaro, OpenBLAS,
smalljac, and ffpoly terms and source identities are summarized in
`NATIVE-MATHEMATICS-NOTICE.md`. Complete GPL-2.0, LGPL-2.1, LGPL-3.0, and
CeCILL-B texts are shipped alongside it.

The native mathematics addon statically links OpenBLAS; see
`OPENBLAS-BSD-3-CLAUSE.txt` for its required copyright and license notice.

The generated distribution bundles the MIT-licensed `numpy-ts`, Cortex
Compute Engine, `tree-sitter-magma`, `tree-sitter-wolfram`, and
`tree-sitter-matlab` backends, plus the MIT-licensed
`tree-sitter-macaulay2` grammar; see `NUMPY-TS-MIT.txt`,
`CORTEX-COMPUTE-ENGINE-MIT.txt`, `TREE-SITTER-MAGMA-MIT.txt`,
`TREE-SITTER-WOLFRAM-MIT.txt`, `TREE-SITTER-MATLAB-MIT.txt`, and
`TREE-SITTER-MACAULAY2-MIT.txt`.

The SEA also embeds `fflate`, Playwright Core, Plotly.js, `web-tree-sitter`,
and the Python and Sage tree-sitter grammars. Their complete terms are in
`FFLATE-MIT.txt`, `PLAYWRIGHT-APACHE-2.0.txt`, `PLOTLY-MIT.txt`,
`WEB-TREE-SITTER-MIT.txt`, `TREE-SITTER-PYTHON-MIT.txt`, and
`TREE-SITTER-SAGE-MIT.txt`.

`NPM-PRODUCTION.json` and `NPM-PRODUCTION-LICENSES.txt` provide a conservative,
machine-bound license corpus for every package reported by
`pnpm licenses list --prod`. This is intentionally a superset of the modules
selected by esbuild into any one SEA and retains package-specific `NOTICE` and
third-party notice files, including both Playwright notice files.

The Jupyter kernel bundles the MIT-licensed `zeromq.js` binding and statically
linked libzmq 4.3.5 and libsodium 1.0.20. Exact source archives and vcpkg port
revisions are recorded in the inventory. The corresponding complete upstream
terms are in `LIBZMQ-4.3.5-LICENSE.txt` and
`LIBSODIUM-1.0.20-LICENSE.txt`; `MPL-2.0.txt` is the complete generic MPL 2.0
text.

The mathematical library embeds a generated 15,000-row prefix of SageMath's
Odlyzko zeta-zero database; see `ODLYZKO-ZETA-NOTICE.md`.

The path modules adapted from CPython and the Unicode 8.0 NameAliases data
embedded by the compiler are separately identified in
`CPYTHON-PATH-NOTICE.md` and `UNICODE-NAMEALIASES-NOTICE.md`; their complete
PSF and Unicode license texts are shipped beside those notices.

The optional native mathematics addon links Andrew Sutherland's
[`smalljac` 4.1.3](https://math.mit.edu/~drew/smalljac.html) and its
[`ffpoly` 1.2.7](https://math.mit.edu/~drew/ffpoly.html) dependency.
`smalljac`'s upstream README licenses the software under GPL version 2 or
later and asks research users to cite Kiran Kedlaya and Andrew Sutherland,
“Computing L-series of hyperelliptic curves,” ANTS VIII (2008), 312–326.
The dependency build records the exact upstream URLs, versions, and SHA-256
digests used to produce the linked addon. The combined Sage.js distribution
is conveyed under GPL-3.0-only.
