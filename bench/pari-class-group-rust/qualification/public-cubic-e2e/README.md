# Public cubic end-to-end qualification

This isolated executable attempts the strongest genuine route currently
available through the Rust class-group library's public API:

```text
public polynomial coefficients
  -> exact bounded discriminant factorization
  -> exhaustive cubic p-power superlattice search through the discriminant bound
  -> replay-validated maximal-order basis and multiplication table
  -> maximal-order factor base and PARI-style relation collection
  -> exact transform-bearing Smith map, or a small-surplus compact quotient proof
  -> full external principal replay, or revalidation of a collector-sealed transcript
  -> exact candidate generator-order relation witnesses
  -> exact dependency lattice and compact unit reconstruction
  -> directed regulator enclosure
  -> Belabas--Friedman class/unit index-one enclosure
  -> Belabas--Diaz y Diaz--Friedman factor-base generation inequality
  -> sealed GRH-conditional complete result
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

The process exits successfully only after the typed library completion phase
has isolated class/unit index one and certified factor-base generation under
the two hypotheses named in the receipt. Unconditional mode and exhausted
resources fail closed. Exact maximal-order index-prime decomposition is part
of the admitted cubic path. Large elementary-2 presentations use the bounded
compact verifier; unsupported large quotient structures fail explicitly
rather than falling back to an impractical dense transform. The sealed result
retains its authenticated presentation map for subsequent arbitrary-ideal operations.
The receipt's stage clocks end when the sealed mathematical result is
constructed; JSON projection and serialization are excluded, matching the
PARI public-call control's exclusion of result getters.

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
  "schema": "sagejs.rust-class-group/public-cubic-e2e-request-v2",
  "polynomialAscending": ["-1", "-1", "0", "1"],
  "proofMode": "conditional-grh",
  "resources": {
    "maximumTrialDivisor": 10000,
    "maximumIrreducibilityPrime": 257,
    "embeddingPrecisionBits": 192,
    "maximumVisitedIdeals": 10000,
    "maximumCandidates": 10000,
    "maximumNormalFormEntries": 10000000,
    "maximumNormalFormOperations": 50000000,
    "maximumRelationExponent": 256,
    "maximumVerificationMultiplyAdds": 100000000,
    "maximumPrincipalFactorTerms": 10000000,
    "maximumCompactGenerators": 16384,
    "maximumCompactSurplusRows": 32,
    "maximumCompactSaturationMinorTrials": 32768,
    "maximumCompactDependencyEntries": 1000000,
    "maximumCompactTargetCoefficientBits": 1000000,
    "logarithmPrecisionBits": 1024,
    "replayPrecisionBits": 512,
    "analyticPrecisionBits": 256,
    "maximumRelations": 10000,
    "maximumDependencies": 1000,
    "maximumKernelCoefficientBits": 4080,
    "maximumUnitExponentBits": 8192,
    "maximumReconstructionDenominatorBits": 4096,
    "maximumAnalyticThreshold": 23994
  }
}
EOF
```
