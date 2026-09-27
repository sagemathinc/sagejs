# Standalone imaginary-quadratic core (development candidate)

This crate compiles the same `packages/class-groups/src/imaginary.rs` source as
the existing class-group service, but does not include the cubic algorithms or
their GMP, MPFR, and FLINT dependency closure. Its narrow service accepts only
bounded unconditional imaginary-quadratic class-number and complete class-group
requests. It retains the ordinary exact ideal-class map and the `core-v2`
packed transport, with the existing class-group Wasm ABI. The development-only
`core-v3` transport sends the sorted `(a, b, coordinates...)` map once instead
of also sending a second array of every reduced form. Its certificate marks
the reduced-form list as derived from that map: the public verifier still
checks every reduced primitive form, map order, coordinate bijection, and
generators, and ordinary certificate records are materialized on demand.
The source algorithm still proves completeness by its exact reduced-form count
and orbit construction; the duplicate `core-v2` certificate array was not an
independent host-side enumeration.

The crate is **not** in the production Wasm layout. The reactor now keeps
request and response buffers in a bounded owned-allocation table, checks the
exact pointer, generation, length, and request kind before reading, and rejects
forged or stale handles without dereferencing them. A raw-ABI regression
exercises address reuse as well as these failure cases, but an independent
byte-bound safety review and
source/license/notice review remain required before any distribution decision.
Building it does not satisfy those gates.
See [DISTRIBUTION-REVIEW.md](DISTRIBUTION-REVIEW.md) for the exact candidate
inventory and the independent decisions required before production staging.

For local verification, run:

```sh
cargo test --locked --manifest-path packages/imaginary-quadratic-core/Cargo.toml
sh packages/imaginary-quadratic-core/scripts/build-wasm.sh
node --test packages/flint-wasm/test/quadratic-core-product.test.mjs
pnpm build:wasm
node --test packages/flint-wasm/test/quadratic-core-evaluator.test.mjs
```

The service contract test covers the frozen 11-field quadratic panel, including
each packed form and coordinate against the ordinary exact map. The build uses
the repository's authenticated Wasm toolchain and writes only under this
package's ignored `target/` directory. The resulting module can be passed to
`instantiateClassGroupCore` for direct development testing; it is not staged
by the release packager. The evaluator test explicitly injects that local
module into an isolated Sage-mode evaluator, checking exact ideal coordinates
and `core-v3` transport; the ordinary public Wasm kernel still declines the
unreviewed reactor.
