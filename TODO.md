# TODO

- Replace the handwritten declared-FFI adapters in `packages/flint/index.cjs`
  with generated host-adapter code shared by ordinary Node and the SEA. Reduce
  `index.cjs` to a tiny loader and delete it after its final legacy N-API
  consumer has migrated.
- Migrate remaining mathematical N-API families to ordinary Python,
  source-transparent `@native` kernels, or declared external-library FFI. Keep
  each old native path only as a differential oracle until deletion.
- Make every declared FFI dynamic fallback behave identically in a source
  checkout, the SEA, future CPython adapters, and WebAssembly-capable hosts.
- Continue expanding packed compiler-owned mathematical objects only through
  complete, fast, host-independent vertical slices with explicit ownership.
