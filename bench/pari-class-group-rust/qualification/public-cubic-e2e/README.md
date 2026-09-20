# Public cubic end-to-end qualification

This isolated executable attempts the strongest genuine route currently
available through the Rust class-group library's public API:

```text
public polynomial coefficients
  -> squarefree-discriminant maximal cubic preparation
  -> maximal-order factor base and PARI-style relation collection
  -> exact Smith candidate invariants
  -> fail closed
```

The stdin request is closed: it accepts only four polynomial coefficients, a
proof mode, and preparation/collection resource limits. It has no field for a
PARI object, prepared-field fixture, discriminant, basis, expected invariants,
class number, or other field answer. Unknown fields are rejected.

The process exits with status 2 after printing an `incomplete` receipt even
when every available stage succeeds. This is deliberate. The public library
does not export a function that turns a `ValidatedPreparedCubic` and proof
policy into a proof-authorized complete class-group result. In particular, the
available Smith result remains a presentation candidate: no exported unified
route supplies completeness evidence, generator ideals and order witnesses,
or an arbitrary-ideal class map with principal quotient witnesses. The more
complete class-and-unit assembly in `row6-candidate/src/main.rs` is executable-
local qualification code, not a callable public library API.

Run the regression tests with:

```sh
cargo test --release --manifest-path \
  bench/pari-class-group-rust/qualification/public-cubic-e2e/Cargo.toml
```

Run the executable with:

```sh
cargo run --release --manifest-path \
  bench/pari-class-group-rust/qualification/public-cubic-e2e/Cargo.toml <<'EOF'
{
  "schema": "sagejs.rust-class-group/public-cubic-e2e-request-v1",
  "polynomialAscending": ["-1", "-1", "0", "1"],
  "proofMode": "conditional-grh",
  "resources": {
    "maximumTrialDivisor": 10000,
    "maximumIrreducibilityPrime": 257,
    "embeddingPrecisionBits": 192,
    "maximumVisitedIdeals": 10000,
    "maximumCandidates": 10000
  }
}
EOF
```
