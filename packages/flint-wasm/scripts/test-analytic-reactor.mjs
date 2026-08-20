import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WASI } from "node:wasi";

import { createAnalyticWasmBackend } from "../analytic-backend.mjs";
import { runAnalyticWasmParity } from "../test/analytic-browser-parity.mjs";

const directory = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(directory, "..");
const wasmPath = path.resolve(
  process.argv[2] ?? path.join(packageRoot, "dist", "flint-factor.wasm"),
);
const fixture = JSON.parse(fs.readFileSync(
  path.join(packageRoot, "test", "analytic-public-vectors.json"),
  "utf8",
));

if (!fs.existsSync(wasmPath)) {
  throw new Error(`analytic WebAssembly reactor does not exist: ${wasmPath}`);
}

const wasi = new WASI({ version: "preview1" });
const module = await WebAssembly.compile(fs.readFileSync(wasmPath));
const instance = await WebAssembly.instantiate(module, {
  wasi_snapshot_preview1: wasi.wasiImport,
});
wasi.initialize(instance);

assert.equal(instance.exports.sagejs_analytic_input_capacity(), 0);
assert.equal(instance.exports.sagejs_analytic_output_capacity(), 0);
const backend = createAnalyticWasmBackend(instance);
const parity = runAnalyticWasmParity(backend, fixture);
assert.deepEqual(
  [...parity.completed],
  fixture.vectors.map((vector) => vector.id),
);

const jet = backend.riemannZetaJetDetailed(["1", "0"], 0, 2, true, 160);
assert.ok(Math.abs(Number(jet.values[0].real) - 0.5772156649015329) < 1e-15);
assert.ok(Math.abs(Number(jet.values[1].real) - 0.07281584548367673) < 1e-15);
const gamma = backend.complexGammaValuesDetailed([["0.5", "0"]], 160);
assert.ok(Math.abs(Number(gamma.values[0].real) - Math.sqrt(Math.PI)) < 1e-15);
const plot = backend.riemannZetaPlotBatch(
  Array.from({ length: 11 }, (_, index) => ["2", String(index / 10)]),
  { precisionBits: 32, guardBits: 24, tileSize: 4 },
);
assert.equal(plot.diagnostics.tileCount, 3);
assert.equal(plot.coarse.length, 11);

const receipt = Object.freeze({
  completed: parity.completed,
  jet: jet.values.map((value) => [value.real, value.imaginary]),
  gammaHalf: [gamma.values[0].real, gamma.values[0].imaginary],
  plotTiles: plot.diagnostics.tileCount,
  inputCapacity: instance.exports.sagejs_analytic_input_capacity(),
  outputCapacity: instance.exports.sagejs_analytic_output_capacity(),
  wasmBytes: fs.statSync(wasmPath).size,
});
backend.release();
assert.equal(instance.exports.sagejs_analytic_input_capacity(), 0);
assert.equal(instance.exports.sagejs_analytic_output_capacity(), 0);
console.log(JSON.stringify(receipt));
