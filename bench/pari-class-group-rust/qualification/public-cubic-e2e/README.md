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
of the admitted cubic path. Large small-surplus presentations use the bounded
compact verifier, including mixed invariant factors; unsupported shapes fail
explicitly rather than falling back to an impractical dense transform. Under
the frozen V2 request schema, compact invariant width is capped by
`maximumCompactGenerators`, map storage and fixed Smith-buffer storage by
`maximumNormalFormEntries` (the latter measured in machine-word slots), map
coefficient size by `maximumCompactTargetCoefficientBits`, and general Smith
transform work by `maximumNormalFormOperations`. Thus the new verifier has no
implicit resource defaults and old V2 request bytes retain their exact meaning.
When the analytic index alone is not isolated, one stateful collector advances
through the fixed answer-free supplementary targets `7, 8, 9, 10, 12, 16`,
bounded by the request's cumulative relation, dependency, ideal, and candidate
ceilings. Only that analytic outcome permits another target; authentication,
resource, programming, or proof failures stop immediately. Successful
multi-target receipts include redacted continuation counters but never failed
class numbers or invariant factors.
The sealed result
retains its authenticated presentation map for subsequent arbitrary-ideal operations.
The receipt's stage clocks end when the sealed mathematical result is
constructed; JSON projection and serialization are excluded, matching the
PARI public-call control's exclusion of result getters.

Run the regression tests with:

```sh
cargo test --release --manifest-path \
  bench/pari-class-group-rust/qualification/public-cubic-e2e/Cargo.toml
```

## Frozen native benchmark

The clean frozen-source campaign at commit `749e892fe` records 15 alternating
Rust/PARI pairs per field on one pinned AMD EPYC 7B13 core. Every result was
checked exactly before its timing was accepted. Median public-kernel times are:

| Field | Rust | PARI 2.17.4 | Rust / PARI |
| --- | ---: | ---: | ---: |
| `x^3-x-1` | 23.239 ms | 2.100 ms | 11.07x |
| `x^3-8*x^2-30*x-29` | 41.219 ms | 2.508 ms | 16.43x |
| row-6 continuation cubic | 6.328 s | 3.988 s | 1.587x |

For row 6, the Rust stage medians are 58.2 ms preparation, 2.723 s relation
collection, 2.097 s candidate authentication, and 1.440 s unit/analytic
completion. Thus the original approximately 16x row-6 gap is closed under the
predeclared 2x native criterion, while tiny-field latency remains an explicit
failure. Two clean builds produced the same 21,613,992-byte release executable
with SHA-256 `4cd46043fe8ba9c3d536953daab672c16f4c05722da87cabd33a1eb598a9aba2`.
The complete raw samples, build logs, source closure, PARI identity, and stage
medians are in `benchmark/receipt.json`.

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
