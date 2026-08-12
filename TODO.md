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
- Split the bootstrap `matrix.py` implementation into ordinary, domain-focused
  modules before the linear-algebra package reaches its temporary 410 KB source
  ratchet. Keep the public `Matrix` API unified while making exact-integer,
  rational, prime-field, and generic host dispatch independently readable and
  claimable by parallel agents.
- Make the ordinary build graph regenerate and rebuild a foreign-library host
  adapter whenever its declaration or generated adapter source changes.
  Focused FFI tests must not accidentally load a stale addon that predates the
  declarations under test.

## Measurement and performance ergonomics

- Extend Sage mode's `time` output to separate user CPU, system CPU, wall
  time, and one-time initialization/native-loading work, so cold startup is
  not mistaken for mathematical execution.
- Ratchet cold production-kernel loading separately from warm mathematical
  execution, and never silently compile a missing production kernel in an
  ordinary installed session.
- Implement Sage/IPython-compatible `%timeit`, including automatic loop-count
  selection, repeated samples, and concise mean/standard-deviation reporting.
- Add bounded inspection and cleanup for the content-addressed user module
  cache under `~/.cache/sagejs/modules`. Retain current and recently used
  artifacts, protect active publications, default to a dry run, and impose
  explicit generation/byte caps on destructive cleanup.
