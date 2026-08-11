# TODO

- Generate host adapters for declared opaque resources. Value-only FLINT and
  igraph declarations already compile from generated typed Python and are
  shared by ordinary Node and the SEA. Reduce `packages/flint/index.cjs` to a
  tiny loader and delete it after its final resource adapter and legacy N-API
  oracle consumer have migrated.
- Migrate remaining mathematical N-API families to ordinary Python,
  source-transparent `@native` kernels, or declared external-library FFI. Keep
  each old native path only as a differential oracle until deletion.
- Make every declared FFI dynamic fallback behave identically in a source
  checkout, the SEA, future CPython adapters, and WebAssembly-capable hosts.
- Continue expanding packed compiler-owned mathematical objects only through
  complete, fast, host-independent vertical slices with explicit ownership.
- Give compiled baselib modules lexical top-level namespaces instead of the
  current shared bootstrap scope, then ratchet duplicate private helper names.
  Until then, prefix module-private helpers that differ semantically; a matrix
  versus polynomial capacity-helper collision once caused linear scans at
  every dense integer matrix boundary.
- Replace the narrow exact-root reconstruction exception for packed `ZZ[x]`
  and `QQ[x]` after algebraic-number resources have a declared generated FFI
  representation.
- Migrate exact power and Laurent series from private FLINT polynomial state to
  compiler-owned packed coefficients, then delete their audited polynomial
  reconstruction ingress.

## Measurement and performance ergonomics

- Make `time` report user, system, total CPU, and wall time. Instrument and
  separately report lazy initialization performed inside the timed statement,
  with an optional breakdown of module, addon, and native-kernel loading.
- Implement `%timeit` with compilation once, automatic loop calibration,
  warmup, high-resolution timing, current-scope semantics, suppressed result
  printing, and the familiar `-n` and `-r` controls.
- Ratchet cold production-kernel loading separately from warm mathematical
  execution, and never silently compile a missing production kernel in an
  ordinary installed session.
- Finish the `matrix(ZZ, n, [1..n^2])` construction slice by avoiding the
  redundant copy of an already-materialized built-in list. Exact range
  materialization is now fast; keep a public end-to-end performance gate.
