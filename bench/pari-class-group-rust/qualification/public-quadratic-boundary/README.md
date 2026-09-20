# Public real-quadratic qualification boundary

This standalone crate answers the degree-2 public-route question without
editing the active Rust core. It depends on the root experiment crate and uses
only public polynomial coefficients at runtime.

For four real monic quadratics, including PARI class numbers 3 and 5, it:

1. computes the exact polynomial discriminant;
2. finds a finite-field irreducibility witness;
3. completely factors the admitted discriminant and proves it squarefree;
4. uses squarefreeness to prove that the power-basis order is maximal;
5. constructs its exact multiplication table; and
6. passes all data through the root crate's `ValidatedPreparedNumberField`.

The route then stops honestly. The first existing engine entry point is
`prepared_maximal_cubic_factor_base(&ValidatedPreparedCubic)`. There is no
degree-generic or quadratic factor-base entry point, and the following ideal
arithmetic and relation collector are also cubic-shaped. Consequently this
crate does not publish a class number, invariant factors, generators, or a
`complete` public result. Its executable reports
`unsupported-before-class-group-engine` and names the exact type boundary.
The library doctest additionally proves that passing the validated degree-2
value to the existing engine does not compile.

PARI 2.17.4 is used only by `tests/pari_differential.rs`. The checked receipt
contains PARI's exact answers so that nontrivial expected groups are visible,
but neither the library nor executable reads that receipt or invokes PARI.

Run the product-path evidence and all tests with:

```sh
cargo run --release --manifest-path \
  bench/pari-class-group-rust/qualification/public-quadratic-boundary/Cargo.toml

cargo test --release --all-targets --manifest-path \
  bench/pari-class-group-rust/qualification/public-quadratic-boundary/Cargo.toml

cargo test --release --doc --manifest-path \
  bench/pari-class-group-rust/qualification/public-quadratic-boundary/Cargo.toml
```

The differential test expects the authenticated control binary produced by
`../pari-control/build.py`.
