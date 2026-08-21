#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");
const json = process.argv.includes("--json");

const source = String.raw`
import sagejs.runtime as runtime

def median_time(call, repetitions):
    values = []
    for _sample in range(repetitions):
        started = runtime.wall_time()
        call()
        values.append(runtime.wall_time() - started)
    values.sort()
    return values[len(values) // 2]

G = graphs.CycleGraph(5000)
portable_single = median_time(lambda: G._shortest_index_data(0), 5)
packed_single = median_time(lambda: G.shortest_path(0, 2500), 5)
path = G.shortest_path(0, 2500)
single_receipt = G._last_shortest_paths_acceleration

H = graphs.CycleGraph(500)
portable_pairs = median_time(lambda: H._portable_distances_all_pairs(), 3)
packed_pairs = median_time(lambda: H.distances_all_pairs(), 3)
expected = H._portable_distances_all_pairs()
actual = H.distances_all_pairs()
pairs_receipt = H._last_shortest_paths_acceleration

C = graphs.CompleteGraph(18)
started = runtime.wall_time()
clique = C.clique_number()
clique_seconds = runtime.wall_time() - started
C = graphs.CycleGraph(480)
started = runtime.wall_time()
coloring = C.chromatic_number()
coloring_seconds = runtime.wall_time() - started
C = graphs.PathGraph(50)
D = graphs.PathGraph(50)
started = runtime.wall_time()
isomorphic = C.is_isomorphic(D)
isomorphism_seconds = runtime.wall_time() - started

print("|".join([
    str(portable_single), str(packed_single), str(len(path)),
    str(single_receipt.route), str(single_receipt.boundaryCrossings),
    str(portable_pairs), str(packed_pairs), str(actual == expected),
    str(pairs_receipt.route), str(pairs_receipt.boundaryCrossings),
    str(clique_seconds), str(clique),
    str(coloring_seconds), str(coloring),
    str(isomorphism_seconds), str(isomorphic),
]))
`;

const result = spawnSync(process.execPath, [resolve(root, "bin/sagejs"), "--python"], {
  cwd: root,
  encoding: "utf8",
  input: source,
  timeout: 180_000,
});
assert.equal(result.status, 0, result.stderr || result.stdout);
const fields = result.stdout.trim().split("\n").at(-1).split("|");
assert.equal(fields.length, 16, result.stdout);
assert.equal(fields[2], "2501");
assert.equal(fields[7], "True");

const portableSingle = Number(fields[0]);
const packedSingle = Number(fields[1]);
const portablePairs = Number(fields[5]);
const packedPairs = Number(fields[6]);
const report = {
  schema: "sagejs.benchmark/wasm-graph-shortest-paths-v1",
  host: {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
  },
  warmupAndSamples: {
    singleSource: "median of 5 public same-session calls",
    allPairs: "median of 3 public same-session calls",
    survey: "one public call per non-selected family",
  },
  selectedCases: {
    "CycleGraph(5000).shortest_path(0,2500)": {
      portableEdgeScanMedianMs: 1000 * portableSingle,
      packedSameSourceMedianMs: 1000 * packedSingle,
      speedup: portableSingle / packedSingle,
      selectedRoute: fields[3],
      boundaryCrossings: Number(fields[4]),
    },
    "CycleGraph(500).distances_all_pairs()": {
      portableEdgeScanMedianMs: 1000 * portablePairs,
      packedSameSourceMedianMs: 1000 * packedPairs,
      speedup: portablePairs / packedPairs,
      selectedRoute: fields[8],
      boundaryCrossings: Number(fields[9]),
    },
  },
  surveyedPortableFamilies: {
    clique: {
      workload: "CompleteGraph(18).clique_number()",
      milliseconds: 1000 * Number(fields[10]),
      value: fields[11],
      disposition: "input-sensitive exponential family; not selected",
    },
    coloring: {
      workload: "CycleGraph(480).chromatic_number()",
      milliseconds: 1000 * Number(fields[12]),
      value: fields[13],
      disposition: "input-sensitive exponential family; not selected",
    },
    isomorphism: {
      workload: "PathGraph(50).is_isomorphic(PathGraph(50))",
      milliseconds: 1000 * Number(fields[14]),
      value: fields[15],
      disposition: "existing optional mature igraph route; no broad Wasm port",
    },
  },
  note:
    "This local benchmark compares the exact public edge-scan oracle with " +
    "the packed same-source body. test/wasm-graph-shortest-paths.cjs " +
    "separately executes that body as digest-authenticated real Wasm in " +
    "Node and Chromium.",
};

if (json) console.log(JSON.stringify(report, null, 2));
else {
  for (const [workload, record] of Object.entries(report.selectedCases)) {
    console.log(workload);
    console.log(`  portable edge scan: ${record.portableEdgeScanMedianMs.toFixed(3)} ms`);
    console.log(`  packed same source: ${record.packedSameSourceMedianMs.toFixed(3)} ms`);
    console.log(`  speedup:            ${record.speedup.toFixed(2)}x`);
    console.log(`  route:              ${record.selectedRoute}`);
  }
}
