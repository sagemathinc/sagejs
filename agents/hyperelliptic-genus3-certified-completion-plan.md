# Follow-up: fast certified genus-3 local factors

## Starting point

The genus-2/3 foundation project leaves genus 3 exact and usable through the
ordinary point-count fallback. It also ships all correctness pieces needed for
a faster path:

- a portable, pinned rforest backend returning
  `det(I-T*W_p) mod p` for dense prime intervals;
- exact genus-3 Weil-candidate enumeration with no floating-point tests;
- canonical odd-degree genus-3 Jacobian arithmetic;
- exact filters from Jacobian orders, twist orders, element-order witnesses,
  and annihilation tests;
- explicit `unique`, `indeterminate`, `inconsistent`, and `resource_limit`
  outcomes.

The public local-polynomial API intentionally does not select rforest yet.
Modular residues alone leave several possible integer polynomials, and the
current Jacobian implementation does not yet provide a production-speed,
bounded certification search for every prime in a large interval.

## Recommended route

Build a Las Vegas exact-completion pipeline around the verified Sage.js
Jacobian law:

1. Use one rforest traversal to compute all good residue triples through the
   requested bound.
2. Enumerate every exact Weil candidate for each triple.
3. Sample valid Jacobian divisor classes and use exact scalar multiplication
   to eliminate candidate orders that do not annihilate them.
4. Use the quadratic twist only for rows that remain ambiguous.
5. Return a local polynomial only when exactly one exhaustive candidate
   remains. Sampling changes runtime, never correctness; unresolved rows use
   the exact reference backend.
6. Replace the first all-candidates scalar-multiplication implementation with
   the congruence-strided baby-step/giant-step search described by Sutherland
   once benchmarks show it is the bottleneck.

The group kernel should accept packed Mumford divisors and candidate-order
strides, preserve the ordinary Python implementation as its differential
fallback, and return certificates that the Python layer rechecks. It must not
copy smalljac's floating bounds, word-sized order assumptions, or fixed retry
policy.

## Competing backends to benchmark before default selection

- Harvey/Kedlaya-style exact `p`-adic point counting for one-off and large
  primes;
- PARI `hyperellcharpoly`, as an oracle and as evidence for whether a mature
  embeddable API eventually becomes portable enough;
- a maintained revival of smalljac's version-3 genus-3 coefficient and group
  search, if upstream restores and tests it;
- higher-power Frobenius congruences that shrink or eliminate the Jacobian
  search after rforest.

Sage, PARI, and standalone tools remain development oracles, not runtime
dependencies.

## Performance and acceptance gates

Measure raw rforest, candidate enumeration, Jacobian certification, twist
certification, and public polynomial construction separately through
`10^4`, `10^5`, and `10^6`. Compare against the exact reference path and any
one-off backend at representative primes.

The public `algorithm="auto"` may select the new path only after:

- every returned polynomial is uniquely certified and matches the checked-in
  Sage/Magma/PARI corpus;
- unresolved and resource-limited rows deterministically fall back;
- exact streams match on Linux x64/arm64, macOS arm64, and native Windows x64;
- sanitizer, cancellation, and shared-native-state tests pass;
- the complete workflow, not only its modular first stage, is faster for the
  selected range and model.
