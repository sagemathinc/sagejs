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
capabilities. The mathematical API is host-independent and contains no Node,
Python, or filesystem dependency. `service.rs` adds the shared bounded product
protocol; the `class-group-service` binary provides newline-delimited native
transport, and `reactor.rs` exposes the same protocol to a checked Wasm host.
Artifact authentication, cancellation by worker termination, and public Sage
objects remain host responsibilities. A private legacy qualification parser is
temporarily retained for source identity; it is not exported by this package.

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
set `SAGEJS_FLINT_PREFIX` to the authenticated installation, then run:

```bash
packages/class-groups/scripts/cargo-native.sh test --locked \
  --manifest-path packages/class-groups/Cargo.toml
```

The wrapper deliberately places that installation's headers and libraries on
the GMP/MPFR system-library probe path. This makes Rug and FLINT resolve to the
same allocator domain; direct Cargo builds that accidentally select another
GMP are not a supported product build. `scripts/build-native.sh` additionally
performs a link-closure sentinel check.

`scripts/build-wasm.sh` consumes the authenticated Sage.js WASI toolchain and
emits `dist/class-group-core.wasm`. Its link flags enforce one non-shared memory
with an initial 16 MiB and maximum 256 MiB; the product loader independently
revalidates those limits before instantiation.

The service protocol is ABI 1 and uses one JSON document per native line or
Wasm call. Requests and responses carry bounded caller IDs. The operations are
`capability`, `open`, `summary`, `query`, `publication`, and `close`; all
operations after `open` bind both its generation and opaque decimal handle.
`summary` returns only the sealed field/class-group binding, invariants, and
canonical exact generator-ideal lattices, avoiding the detached relation graph
carried by `publication`. An invalid, closed, or stale handle fails with the
typed `unknown-handle` category.
