"use strict";

const { performance } = require("node:perf_hooks");
const { join } = require("node:path");

const graph = require(join(__dirname, "..", "packages", "graph"));
const json = process.argv.includes("--json");

function cycle(order, permutation = (vertex) => vertex) {
  const edges = [];
  for (let vertex = 0; vertex < order; vertex += 1) {
    edges.push(
      permutation(vertex),
      permutation((vertex + 1) % order),
    );
  }
  return { vertexCount: order, edges, directed: false };
}

function complete(order) {
  const edges = [];
  for (let source = 0; source < order; source += 1) {
    for (let target = source + 1; target < order; target += 1) {
      edges.push(source, target);
    }
  }
  return { vertexCount: order, edges, directed: false };
}

function factorial(value) {
  let answer = 1n;
  for (let factor = 2n; factor <= BigInt(value); factor += 1n) {
    answer *= factor;
  }
  return answer;
}

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

function sample(name, details, repetitions, evaluate, validate) {
  const samples = [];
  let answer = evaluate();
  validate(answer);
  for (let index = 0; index < repetitions; index += 1) {
    const started = performance.now();
    answer = evaluate();
    samples.push((performance.now() - started) / 1000);
    validate(answer);
  }
  return {
    name,
    runtime: "Sage.js/igraph 1.0.1",
    ...details,
    samples,
    medianSeconds: median(samples),
  };
}

const rows = [];
for (const order of [10, 50, 100]) {
  const input = complete(order);
  const expected = factorial(order).toString();
  rows.push(sample(
    "complete-graph-automorphisms",
    { algorithm: "Bliss", family: `K_${order}`, vertices: order },
    7,
    () => graph.automorphismGroup(input),
    (answer) => {
      if (answer.order !== expected || answer.generators.length > order) {
        throw new Error(`incorrect compact automorphism group for K_${order}`);
      }
    },
  ));
}

{
  const order = 10000;
  const input = cycle(order);
  rows.push(sample(
    "cycle-automorphisms",
    { algorithm: "Bliss", family: `C_${order}`, vertices: order },
    5,
    () => graph.automorphismGroup(input),
    (answer) => {
      if (answer.order !== String(2 * order) || answer.generators.length > 3) {
        throw new Error(`incorrect compact automorphism group for C_${order}`);
      }
    },
  ));
}

{
  const order = 10007;
  const left = cycle(order);
  const right = cycle(order, (vertex) => (37 * vertex + 19) % order);
  rows.push(sample(
    "cycle-isomorphism",
    { algorithm: "Bliss", family: `C_${order}`, vertices: order },
    5,
    () => graph.isomorphic(left, right),
    (answer) => {
      if (answer !== true) throw new Error("isomorphic cycles were rejected");
    },
  ));
}

{
  const order = 5000;
  const input = cycle(order);
  rows.push(sample(
    "force-layout",
    { algorithm: "Fruchterman-Reingold grid", family: `C_${order}`, vertices: order },
    3,
    () => graph.layout(input, "fr"),
    (answer) => {
      if (
        answer.length !== order ||
        answer.some((point) => point.length !== 2 || !point.every(Number.isFinite))
      ) {
        throw new Error("force layout returned invalid coordinates");
      }
    },
  ));
}

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  status: "local-pilot",
  suite: "graph-theory",
  environment: {
    cpu: require("node:os").cpus()[0]?.model,
    allocatedCores: require("node:os").availableParallelism(),
    node: process.versions.node,
    platform: `${process.platform}-${process.arch}`,
  },
  correct: true,
  rows,
  warning: "This is a native-kernel pilot, not a cross-system competitive claim. Run on a dedicated benchmark host and add SageMath/nauty/Traces comparisons before publishing release ratios.",
};

if (json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(
    "case family algorithm".padEnd(69),
    "median".padStart(12),
  );
  console.log("-".repeat(82));
  for (const row of rows) {
    const label = `${row.name} ${row.family} ${row.algorithm}`;
    console.log(
      label.padEnd(69),
      `${(1000 * row.medianSeconds).toFixed(3)} ms`.padStart(12),
    );
  }
}
