import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";

import { createWasiHost } from "../../../../packages/flint-wasm/src/wasi-runtime.mjs";

const artifact = new URL("./target/wasm32-wasip1/release/sagejs_rust_wasm_arithmetic_probe.wasm", import.meta.url);
const bytes = fs.readFileSync(artifact);
const compileStarted = performance.now();
const module = await WebAssembly.compile(bytes);
const compileMs = performance.now() - compileStarted;
let stderr = "";
const wasi = createWasiHost({ stderr: (text) => { stderr += text; } });
let instance;
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
const instantiateStarted = performance.now();
instance = await WebAssembly.instantiate(module, {
  wasi_snapshot_preview1: imports,
});
wasi.initialize(instance);
const instantiateMs = performance.now() - instantiateStarted;
const computeStarted = performance.now();
assert.equal(instance.exports.sagejs_probe_status(), 0, stderr);
const computeMs = performance.now() - computeStarted;
const pointer = instance.exports.sagejs_probe_result_ptr();
const length = instance.exports.sagejs_probe_result_len();
const payload = new TextDecoder().decode(
  new Uint8Array(instance.exports.memory.buffer, pointer, length),
);
JSON.parse(payload);
const sha256 = crypto.createHash("sha256").update(payload).digest("hex");
assert.equal(sha256, "973f49930a209bd05f97d723416d155e8ac432bb120998e19248877b33f22eb2");
process.stdout.write(`${JSON.stringify({
  runtime: "node-sagejs-wasi-host",
  wasmBytes: bytes.byteLength,
  resultBytes: length,
  compileMs,
  instantiateMs,
  computeMs,
  sha256,
  payload,
})}\n`);
wasi.dispose();
