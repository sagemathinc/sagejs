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

## Measurement and performance ergonomics

- Extend Sage mode's `time` output to separate user CPU, system CPU, wall
  time, and one-time initialization/native-loading work, so cold startup is
  not mistaken for mathematical execution.
- Implement Sage/IPython-compatible `%timeit` with calibrated loop counts,
  repeated samples, and concise mean/dispersion output for warm microbenchmarks.
- Ratchet cold production-kernel loading separately from warm mathematical
  execution, and never silently compile a missing production kernel in an
  ordinary installed session.
- Keep release mathematics libraries portable, but add a fingerprinted
  CPU-native build profile for source builds and controlled performance runs.
  Configure GMP without `--enable-fat`, tune FLINT for the host, include CPU
  features, ABI, compiler, dependency versions, and profile in cache keys, and
  expose the selected build provenance in timing/debug output.
