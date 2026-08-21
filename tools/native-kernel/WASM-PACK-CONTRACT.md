# Source-transparent WebAssembly kernel pack contract

`wasm-production-pack.cjs` turns the registered production `@native` sources
into content-addressed WebAssembly packs. It does not introduce a second
mathematical implementation. Each pack contains the canonical C core emitted
from the same lowered Python source as the Node native pack, plus a generated
portable marshalling bridge.

## Complete inventory

The generated `index.json` uses schema `sagejs.native-wasm-pack/v1`. It accounts
for every entry in `architecture/native-kernels.json`:

- all production sources appear in `kernels` and have an emitted canonical
  core;
- every callable function is either `compiled-source` with a bridge descriptor
  or `unsupported` with a precise reason;
- every non-production witness or optional accelerator appears in
  `nonProductionKernels` with its reason, same-source fallback, oracles, and
  test/benchmark;
- every unsupported production function appears in `unsupported` with the
  same fallback, oracle, and test metadata.

Resource-owned FLINT functions are deliberately not exposed through a raw
integer-address bridge. Their canonical source cores are retained in the
inventory, but they require a generated adapter in the FLINT ownership domain.
Until that adapter exists, an absent resolver result selects their correct
same-source implementation.

## Portable identity

Native and WebAssembly manifests share these platform-independent identities:

- `sourceHash`: the complete ordinary Python source;
- `abiHash`: lowered records, public function ABIs, compiler ABI versions, and
  foreign declaration identities;
- `coreHash`: canonical host-isolated emitted C;
- `declarationHash`: the exact lowered declaration of one public function;
- `oracleIdentity`: source and provenance ranges used by the same-source
  differential oracle;
- `identityHash` / `portableIdentity`: the complete module identity.

The native compiler's platform cache key is intentionally separate. A browser
runtime must never select a pack using a filename and function name alone.

## Runtime loader

`wasm-pack-loader.mjs` is environment-neutral. Its caller supplies pack bytes
and a WASI host, so the same loader works with browser WASI, Node's WASI for
tests, and React Native's WebView runtime.

```js
const kernels = await instantiateWasmKernelPacks({
  manifest,
  load: (pack) => fetch(new URL(pack.asset, baseURL)).then((r) => r.arrayBuffer()),
  host: (_pack, module) => browserWasiHost(module),
});

const compiled = kernels.resolve(logicalSource, functionName, {
  sourceHash,
  abiHash,
  declarationHash,
  portableIdentity,
});
```

`resolve` returns `null` for an unavailable domain, unsupported function, or
identity mismatch. That is the normal signal to retain the `@native`
same-source fallback. `function` is the explicit diagnostic API and throws when
the function is absent. Pack bytes are SHA-256 checked before compilation.

Returned functions accept ordinary JavaScript `bigint`, arrays, typed arrays,
and compiler-owned record objects. They copy mutable packed buffers back after
the call and return exact `bigint` results. They expose `nativeAvailable`,
`sourceTransparent`, `executionTarget`, and all selection identities as
read-only metadata.

## Browser bootstrap integration

The browser integration lane must perform these steps before importing a
standard-library module containing `@native` declarations:

1. Load `index.json` and instantiate its built ownership-domain packs without
   invoking a C compiler, `node-gyp`, `require`, or another Node-only path.
2. Install a synchronous resolver backed by `kernels.resolve` in the runtime
   bootstrap.
3. In `resolveNativeFunction`, normalize the source path with the existing
   `nativeLogicalSourceKey`, then consult the preinstalled WebAssembly resolver
   using the emitted source, ABI, declaration, and portable identity hashes.
4. Return the WebAssembly callable on an exact match. On `null`, continue to the
   existing same-source dynamic fallback (and, on Node, the native compiler
   path when enabled).
5. Expose the resolver's available domains and manifest for diagnostics and
   browser capability reporting.

This ordering is required because `src/lib/sagejs/native.py` resolves the
callable synchronously while applying the decorator. A loader started after
that module import cannot retroactively replace the decorated fallback.

The release differential gate should instantiate the production pack in a
real browser worker, evaluate public `NumberField(...).maximal_order()`, and
compare it with the same-source result. It must also assert that the installed
callable reports `executionTarget === "wasm"`; a numerically correct fallback
alone does not satisfy the dispatch gate.
