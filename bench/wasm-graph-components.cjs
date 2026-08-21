#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");
const order = Number(process.env.SAGEJS_GRAPH_COMPONENTS_ORDER ?? 5000);
const packedRepetitions = Number(
  process.env.SAGEJS_GRAPH_COMPONENTS_REPETITIONS ?? 7,
);
const json = process.argv.includes("--json");

const source = `
import sagejs.runtime as runtime

G = graphs.CycleGraph(${order})
reference = G._portable_connected_components(False)
actual = G.connected_components()
portable_samples = []
packed_samples = []
for _sample in range(${packedRepetitions}):
    started = runtime.wall_time()
    reference = G._portable_connected_components(False)
    portable_samples.append(runtime.wall_time() - started)
for _sample in range(${packedRepetitions}):
    started = runtime.wall_time()
    actual = G.connected_components()
    packed_samples.append(runtime.wall_time() - started)
portable_samples.sort()
packed_samples.sort()
portable_seconds = portable_samples[len(portable_samples) // 2]
packed_seconds = packed_samples[len(packed_samples) // 2]
receipt = G._last_components_acceleration
print(str(portable_seconds) + "|" + str(packed_seconds) + "|" +
      str(reference == actual) + "|" + str(receipt.route) + "|" +
      str(receipt.boundaryCrossings) + "|" + str(receipt.copiedValues))
`;

const result = spawnSync(process.execPath, [joinRoot("bin/sagejs"), "--python"], {
  cwd: root,
  encoding: "utf8",
  input: source,
  timeout: 180_000,
});
assert.equal(result.status, 0, result.stderr || result.stdout);
const fields = result.stdout.trim().split("\n").at(-1).split("|");
assert.equal(fields.length, 6, result.stdout);
assert.equal(fields[2], "True");
const portableSeconds = Number(fields[0]);
const packedSeconds = Number(fields[1]);
const report = {
  schema: "sagejs.benchmark/wasm-graph-components-v1",
  workload: `graphs.CycleGraph(${order}).connected_components()`,
  publicSemanticsEqual: true,
  vertices: order,
  edges: order,
  packedRepetitions,
  portableEdgeScanMedianSeconds: portableSeconds,
  packedCsrMedianSeconds: packedSeconds,
  speedup: portableSeconds / packedSeconds,
  selectedRoute: fields[3],
  boundaryCrossings: Number(fields[4]),
  copiedValues: Number(fields[5]),
  note:
    "This local run measures the public edge-scan oracle against the packed " +
    "same-source route. test/wasm-graph-components.cjs separately proves that " +
    "the identical packed body executes as authenticated WebAssembly.",
};

if (json) console.log(JSON.stringify(report, null, 2));
else {
  console.log(`${report.workload}`);
  console.log(`portable edge scan: ${(1000 * portableSeconds).toFixed(3)} ms`);
  console.log(`packed CSR:         ${(1000 * packedSeconds).toFixed(3)} ms`);
  console.log(`speedup:            ${report.speedup.toFixed(2)}x`);
  console.log(`route:              ${report.selectedRoute}`);
}

function joinRoot(path) {
  return resolve(root, path);
}
