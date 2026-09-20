# Public cubic end-to-end qualification

This isolated executable attempts the strongest genuine route currently
available through the Rust class-group library's public API:

```text
public polynomial coefficients
  -> exact bounded discriminant factorization
  -> exhaustive cubic p-power superlattice search through the discriminant bound
  -> replay-validated maximal-order basis and multiplication table
  -> maximal-order factor base and PARI-style relation collection
  -> exact Smith candidate invariants
  -> fail closed
```

The stdin request is closed: it accepts only four polynomial coefficients, a
proof mode, and preparation/collection resource limits. It has no field for a
PARI object, prepared-field fixture, discriminant, basis, expected invariants,
class number, or other field answer. Unknown fields are rejected.

Preparation is fail-closed. Coefficient size, factorization, irreducibility
witness search, overorder prime size, and total overorder enumeration are
bounded. The route supports nontrivial equation-order index when complete
local superlattice exhaustion fits the bounds; it does not infer maximality
from an index-p fixed point, a probable-prime test, or a retained
PARI/prepared-field fixture. `certificateVerified` means the polynomial,
factorization/primality proof, local exhaustion transcript, exact basis and
multiplication table, discriminant/index, and prepared-field validation were
all recomputed and matched.

This exhaustive HNF route is a bounded qualification implementation. A
proof-carrying Round-2 implementation remains the intended scalable production
route for larger discriminant valuations and overorder primes.

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
