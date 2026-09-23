import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { gzipSync } from "node:zlib";
import { createWasiHost } from "../../../../packages/flint-wasm/src/wasi-runtime.mjs";
import {
  sha256,
  sourceClosure,
  toolchainIdentity,
} from "./receipt-identity.mjs";

const directory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(directory, "../../../..");
const artifactPath = new URL("./build/public-cubic-e2e.wasm", import.meta.url);
const vectorPath = new URL("./row6.vector.json", import.meta.url);
const outputPath = new URL("./node-receipt.json", import.meta.url);
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

function stableProjection(value) {
  const {
    schema,
    outcome,
    publicComplete,
    requestedProof,
    usesPariInput,
    usesPreparedFixture,
    usesFieldAnswersAsInput,
    preparation,
    relations,
    candidate,
    completion,
    firstUnavailableBoundary = null,
  } = value;
  return {
    schema,
    outcome,
    publicComplete,
    requestedProof,
    usesPariInput,
    usesPreparedFixture,
    usesFieldAnswersAsInput,
    preparation,
    relations,
    candidate,
    completion,
    firstUnavailableBoundary,
  };
}

function checkedSlice(memory, pointer, length) {
  const end = pointer + length;
  if (!Number.isInteger(pointer) || pointer <= 0 || !Number.isInteger(length) ||
      length <= 0 || !Number.isSafeInteger(end) || end > memory.buffer.byteLength) {
    throw new RangeError("invalid guest memory range");
  }
  return new Uint8Array(memory.buffer, pointer, length);
}

const [artifact, vectorSource] = await Promise.all([
  readFile(artifactPath),
  readFile(vectorPath, "utf8"),
]);
const compressedArtifact = gzipSync(artifact, { level: 9, mtime: 0 });
const vector = JSON.parse(vectorSource);
const module = await WebAssembly.compile(artifact);
const imports = WebAssembly.Module.imports(module);
let instance = null;
const wasi = createWasiHost({ stdout() {}, stderr() {} });
const wasiImports = { ...wasi.imports };
if (imports.some(({ name }) => name === "environ_get")) wasiImports.environ_get = () => 0;
if (imports.some(({ name }) => name === "environ_sizes_get")) {
  wasiImports.environ_sizes_get = (countPointer, bytesPointer) => {
    const view = new DataView(instance.exports.memory.buffer);
    view.setUint32(countPointer, 0, true);
    view.setUint32(bytesPointer, 0, true);
    return 0;
  };
}
const instantiated = await WebAssembly.instantiate(module, {
  wasi_snapshot_preview1: wasiImports,
});
instance = instantiated;
wasi.initialize(instance);
const exports = instance.exports;
assert.equal(exports.sagejs_class_group_abi_version(), 1);
assert.ok(exports.memory instanceof WebAssembly.Memory);
const input = encoder.encode(JSON.stringify(vector.request));
const inputPointer = exports.sagejs_class_group_alloc(input.byteLength) >>> 0;
assert.notEqual(inputPointer, 0);
checkedSlice(exports.memory, inputPointer, input.byteLength).set(input);
const pagesBefore = exports.memory.buffer.byteLength / 65536;
const started = performance.now();
const packed = BigInt.asUintN(64, exports.sagejs_class_group_run_json(
  inputPointer,
  input.byteLength,
));
const elapsedMs = performance.now() - started;
exports.sagejs_class_group_dealloc(inputPointer, input.byteLength);
const outputPointer = Number(packed & 0xffff_ffffn);
const outputLength = Number(packed >> 32n);
const output = checkedSlice(exports.memory, outputPointer, outputLength).slice();
exports.sagejs_class_group_dealloc(outputPointer, outputLength);
const result = JSON.parse(decoder.decode(output));
const projection = stableProjection(result);
const receipt = {
  schema: "sagejs.rust-class-group/wasm-public-cubic-node-smoke-v1",
  outcome: result.outcome === "complete-conditional-grh" ? "pass" : "fail",
  artifact: {
    bytes: artifact.byteLength,
    sha256: sha256(artifact),
    gzipBytes: compressedArtifact.byteLength,
    gzipSha256: sha256(compressedArtifact),
    imports,
    exports: WebAssembly.Module.exports(module),
  },
  vectorSha256: sha256(Buffer.from(vectorSource)),
  toolchain: await toolchainIdentity(repositoryRoot),
  sourceClosure: await sourceClosure(repositoryRoot),
  elapsedMs,
  memoryPagesBefore: pagesBefore,
  memoryPagesAfter: exports.memory.buffer.byteLength / 65536,
  processResourceUsage: process.resourceUsage(),
  guestResult: result,
  stableProjection: projection,
};
await writeFile(outputPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify(receipt, null, 2));
wasi.dispose();
assert.equal(
  result.outcome,
  "complete-conditional-grh",
  `guest rejected row6: ${JSON.stringify(result)}`,
);
assert.deepEqual(projection, vector.expectedStableProjection);
