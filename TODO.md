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
