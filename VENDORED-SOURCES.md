# Vendored sources

## Python widget runtime

Sage.js ships the ordinary, unmodified Python runtime sources from
`traitlets` 5.15.1, `comm` 0.2.3, and `ipywidgets` 8.1.9 under `src/lib`.
The exact tags, Git revisions, wheel digests, licenses, and protocol roles are recorded in
`upstream-tests/ipywidgets/manifest.json`; the shared BSD 3-Clause notice is
in `licenses/JUPYTER-WIDGETS-BSD-3-CLAUSE.txt`, with the ipywidgets source
distribution's complete bundled notice in
`licenses/IPYWIDGETS-BSD-3-CLAUSE-NOTICE.txt`. Tests and documentation from
the upstream distribution remain in the conformance corpus rather than the
production module tree.

These sources are compiled by the normal Sage.js Python compiler. They are
not translated forks and must stay byte-identical to the selected upstream
release unless a divergence is explicitly documented.

## Native source cache

Sage.js source builds must be reproducible even when a small academic project
moves, disappears, or temporarily serves an invalid TLS certificate. Native
dependency build scripts therefore record, for every archive:

- an exact upstream version;
- a SHA-256 digest;
- a canonical Sage.js cache URL;
- the authoritative upstream release as a fallback when it is reliable; and
- an environment variable for a local, independently obtained archive.

The cache is the GitHub release
[`native-sources-1`](https://github.com/sagemathinc/sagejs/releases/tag/native-sources-1).
It contains unmodified upstream release archives, not Sage.js forks. A cache
download is accepted only when it matches the digest in the corresponding
`build-deps.cjs`, so control of the cache cannot silently change build input.

Current cached archives are ffpoly 1.2.7, smalljac 4.1.3, and igraph 1.0.1.
The igraph archive contains the exact Bliss and VF2 implementations used by
the graph addon, so builds do not fetch either algorithm from an academic site.
The original upstream URL remains beside the cache URL in source. New native
dependencies should follow this policy when their canonical distribution is
not at least as durable as a major forge release.

Changing an archive requires a normal reviewed source commit updating its
version and checksum. Do not replace a release asset under an existing name
without also changing the recorded digest and explaining why.

## msolve Gröbner source slice

`packages/flint/vendor/msolve` contains the reviewed C source closure for
msolve's packed prime-field F4 and modular rational Gröbner-basis exports. It
is pinned to msolve 0.10.1-14-g1e3af01 at commit
`1e3af01f3864f6c848814b02a450f384c108adea` under GPL-2.0-or-later. The
source receipt records the selected directories, aggregate source hash,
license file, and complete Sage.js portability/safety patch ledger;
`packages/flint/scripts/verify-msolve-source.cjs` verifies that receipt.

The CLI, root-solving interface, and unrelated msolve surface are not exposed.
Both the Node addon and production Wasm compile this one source closure against
Sage.js's existing FLINT/GMP prefix. Any vendored source change invalidates the
native addon build identity and must update the receipt and its patch ledger.

The FLINT addon additionally downloads an immutable GitHub archive of eclib
commit `8dca7f18acedf7c2283a5d0e689c269f8258c981`, verifies its SHA-256 digest,
and applies the tracked FLINT-only rank patch. GitHub's commit-addressed source
is the canonical location; `SAGEJS_ECLIB_TARBALL` supports an independently
obtained local copy for offline and release builds.
