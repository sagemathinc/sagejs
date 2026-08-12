# TODO

- Separate generated production backends from explicitly named legacy
  compatibility/oracle backends. Production package loaders must not retain
  handwritten implementations of declared operations.
- Migrate remaining mathematical N-API families to ordinary Python,
  source-transparent `@native` kernels, or declared external-library FFI. Keep
  each old native path only as a differential oracle until deletion.
- Make every declared FFI dynamic fallback behave identically in a source
  checkout, the SEA, future CPython adapters, and WebAssembly-capable hosts.
- Use compiler-owned packed mathematical objects where they give a complete,
  fast host-independent vertical slice; use generated opaque resources for
  mature exact libraries and copy only at explicit representation boundaries.
- Replace the narrow exact-root reconstruction exception for packed `ZZ[x]`
  and `QQ[x]` after algebraic-number resources have a declared generated FFI
  representation.
- Migrate exact power and Laurent series from private FLINT polynomial state to
  compiler-owned packed coefficients, then delete their audited polynomial
  reconstruction ingress.
- Add compiler-level shared external-memory accounting tokens if measurements
  show that explicitly closing a context wrapper while dependent generated
  resources retain that context materially distorts V8 garbage-collection
  decisions. Never count the same shared allocation once per dependent.
- Split the bootstrap `matrix.py` implementation into ordinary, domain-focused
  modules before the linear-algebra package reaches its temporary 410 KB source
  ratchet. Keep the public `Matrix` API unified while making exact-integer,
  rational, prime-field, and generic host dispatch independently readable and
  claimable by parallel agents.
- Finish public dense-vector storage over `GF(2)` and small `GF(p)`. Exact
  `ZZ` and `QQ` vectors now canonically own generated resources; their remaining
  matrix-vector bridge is list-free but should become a direct resource ABI so
  it no longer copies through a temporary `ByteRegion`.
- Wire public row and column spaces through the completed bulk
  `matrix_subspaces` contract, and add one generated exact-resource pivot query
  so `ZZ` and `QQ` echelon metadata never requires exporting every entry.
- Complete generated sparse-random `QQ` construction for the `1/n`
  distribution and numerator/denominator bounds beyond 32 bits; both currently
  fall back to dense host loops.
- Accept general finite Python iterables such as `range` in polynomial-ring
  construction with the same semantics as Sage; list and tuple construction
  already work.

## Measurement and performance ergonomics

- Move mathematical representation and algorithm crossover policy out of
  `matrix.py`, `polynomial.py`, and similar public modules into
  CPython-parseable declarations with checked-in portable and host-family
  tuning profiles, deterministic JSON lowering, explainable selection, and
  benchmark provenance. Keep hard capability limits distinct from measured
  thresholds and permit an explicitly activated local tuning profile.
- Ratchet cold production-kernel loading separately from warm mathematical
  execution, and never silently compile a missing production kernel in an
  ordinary installed session.
- Bound and age the shared native-module cache automatically. Cleanup must
  respect active leases, retain current build identities, report reclaimed
  space, and avoid requiring users to discover multi-gigabyte stale caches.
