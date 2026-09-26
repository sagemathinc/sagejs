# Imaginary-quadratic Wasm distribution review boundary

This is an engineering inventory for human release review, **not** a legal
conclusion, an artifact-derived SBOM, or authorization to distribute the
reactor. The production Wasm layout still excludes it.

## Exact source route

`src/lib.rs` includes `../../class-groups/src/imaginary.rs` by source path. The
standalone crate compiles that shared, first-party reduced-form mathematics
with only its own `src/service.rs` and `src/reactor.rs`. Its `Cargo.toml` has
three direct Rust dependencies: `serde`, `serde_json`, and `smallvec`. The
locked transitive package set additionally includes `serde_core`,
`serde_derive`, `proc-macro2`, `quote`, `syn`, `unicode-ident`, `itoa`,
`memchr`, and `zmij`. The build does not link the cubic source modules or
GMP, MPFR, FLINT, Arb, or PARI. Proc-macro packages participate in building
the source; this list alone does not prove which code is present in a final
artifact.

The package and shared mathematical source declare `GPL-2.0-or-later`; the
Sage.js repository declares `GPL-3.0-only`. Registry metadata reports
permissive expressions for the listed crates, including
`(MIT OR Apache-2.0) AND Unicode-3.0` for `unicode-ident`. These are
declarations to review, not a compatibility or notice-sufficiency finding.
Use the exact crate archives, license files, notices, Cargo lockfile,
toolchain, and final artifact for that review.

## Reactor boundary

The current `wasm32-wasip1` artifact defines one non-shared memory with 256
initial and 4096 maximum pages. It imports only the observed WASI Preview 1
environment/output/exit functions. The JSON request limit is 1 MiB and the
response limit 16 MiB. The exported allocation ABI retains request and
response vectors in a safe-Rust ownership table: it caps outstanding entries
and capacity, requires an exact live pointer/length pair before dropping an
allocation, and accepts only a live request-kind allocation of the exact
length before reading request bytes. The raw-ABI test covers forged,
wrong-length, wrong-kind, and immediately stale pointers, plus the allocation
count bound. It does not replace independent safety review, including review
of memory exhaustion, reentrancy, Wasm host isolation, and every exported ABI.

Reproduce the current development checks from the repository root:

```sh
cargo test --locked --manifest-path packages/imaginary-quadratic-core/Cargo.toml
sh packages/imaginary-quadratic-core/scripts/build-wasm.sh
node --test packages/flint-wasm/test/quadratic-core-product.test.mjs \
  packages/flint-wasm/test/quadratic-core-evaluator.test.mjs
cargo metadata --locked --format-version 1 \
  --manifest-path packages/imaginary-quadratic-core/Cargo.toml
cargo tree --locked --target wasm32-wasip1 --edges normal \
  --manifest-path packages/imaginary-quadratic-core/Cargo.toml
```

The evaluator test injects the development artifact and exercises exact
ideal-class coordinates; the ordinary distributed Wasm kernel still declines
it. The frozen 11-field 15-pair development comparison is documented under
`bench/pari-class-group-rust/qualification/public-quadratic-boundary/benchmark/`.
That diagnostic remains several times slower than PARI at the Sage-mode
boundary and omits outer worker IPC. It is not a release performance receipt.

## Required before production staging

1. Review the exact source/license/notice closure and artifact-derived SBOM,
   including the final target and build features; make and record the human
   legal conclusion. The shared cubic package's existing pending conclusion
   does not authorize this standalone artifact.
2. Independently review the reactor and host ABI safety properties above,
   including raw-pointer misuse and fail-closed allocation exhaustion.
3. Assemble corresponding source, dependency archives, applicable notices,
   toolchain/build inputs, and reproducible artifact-to-source evidence for
   the exact bytes to be shipped. Decide any source-delivery or relinking
   obligations rather than inferring them from this inventory.
4. Update the production layout and its distribution gate only after those
   reviews. Then run Node, browser, platform, and complete ideal-map tests on
   the staged artifact, including forged-publication tests and arbitrary
   ideal-class queries.
5. Rebenchmark the **public** Wasm path with the frozen diverse panel and
   pinned PARI policy, including worker IPC, before making a competitiveness
   claim. Keep the unconditional proof and exact maps in that boundary.
