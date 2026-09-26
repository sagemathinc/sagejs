# Standalone imaginary-quadratic core (development candidate)

This crate compiles the same `packages/class-groups/src/imaginary.rs` source as
the existing class-group service, but does not include the cubic algorithms or
their GMP, MPFR, and FLINT dependency closure. Its narrow service accepts only
bounded unconditional imaginary-quadratic class-number and complete class-group
requests. It retains the ordinary exact ideal-class map and the `core-v2`
packed transport, with the existing class-group Wasm ABI.

The crate is **not** in the production Wasm layout. Its reactor ABI still needs
a byte-bound safety review, and source/license/notice review remains required
before any distribution decision. Building it does not satisfy those gates.

For local verification, run:

```sh
cargo test --locked --manifest-path packages/imaginary-quadratic-core/Cargo.toml
sh packages/imaginary-quadratic-core/scripts/build-wasm.sh
```

The service contract test covers the frozen 11-field quadratic panel, including
each packed form and coordinate against the ordinary exact map. The build uses
the repository's authenticated Wasm toolchain and writes only under this
package's ignored `target/` directory. The resulting module can be passed to
`instantiateClassGroupCore` for direct development testing; it is not staged
by the release packager.
