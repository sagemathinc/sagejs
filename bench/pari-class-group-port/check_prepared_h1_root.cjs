#!/usr/bin/env node
"use strict";

// This is an interface/dependency gate, not a class-number benchmark.  It
// answers whether the current tree has a fixture-free executable boundary
// from a neutral prepared nf through the authenticated h=1 result.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { lowerSource } = require("../../tools/native-kernel/ir.cjs");
const {
  createNativeImportResolver,
} = require("../../tools/native-kernel/native-imports.cjs");

const root = path.resolve(__dirname, "../..");
const sourcePath = path.join(__dirname, "resident_generated_class_attempt.py");
const entry = "pari_resident_generated_class_attempt";
const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");

function canonicalGraph(graph) {
  return Object.fromEntries(
    Object.keys(graph)
      .sort()
      .map((name) => [name, [...graph[name]].sort()]),
  );
}

function shortestPath(graph, start, finish) {
  const queue = [[start]];
  const seen = new Set([start]);
  while (queue.length) {
    const route = queue.shift();
    const at = route.at(-1);
    if (at === finish) return route;
    for (const next of graph[at] || []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push([...route, next]);
      }
    }
  }
  return null;
}

(async () => {
  const source = fs.readFileSync(sourcePath, "utf8");
  const resolveNativeImport = createNativeImportResolver({
    root,
    lowerSource,
    initialSourcePath: sourcePath,
  });
  const ir = await lowerSource(source, sourcePath, { resolveNativeImport });
  const graph = canonicalGraph(ir.callGraph);
  const fn = ir.functions.find((candidate) => candidate.name === entry);
  assert(fn, "resident generated entry disappeared");

  assert.equal(ir.functions.length, 357);
  assert.equal(Object.keys(graph).length, 357);
  assert.equal(
    Object.values(graph).reduce((count, edges) => count + edges.length, 0),
    711,
  );
  assert.equal(ir.nativeSourceDependencies.length, 131);
  assert.equal(fn.params.length, 351);
  assert.equal(fn.hostCallable, true);
  assert.equal(fn.sourceTransparent, true);
  assert.deepEqual(graph[entry], [
    "pari_analytic_class_group_attempt",
    "pari_bad_subfactor_flags",
    "pari_discriminant_log",
    "pari_initial_kummer_catalog",
    "pari_prepared_initial_base",
    "pari_prepared_subfactor_base",
    "pari_prime_degree_catalog",
    "pari_random_seed",
    "pari_selected_ideal_metadata",
    "pari_selected_ideal_packets",
    "pari_small_norm_scale",
    "pari_subfactor_product",
  ]);

  const critical = [
    "pari_analytic_inverse_hr",
    "pari_collect_ideal_relations",
    "pari_connected_relation_hnf",
    "pari_post_hnf_acceptance",
    "pari_class_invariant_output",
  ];
  const paths = Object.fromEntries(
    critical.map((name) => {
      const route = shortestPath(graph, entry, name);
      assert(route, `${name} is no longer reachable from ${entry}`);
      return [name, route];
    }),
  );

  // The successful unit and final publication code exists in the tree, but is
  // not in this native call graph.  Claiming otherwise would silently join two
  // fixture-backed test harnesses rather than execute an end-to-end root.
  for (const absent of [
    "pari_cubic_unit_bridge_prepare",
    "pari_cubic_getfu_factor_rank_two",
    "pari_cubic_unit_compose_provenance",
  ]) {
    assert.equal(graph[absent], undefined, `${absent} unexpectedly joined root`);
  }

  const dependencySources = ir.nativeSourceDependencies.map((item) => item.path);
  const fixtureReads = [];
  for (const filename of [sourcePath, ...dependencySources]) {
    const text = fs.readFileSync(filename, "utf8");
    if (/\.json\b|read_(?:text|bytes)\s*\(|json\.load\s*\(|open\s*\(/.test(text)) {
      fixtureReads.push(path.relative(root, filename));
    }
  }
  assert.deepEqual(fixtureReads, [], "native root graph acquired file I/O");

  const typeCounts = Object.create(null);
  for (const parameter of fn.params) {
    typeCounts[parameter.type] = (typeCounts[parameter.type] || 0) + 1;
  }
  assert.deepEqual({ ...typeCounts }, {
    Float64Buffer: 23,
    Int64Buffer: 44,
    Integer: 9,
    IntegerBuffer: 275,
  });

  const graphRaw = JSON.stringify(graph);
  const result = {
    schema: "sagejs.pari-class-group/prepared-h1-root-audit-v1",
    field: "x^3-20018*x+20034",
    nearestExecutableRoot: entry,
    sourceTransparentNativeFunctions: ir.functions.length,
    sourceModules: ir.nativeSourceDependencies.length,
    callEdges: Object.values(graph).reduce(
      (count, edges) => count + edges.length,
      0,
    ),
    parameters: fn.params.length,
    parameterTypes: typeCounts,
    criticalPaths: paths,
    graphSha256: sha256(graphRaw),
    sourceSha256: sha256(source),
    nativeGraphReadsFixtures: false,
    timedPreparedCandidateAvailable: true,
    timedPreparedFinalResultAvailable: false,
    firstMissingEdge:
      "accepted candidate -> high-precision unit input/retry -> final driver",
    reason:
      "unit retry inputs and final composition are supplied by separate fixture/oracle harnesses and are absent from this native call graph",
  };
  if (process.argv.includes("--full-graph")) result.callGraph = graph;
  console.log(JSON.stringify(result, null, 2));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
