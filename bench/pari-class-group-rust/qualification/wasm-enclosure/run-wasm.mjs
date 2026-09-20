import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createWasiHost } from "../../../../packages/flint-wasm/src/wasi-runtime.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const artifact = path.join(root, "target/wasm32-wasip1/release/sagejs_rust_wasm_enclosure_probe.wasm");
const bytes = fs.readFileSync(artifact);
const module = await WebAssembly.compile(bytes);
let instance;
const wasi = createWasiHost();
const imports = {
  ...wasi.imports,
  environ_get: () => 0,
  environ_sizes_get: (countPointer, bytesPointer) => {
    const view = new DataView(instance.exports.memory.buffer);
    view.setUint32(countPointer, 0, true);
    view.setUint32(bytesPointer, 0, true);
    return 0;
  },
};
instance = await WebAssembly.instantiate(module, { wasi_snapshot_preview1: imports });
wasi.initialize(instance);
assert.equal(instance.exports.sagejs_probe_status(), 0);
const pointer = instance.exports.sagejs_probe_result_ptr();
const length = instance.exports.sagejs_probe_result_len();
const payload = new TextDecoder().decode(new Uint8Array(instance.exports.memory.buffer, pointer, length));
JSON.parse(payload);
process.stdout.write(`${JSON.stringify({
  runtime: "node-sagejs-wasi-host",
  artifactBytes: bytes.length,
  imports: WebAssembly.Module.imports(module),
  memoryPages: instance.exports.memory.buffer.byteLength / 65_536,
  resultBytes: length,
  sha256: crypto.createHash("sha256").update(payload).digest("hex"),
  payload,
})}\n`);
wasi.dispose();
