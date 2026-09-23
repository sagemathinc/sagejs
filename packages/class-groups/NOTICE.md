# Sage.js class-groups distribution notice

This package contains original Sage.js work, behavioral reimplementations,
and source translations or close adaptations. Copyright remains with the
respective authors and contributors. In particular, translated and adapted
class-group routines retain attribution to the PARI Group and to the named
authors in the pinned PARI/GP 2.17.4 source distribution.

This is a release-review input, not legal advice or approval. The machine
inventory deliberately keeps `legal_conclusion` false. A distributor must
derive an SBOM from the exact artifact, select the notices that actually
apply, provide all required complete license texts and copyright notices,
and obtain human/legal approval before conveying an artifact.

## First-party and PARI-derived source

- `packages/class-groups/Cargo.toml` declares `GPL-2.0-or-later`.
- The Sage.js repository declares `GPL-3.0-only` in the repository `LICENSE`.
- `packages/class-groups/provenance.json` identifies every production source
  module, its byte hash, its provenance class, and function-level
  correspondence with the pinned PARI sources where applicable.
- The PARI source identity is PARI/GP 2.17.4. Its checked source files,
  license files, symbols, line ranges, and hashes are recorded in
  `provenance.json`.

No statement above decides the licensing of a particular combined artifact.
That determination, including GPL version compatibility and the scope of
complete corresponding source, remains a release-review task.

## Rust registry dependencies

The exact registry package names, versions, checksums, declared license
expressions, and repositories are recorded under `cargo_packages` in
`provenance.json` and locked by `Cargo.lock`. The current closure includes:

- MIT or Apache-2.0 packages: `az`, `block-buffer`, `cfg-if`, `cpufeatures`,
  `crypto-common`, `digest`, `itoa`, `libc`, `proc-macro2`, `quote`, `serde`,
  `serde_core`, `serde_derive`, `serde_json`, `sha2`, `syn`, `typenum`,
  `version_check`, `windows-link`, and `windows-sys`;
- MIT packages: `generic-array`, `libm`, and `zmij`;
- Unlicense or MIT: `memchr`;
- MIT or Apache-2.0 plus Unicode-3.0 data terms: `unicode-ident`;
- LGPL-3.0-or-later packages: `rug` and `gmp-mpfr-sys`.

The release bundle must preserve the applicable crate license and notice files
from the exact registry archives authenticated by the lockfile. Repository
URLs are provenance references, not substitutes for those files.

## Native arithmetic closure

Two prospective arithmetic routes are recorded. An artifact SBOM must say
which route and which copies were actually linked.

1. The ordinary Cargo route uses `rug` and `gmp-mpfr-sys` 1.7.1. That crate
   bundle contains its GMP 6.3.0 and MPFR 4.2.2 source trees. The crates.io
   checksum in `Cargo.lock` authenticates the crate archive; no independent
   upstream digest is asserted for its potentially prepared source trees.
2. The `flint-normal-form` route statically links the repository's pinned GMP
   6.3.0, MPFR 4.2.2, FLINT 3.6.0, and OpenBLAS 0.3.33 builds. Exact source
   URLs and SHA-256 values are recorded in `provenance.json` and in the native
   dependency build declarations.

FLINT 3.6.0 incorporates Arb. The bridge includes FLINT's `arb.h` and
`arb_calc.h`, and there is no separately linked `libarb`. Arb is therefore
listed as an incorporated component of the exact FLINT archive, without
inventing a separate artifact or license conclusion. A reviewer must confirm
and reproduce every applicable FLINT/Arb notice from that archive.

OpenBLAS is in the prospective static link closure even though the class-group
bridge does not call it directly. Its BSD-3-Clause notice is maintained at
`licenses/OPENBLAS-BSD-3-CLAUSE.txt` in the repository and must accompany any
artifact that actually contains it.

## Corresponding source and relinking

The concrete source and relink checklist is in
`LICENSES/SOURCE-AND-RELINK.md`. At minimum, a reviewed distribution process
must preserve:

- this package source and the exact Sage.js source needed to build it;
- the pinned PARI 2.17.4 source and license material named by the
  correspondence ledger;
- every registry crate archive in the resolved Cargo graph;
- every foreign-library source archive or prepared source tree actually used;
- patches, generated inputs, build scripts, toolchain identities, linker
  scripts, flags, feature selections, and installation information; and
- if a statically linked LGPL route is distributed, the exact relinkable
  materials and tested instructions selected by the release reviewer.

The current repository has not produced or tested that final source/relink
bundle. It must not be represented as complete merely because source URLs are
listed here.

## Review state

Still required before distribution:

1. human/legal review of license compatibility, notice text, and obligations;
2. an artifact-derived SBOM for each native, Windows, and WebAssembly output;
3. verification that the SBOM matches `Cargo.lock`, native build receipts, and
   this inventory, including absence of unintended duplicate GMP/MPFR copies;
4. a complete corresponding-source archive with durable publication policy;
5. a tested, artifact-specific LGPL relinking procedure or another approved
   compliance mechanism; and
6. review approval recorded independently of this file and of agent output.
