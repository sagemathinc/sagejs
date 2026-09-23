# Rust registry dependency notices

`../Cargo.lock` is the identity authority for registry versions and checksums;
`../provenance.json` records the resolved package license expressions and
repositories. A release must derive the actual package closure with locked
Cargo metadata, compare it with that inventory, and copy license/notice files
from the authenticated crate archives.

The present license families are:

- MIT and/or Apache-2.0;
- MIT;
- Unlicense or MIT (`memchr`);
- MIT or Apache-2.0 plus Unicode-3.0 (`unicode-ident`); and
- LGPL-3.0-or-later (`rug` and `gmp-mpfr-sys`).

The precise package list is intentionally not duplicated here; the structured
inventory is canonical and fails closed against `Cargo.lock`. Any added,
removed, or version-changed crate requires regenerated metadata, fresh notice
selection, and artifact-SBOM review.

`rug` is a Rust interface over GMP/MPFR and `gmp-mpfr-sys` is both a Rust
registry dependency and a potential source/build vehicle for those native
libraries. Their crate notices do not replace the GMP and MPFR notices or the
static-link/relink review described in `SOURCE-AND-RELINK.md`.
