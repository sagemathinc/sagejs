import {createWasiHost} from "./dist/wasi-runtime.mjs";
import {createGeneratedWasmBackend, generatedWasmManifest} from "./dist/extension-resource-backend.mjs";
import {createSpecialistBytes} from "./specialist-bytes.mjs";

// The small adapter is imported with the evaluator. Only the authenticated
// mathematics binary is fetched on first use when synchronous workers exist.
export async function createExtensionMultivariate({
  source = new URL("./dist/flint-extension-multivariate.wasm", import.meta.url),
  receipt = new URL("./dist/extension-resource-receipt.json", import.meta.url),
  WorkerConstructor = globalThis.Worker,
  recordCapability = () => {},
} = {}) {
  const response = await fetch(receipt);
  if (!response.ok) throw new Error("extension multivariate receipt is unavailable");
  const identity = await response.json();
  if (identity.schema !== "sagejs.extension-multivariate-artifact/v1" ||
      identity.declaration !== generatedWasmManifest.declaration) {
    throw new Error("extension multivariate declaration receipt mismatch");
  }
  const transport = createSpecialistBytes(source, identity, {WorkerConstructor});
  try { await transport.ready; } catch (error) {transport.close(); throw error;}
  let backend, instance, failed, closed = false;
  function ensure() {
    if (closed) throw new Error("extension multivariate reactor is closed");
    if (failed) throw failed;
    if (!backend) {
      try {
        const module = new WebAssembly.Module(transport.get());
        const wasi = createWasiHost();
        instance = new WebAssembly.Instance(module, {wasi_snapshot_preview1: wasi.imports});
        wasi.initialize(instance);
        backend = createGeneratedWasmBackend(instance, {recordCapability});
      } catch (error) {failed = error; throw error;}
      finally {transport.close();}
    }
    return backend;
  }
  const facade = {};
  for (const name of generatedWasmManifest.exports) {
    if (!name.startsWith("sagejs_wasm_ffi")) continue;
    const key = name.slice("sagejs_wasm_".length);
    facade[key] = (...args) => {
      const target = ensure();
      if (typeof target[key] !== "function") throw new Error(`missing specialist adapter ${key}`);
      return target[key](...args);
    };
  }
  return Object.freeze({
    backend: Object.freeze(facade), manifest: generatedWasmManifest,
    status: () => ({loaded: backend !== undefined, transport: transport.status()}),
    close() {closed = true; backend = undefined; instance = undefined; transport.close();},
  });
}
