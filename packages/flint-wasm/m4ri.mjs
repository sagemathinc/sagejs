import { createWasiHost } from "./dist/wasi-runtime.mjs";
import {
  createGeneratedWasmBackend,
  generatedWasmManifest,
} from "./dist/m4ri-resource-backend.mjs";

async function compile(source) {
  if (source instanceof WebAssembly.Module) return source;
  if (source instanceof Response) {
    return WebAssembly.compileStreaming(Promise.resolve(source));
  }
  if (
    typeof source === "string" ||
    (typeof URL !== "undefined" && source instanceof URL)
  ) {
    return WebAssembly.compileStreaming(fetch(source));
  }
  return WebAssembly.compile(source);
}

/**
 * Instantiate the separately owned generated M4RI resource backend.
 *
 * M4RI resources and handles belong only to this WebAssembly instance. They
 * never share linear memory or an ownership table with the FLINT backend.
 */
export async function instantiateM4ri(source) {
  const module = await compile(source);
  const wasi = createWasiHost();
  const instance = await WebAssembly.instantiate(module, {
    wasi_snapshot_preview1: wasi.imports,
  });
  wasi.initialize(instance);

  const backend = {
    ...createGeneratedWasmBackend(instance),
  };
  Object.defineProperty(backend, "__sagejs_wasm_resource_live_count__", {
    value: () => instance.exports.sagejs_wasm_resource_live_count(),
    enumerable: false,
  });
  Object.defineProperty(backend, "__sagejs_ffi_manifest__", {
    value: Object.freeze({
      ...generatedWasmManifest,
      library: generatedWasmManifest.declaration,
    }),
    enumerable: false,
  });
  return Object.freeze(backend);
}
