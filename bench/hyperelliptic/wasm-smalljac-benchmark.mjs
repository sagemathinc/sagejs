#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";

import { createCurveBackend } from "../../packages/flint-wasm/curve-backend.mjs";
import { createWasiHost } from "../../packages/flint-wasm/dist/wasi-runtime.mjs";

const require = createRequire(import.meta.url);
const nativeFlint = require("../../packages/flint");
const stop = BigInt(process.argv[2] ?? "100000");
const repeat = Number(process.argv[3] ?? "3");
const curve = process.argv[4] ?? "x^5+x+1";
if (stop < 3n || stop > 131_073n || !Number.isInteger(repeat) || repeat < 1) {
  throw new RangeError("usage: wasm-smalljac-benchmark [stop<=131073] [repeat] [curve]");
}

const artifact = await fs.readFile(new URL(
  "../../packages/flint-wasm/dist/flint-factor.wasm",
  import.meta.url,
));
const module = await WebAssembly.compile(artifact);
const wasi = createWasiHost();
const instance = await WebAssembly.instantiate(module, {
  wasi_snapshot_preview1: wasi.imports,
});
wasi.initialize(instance);
const routes = [];
const wasm = createCurveBackend(instance, {
  recordCapability(...arguments_) { routes.push(arguments_); },
});

function digest(batch) {
  const hash = createHash("sha256");
  for (const values of [
    batch.primes,
    batch.good,
    batch.coefficientCounts,
    batch.coefficients,
    batch.rowStatus,
  ]) {
    hash.update(new Uint8Array(values.buffer, values.byteOffset, values.byteLength));
  }
  return hash.digest("hex");
}

function measure(callback) {
  const durations = [];
  let result;
  for (let index = 0; index < repeat; index += 1) {
    const started = performance.now();
    result = callback();
    durations.push(performance.now() - started);
  }
  return { result, durations };
}

// Warm both implementations so this receipt measures local-factor throughput,
// not module instantiation or native-addon loading.
wasm.smalljacLpolyBatch(curve, 3n, 101n);
nativeFlint.smalljacLpolyBatch(curve, 3n, 101n);
routes.length = 0;

const wasmRun = measure(() => wasm.smalljacLpolyBatch(curve, 3n, stop));
const nativeRun = measure(() => nativeFlint.smalljacLpolyBatch(curve, 3n, stop));
const wasmDigest = digest(wasmRun.result);
const nativeDigest = digest(nativeRun.result);
if (wasmDigest !== nativeDigest) {
  throw new Error(`native/Wasm smalljac digest mismatch: ${nativeDigest} != ${wasmDigest}`);
}
const minimum = (values) => Math.min(...values);
const nativeMinimum = minimum(nativeRun.durations);
const wasmMinimum = minimum(wasmRun.durations);
const receipt = {
  schema: "sagejs.hyperelliptic-smalljac-wasm-benchmark/v1",
  curve,
  interval: ["3", stop.toString()],
  repeat,
  backend_version: wasm.smalljacCapabilities().backendVersion,
  artifact_sha256: createHash("sha256").update(artifact).digest("hex"),
  exact_digest: wasmDigest,
  row_count: wasmRun.result.rowCount,
  bad_row_count: Array.from(wasmRun.result.good).filter((value) => !value).length,
  wasm_ms: wasmRun.durations,
  native_ms: nativeRun.durations,
  minimum_wasm_to_native_ratio: wasmMinimum / nativeMinimum,
  observed_routes: routes.map(([capabilityId, selectedRoute, evidence]) => ({
    capability_id: capabilityId,
    selected_route: selectedRoute,
    execution_target: evidence.executionTarget,
    ingress_bytes: evidence.ingressBytes,
    egress_bytes: evidence.egressBytes,
    row_count: evidence.rowCount,
  })),
  normalization: "det(1-T*Frob)",
  notes: [
    "Both timings use one bounded in-process traversal and one packed boundary crossing.",
    "The Wasm closure is the pinned portable smalljac 4.1.3 and ffpoly 1.2.7 core.",
    "This receipt makes no genus-3 support claim.",
  ],
};
process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
