# Native source cache

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

The FLINT addon additionally downloads an immutable GitHub archive of eclib
commit `8dca7f18acedf7c2283a5d0e689c269f8258c981`, verifies its SHA-256 digest,
and applies the tracked FLINT-only rank patch. GitHub's commit-addressed source
is the canonical location; `SAGEJS_ECLIB_TARBALL` supports an independently
obtained local copy for offline and release builds.
