# Native arithmetic source routes

The exact prospective routes are structured in `../provenance.json`.

## Cargo default route

`rug` 1.30.0 resolves `gmp-mpfr-sys` 1.7.1. Its authenticated crate bundle
contains prepared GMP 6.3.0 and MPFR 4.2.2 source trees. The crate checksum
authenticates the whole registry archive. This inventory does not claim that
those prepared trees are byte-identical to separate upstream archives.

## Repository FLINT route

With `flint-normal-form`, `build.rs` links the repository's pinned static
libraries:

| Component | Version | SHA-256 of source archive | Recorded license |
| --- | --- | --- | --- |
| GMP | 6.3.0 | `a3c2b80201b89e68616f4ad30bc66aee4927c3ce50e33929ca819d5c43538898` | LGPL-3.0-or-later OR GPL-2.0-or-later |
| MPFR | 4.2.2 | `b67ba0383ef7e8a8563734e2e889ef5ec3c3b898a01d00fa0a6869ad81c6ce01` | LGPL-3.0-or-later |
| FLINT | 3.6.0 | `b95e2c7792f5eea4a1c8d2d42c4098434756832e57a094b295eb5dfdc9b4c36b` | LGPL-3.0-or-later |
| OpenBLAS | 0.3.33 | `6761af1d9f5d353ab4f0b7497be2643313b36c8f31caec0144bfef198e71e6ab` | BSD-3-Clause |

Arb is incorporated in the recorded FLINT 3.6.0 source distribution and is
used through FLINT headers. There is no separate Arb link item. A reviewer
must inspect the exact FLINT archive and preserve its applicable Arb notices;
this document deliberately does not invent a separate Arb license expression.

The bridge does not call OpenBLAS directly, but the repository FLINT build
places it in the prospective static link closure. The actual artifact SBOM,
not reachability assumptions, decides whether its BSD notice applies.

## Unresolved release questions

- whether an artifact contains the Cargo-bundled GMP/MPFR copy, the repository
  native copy, or both;
- whether the generated native and Wasm artifacts have identical closures;
- which LGPL compliance mechanism the distributor will use for each static
  artifact; and
- whether every required source, notice, build input, and relink material is
  present and reproducible.
