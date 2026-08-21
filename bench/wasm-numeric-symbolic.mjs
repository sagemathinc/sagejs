import { readFile } from "node:fs/promises";

import {
  createNumericBackend,
  createPortableNumericBackend,
} from "../packages/flint-wasm/numeric-backend.mjs";
import { createWasiHost } from "../packages/flint-wasm/src/wasi-runtime.mjs";

const samples = Number(process.env.SAGEJS_BENCH_SAMPLES ?? 3);
const iterations = Number(process.env.SAGEJS_BENCH_ITERATIONS ?? 100);

function median(values) {
  return [...values].sort((left, right) => left - right)[Math.floor(values.length / 2)];
}

function arithmeticSample(backend, count, close = () => {}) {
  const x = backend.realFromString("1.0000000000000000000000000001", 100);
  const y = backend.realFromString("1.0000000000000000000000000002", 100);
  let state = backend.realFromString("0", 100);
  const started = performance.now();
  for (let index = 0; index < count; index += 1) {
    const sum = backend.realAdd(state, x);
    const next = backend.realMul(sum, y);
    close(state);
    close(sum);
    state = next;
  }
  const elapsed = performance.now() - started;
  const checksum = backend.realToString(state);
  close(state);
  close(y);
  close(x);
  return { elapsed, checksum };
}

async function wasmBackend() {
  const source = await readFile(new URL(
    "../packages/flint-wasm/dist/flint-factor.wasm",
    import.meta.url,
  ));
  const wasi = createWasiHost();
  const instance = await WebAssembly.instantiate(
    await WebAssembly.compile(source),
    { wasi_snapshot_preview1: wasi.imports },
  );
  wasi.initialize(instance);
  return createNumericBackend(instance);
}

const portable = createPortableNumericBackend();
const wasm = await wasmBackend();
const results = {};
for (const [name, backend, close] of [
  ["portable_exact_bigint_rational", portable, () => {}],
  ["wasm_mpfr_resource", wasm, (value) => wasm.closeNumericResource(value)],
]) {
  arithmeticSample(backend, Math.min(iterations, 10), close);
  const timings = [];
  let checksum;
  for (let sample = 0; sample < samples; sample += 1) {
    const result = arithmeticSample(backend, iterations, close);
    timings.push(result.elapsed);
    checksum = result.checksum;
  }
  results[name] = {
    iterations,
    samples,
    median_ms: median(timings),
    operations_per_second: (iterations * 2 * 1000) / median(timings),
    checksum,
  };
}

const integralStarted = performance.now();
const integral = wasm.symbolicNumericalIntegral(
  ["Exp", ["Power", "x", 2]],
  "x",
  1,
  2,
  87,
  1e-12,
  1e-12,
  true,
);
results.wasm_symbolic_integral = {
  elapsed_ms: performance.now() - integralStarted,
  value: integral.value,
  error: integral.error,
};

console.log(JSON.stringify({
  schema: "sagejs.wasm-numeric-symbolic-benchmark/v1",
  node: process.version,
  workload: "100-bit affine recurrence s=(s+x)*y",
  results,
}, null, 2));
