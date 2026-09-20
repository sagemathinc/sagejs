# Principal factor-base relation lifts

This qualification-only crate closes the narrow right-inverse gap in the
compact row6 class view. Given the real `prepared-cubic-class-unit-v2`
relation presentation and its `compact-presentation-certificate-v1`, a query
for factor-base row `j` either:

- returns sparse relation coefficients `c` and independently replays
  `c * R = e_j`; or
- rejects the query when the exact compact class map gives `e_j` a nonzero
  residue, proving that row nonprincipal.

Loading evidence is fail-closed. The crate replays every relation against the
class map, every integral left-kernel dependency, the projected determinant,
and every exhibited saturation minor. It then recomputes the 1,130-square
determinant and full lattice index with the isolated FLINT small-surplus
routine before accepting the certificate. The same retained exact
factorization computes a query lift; separate sparse Rust code replays the
answer against all 1,130 columns. Producer `verified` booleans are ignored.

## Real row6 replay

Generate the actual answer-free row6 presentation and compact certificate:

```sh
ROW6=bench/pari-class-group-rust/qualification/row6-candidate
$ROW6/target/release/sagejs-row6-rust-candidate-diagnostic \
  small-norm-unit-kernel-prepared \
  $ROW6/inputs/row6-neutral-prepared-field.json 2000 5000000 \
  > /tmp/row6-prepared-v2.json

COMPACT=bench/pari-class-group-rust/qualification/candidate
$COMPACT/target/release/sagejs-rust-class-group-compact-certificate \
  /tmp/row6-prepared-v2.json > /tmp/row6-compact-certificate.json
```

Then query a principal factor-base row (row 0 in the recorded row6 run):

```sh
cargo run --release \
  --manifest-path bench/pari-class-group-rust/qualification/principal-relation-lift/Cargo.toml \
  -- /tmp/row6-prepared-v2.json /tmp/row6-compact-certificate.json 0
```

Querying row 4 of the same evidence exits nonzero because its exact class
residue is nonzero. The replay performed on 2026-09-20 used the actual
`1137 x 1130` row6 matrix, group `C2 x C2`, seven saturated dependencies, 282
principal factor-base rows and 848 nonprincipal rows. The generated input and
certificate SHA-256 digests were respectively
`99a848722b9dfd13d938a036a20fce9152caf601bfd37c8927f211d3d3b8ea8e` and
`ce85dcbcfdae9e73f6fe789f8712c463765295c7f41749c0d6950f53127cfaf2`.

Run focused counterfeit tests with:

```sh
cargo test \
  --manifest-path bench/pari-class-group-rust/qualification/principal-relation-lift/Cargo.toml
```

The ignored integration test exercises the real row6 files, including a
counterfeit dependency:

```sh
SAGEJS_ROW6_PREPARED_V2=/tmp/row6-prepared-v2.json \
SAGEJS_ROW6_COMPACT_CERTIFICATE=/tmp/row6-compact-certificate.json \
cargo test \
  --manifest-path bench/pari-class-group-rust/qualification/principal-relation-lift/Cargo.toml \
  --test row6_evidence -- --ignored
```

## Exact remaining boundary

This crate accepts only a vector already expressed on the authenticated
factor base (the single row `e_j` in this interface). It has no evidence that
reduces an arbitrary number-field ideal to a factor-base exponent vector, and
therefore cannot provide arbitrary-ideal discrete logarithms or principal
generators. The missing boundary is an independently replayable ideal
reduction certificate `I * (alpha)^-1 = product(P_j^x_j)` (with authenticated
ideal arithmetic and the exponent vector `x`); only after that reduction can
this relation-lift qualification be applied.
