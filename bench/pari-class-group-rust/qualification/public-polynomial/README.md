# Rust public-polynomial cubic preparation

This qualification boundary is implemented in
`src/polynomial_preparation.rs`. It is the first Rust-owned route from public
polynomial coefficients to a replay-validated prepared maximal cubic. It does
not invoke PARI, read a prepared-field fixture, or accept field-specific
integral-basis data.

## Admitted subset

`prepare_squarefree_discriminant_monic_cubic` currently accepts an integral
monic cubic only when all of the following are established:

1. its exact cubic discriminant is nonzero;
2. reduction modulo an explicitly found rational prime is irreducible, which
   proves irreducibility over the rationals;
3. the absolute equation-order discriminant is completely and exactly
   factored; and
4. every factor occurs once.

The last condition proves that the power-basis equation order is maximal. If
`O = Z[alpha]` and `O_K` is the maximal order, then

```text
disc(O) = [O_K : O]^2 disc(O_K).
```

A squarefree `disc(O)` forces `[O_K : O] = 1`. The implementation therefore
constructs the power-basis multiplication table, derives the cubic signature
from the discriminant sign, and passes the result through the existing exact
`ValidatedPreparedCubic` replay. The retained certificate contains the full
prime factorization and has its own independent `verify()` replay.

The external integration test then passes the field to
`prepared_maximal_cubic_factor_base`. This establishes that the result is a
real input to the class-group arithmetic rather than disconnected metadata.

## Exact bounded behavior

The squarefreeness proof uses exact trial division up to a caller-supplied
limit and deterministic primality for a final `u64` cofactor. A cofactor that
cannot be proved prime or fully factored inside this envelope produces
`SquarefreenessProofLimit`. A repeated factor produces
`NonSquarefreeDiscriminant`. Neither case is treated as a maximal order.

The irreducibility-witness search is also bounded. Failure to find a witness
returns `NoIrreducibilityWitness`; it does not assert that the polynomial is
reducible. Invalid limits, nonmonic input, and zero discriminant are distinct
errors.

## What this does not establish

This is a deliberately small R4 preparation corridor. It does **not** yet:

- compute maximal orders when the equation-order discriminant is not
  squarefree (including H1, the index-three cubic, and row-6);
- expose a packaged Sage.js native or Wasm adapter;
- collect and complete a relation lattice;
- construct class generators, principality maps, units, or completion proof;
- return a public Sage.js class-group result or set `complete=True`; or
- cover degrees 2, 4, 5, and 6.

Those are separate R2--R5 gates in the qualification plan. This boundary only
removes the frozen-preparation/oracle dependency for a mathematically proved
subset of public cubics.

Run the focused evidence with:

```sh
cd bench/pari-class-group-rust
cargo test --release polynomial_preparation
cargo test --release --test public_polynomial_preparation
```
