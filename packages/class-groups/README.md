# Sage.js class-group core

This package contains the production Rust mathematical core for bounded cubic
class and unit groups. It is extracted from the qualified Sage.js/PARI 2.17.4
campaign and preserves the source provenance and GPL notices of that work.

The current supported mathematical boundary is deliberately narrow:

- monic irreducible cubic polynomials with coefficients admitted by explicit
  preparation limits;
- exact maximal-order preparation and replayable certificates;
- bounded relation collection and authenticated class-group presentations;
- GRH-conditional analytic completion, exact compact units, and regulator
  enclosures;
- bounded class coordinates for arbitrary integral ideals against a retained
  completed result.

FLINT 3.6, its integrated Arb implementation, GMP, and MPFR are required
capabilities. The production API is host-independent and contains no worker,
Node, Python, or filesystem boundary. Product request schemas, resident
handles, artifact authentication, cancellation, and workers belong in separate
host adapters. A private legacy qualification parser is temporarily retained
for source identity; it is not exported by this package.

This extraction does not promote benchmark fixtures, PARI controls, corpus
receipts, experiment CLIs, brute-force contrast collectors, or prototype Wasm
crates. Those remain qualification consumers. A small private prepared-input
module is temporarily retained because historical Row-6 qualification helpers
are interleaved with the production arbitrary-ideal reducer; it is not exposed
as a production input.

The package is `GPL-2.0-or-later`. Some collector components are translations
or behavioral reimplementations of PARI 2.17.4 and retain PARI attribution.
The linked arithmetic libraries retain their own licenses and distribution
obligations.

For a repository-native Unix build, first build `@sagemath/sagejs-flint`, or
set `SAGEJS_FLINT_PREFIX` to a compatible static installation, then run:

```bash
cargo test --manifest-path packages/class-groups/Cargo.toml
```

The Wasm build additionally requires the explicit `SAGEJS_WASI_*` toolchain
and library-prefix variables used by the Sage.js FLINT Wasm build.
