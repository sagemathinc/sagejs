# Corresponding-source and relink checklist

This is an engineering checklist for release review, not a conclusion that a
particular obligation applies or has been satisfied.

For every distributed class-group artifact, first produce an artifact-derived
SBOM containing the target, artifact hash, Rust features, Rust crate closure,
native imports and exports, statically linked archives, embedded source/runtime
copies, toolchain, and build receipt. Reconcile it against `Cargo.lock`,
`provenance.json`, and the native dependency declarations.

## Source bundle inputs

The reviewed bundle should contain the exact applicable versions of:

1. Sage.js and `packages/class-groups` source, including provenance and safety
   records;
2. PARI/GP 2.17.4 source and its `LICENSE`, `COPYING`, source headers, and
   notices;
3. every registry crate archive selected by `Cargo.lock`, without dropping
   bundled license or notice files;
4. the actual GMP and MPFR source trees used by `gmp-mpfr-sys`, if that route
   is present;
5. each pinned native archive actually used: GMP, MPFR, FLINT with integrated
   Arb, and OpenBLAS;
6. all local patches and generated native bridge sources;
7. build scripts, Cargo configuration, feature selection, environment inputs,
   target specifications, compiler/linker versions and flags, sysroots, linker
   scripts, and installation information needed to reproduce the artifact;
8. generated ABI manifests, export allowlists, capability manifests, and exact
   build receipts; and
9. complete applicable license texts and copyright notices.

URLs and hashes alone are not a source-delivery mechanism. Release review must
choose and document durable publication, retention, and any written-offer
policy, and must test that an independent recipient can obtain the promised
bytes.

## Static LGPL relink material

If review determines that an artifact uses a static LGPL component and that
relinkable materials are the selected compliance mechanism, preserve and test
at least:

- all non-LGPL object files or archives needed to relink the executable or
  WebAssembly module with a modified compatible LGPL library;
- the exact LGPL library source and build inputs actually used;
- generated bridge objects, symbol/export lists, linker scripts, response
  files, startup objects, sysroot identity, and final link command;
- target-specific toolchain and installation information;
- checks showing that a recipient can replace the library, relink, and run the
  package's mathematical and lifecycle tests; and
- instructions covering native and Wasm artifacts separately.

Do not assume that shipping the final static archive, Rust source, a Wasm
binary, or a source URL is sufficient relink material. Do not assert that one
platform's successful relink covers another platform or artifact shape.

## Release evidence still missing

- human/legal approval;
- artifact-derived native, Windows, and Wasm SBOMs;
- source-bundle assembly and independent reconstruction receipts;
- tested modified-library relink receipts for every applicable target; and
- an approved release record binding notices and source/relink material to the
  exact distributed hashes.
