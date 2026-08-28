// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const {
  analyzeSources,
  dashboardJson,
  formatQuery,
  queryDashboard,
  renderMarkdown,
  validateDashboard,
} = require("../scripts/optimizer-opportunity-dashboard.cjs");

const sources = Object.freeze([
  {
    relativePath: "src/lib/dashboard_selected.py",
    source: `
def recurrence(n: int, value: float, scale: float, increment: float):
    for index in range(n):
        value = value*scale + increment
    return value
`,
  },
  {
    relativePath: "src/lib/dashboard_rejected.py",
    source: `
def quotient(n: int, value: int, divisor: int):
    for index in range(n):
        value = value // divisor
    return value
`,
  },
  {
    relativePath: "src/lib/dashboard_unrecognized.py",
    source: `
def dynamic(values):
    for value in values:
        print(value)
`,
  },
  {
    relativePath: "src/lib/dashboard_near_miss.py",
    source: `
def store(values: IntegerBuffer, n: int, value: int):
    for index in range(n):
        values[index] = value
`,
  },
].map((item) => ({
  ...item,
  filename: path.join(root, item.relativePath),
})));

async function fixture() {
  return analyzeSources({
    root,
    sources,
    identity: {
      digest: "0".repeat(64),
      files: sources.length,
      bytes: sources.reduce(
        (sum, item) => sum + Buffer.byteLength(item.source),
        0,
      ),
    },
  });
}

test("dashboard classifies selected, rejected, and unrecognized loops", async () => {
  const dashboard = await fixture();
  assert.deepEqual(dashboard.summary, {
    sourceFilesDiscovered: 4,
    sourceFilesCompiled: 4,
    sourceFilesFailed: 0,
    functionsCompiled: 4,
    suitableFunctions: 4,
    loopsInFunctions: 4,
    moduleScopeLoops: 0,
    selectedLoops: 1,
    rejectedLoops: 2,
    unrecognizedLoops: 1,
    optimizerDecisions: 4,
    orphanOptimizerDecisions: 0,
    oneReasonNearMisses: 1,
  });

  const byPath = new Map(dashboard.loops.map((loop) => [loop.source.path, loop]));
  const selected = byPath.get("src/lib/dashboard_selected.py");
  assert.equal(selected.status, "selected");
  assert.deepEqual(
    selected.decisions.filter((decision) => decision.selected)
      .map((decision) => decision.passId),
    ["math.strict-float-region.v1"],
  );
  assert.match(selected.suggestedContracts[0].decorator, /strict-float-region/);

  const rejected = byPath.get("src/lib/dashboard_rejected.py");
  assert.equal(rejected.status, "rejected");
  assert.deepEqual(rejected.reasonCodes, [
    "bounded-integer.unsupported-operation://",
    "bounded-integer.unsupported-operation:=",
  ]);

  const unrecognized = byPath.get("src/lib/dashboard_unrecognized.py");
  assert.equal(unrecognized.status, "unrecognized");
  assert.deepEqual(unrecognized.reasonCodes, [
    "dashboard.dynamic-call-sites",
    "dashboard.no-current-pass-claimed",
    "dashboard.no-mathematical-domain-evidence",
  ]);

  const nearMiss = byPath.get("src/lib/dashboard_near_miss.py");
  assert.deepEqual(nearMiss.reasonCodes, [
    "bounded-integer.mutable-buffer-access",
  ]);
  assert.match(nearMiss.suggestedContracts[0].decorator, /target="v8"/);
  assert.equal(dashboard.nearMisses[0].loopId, nearMiss.id);
  assert.match(
    dashboard.nearMisses[0].suggestedContract.decorator,
    /math\.bounded-integer-region\.v1.*target="v8"/,
  );
});

test("dashboard output and location queries are deterministic", async () => {
  const first = await fixture();
  const second = await fixture();
  assert.equal(dashboardJson(first), dashboardJson(second));
  assert.equal(renderMarkdown(first), renderMarkdown(second));

  const query = queryDashboard(first, "src/lib/dashboard_selected.py:3");
  assert.equal(query.loops.length, 1);
  assert.equal(query.functions[0].qualifiedName, "recurrence");
  assert.match(formatQuery(query), /selected math\.strict-float-region\.v1/);
});

test("dashboard validation fails closed on incomplete evidence", async () => {
  const dashboard = await fixture();
  assert.throws(
    () => validateDashboard({
      ...dashboard,
      summary: { ...dashboard.summary, sourceFilesFailed: 1 },
    }),
    /sourceFilesFailed is inconsistent/,
  );
  assert.throws(
    () => validateDashboard({
      ...dashboard,
      loops: [...dashboard.loops, dashboard.loops[0]],
    }),
    /duplicate loop identity/,
  );
});
