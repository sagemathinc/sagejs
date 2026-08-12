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
## Measurement and performance ergonomics

- Ratchet cold production-kernel loading separately from warm mathematical
  execution, and never silently compile a missing production kernel in an
  ordinary installed session.
