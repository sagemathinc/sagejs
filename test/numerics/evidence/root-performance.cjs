// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { validateCorpus } = require("../../../scripts/numerical-computing/contracts.cjs");
const { readJson } = require("../../../scripts/numerical-computing/common.cjs");
const { capabilityDraft } = require(
  "../../../scripts/numerical-computing/qualification/prepare-node.cjs"
);
const {
  benchmarkSource,
  normalize,
  parseMarkedEvaluation,
} = require(
  "../../../bench/numerical-computing/qualification/root-performance-adapter.cjs"
)._testing;
const {
  ADAPTER,
  CORPUS,
  parseArguments,
} = require(
  "../../../scripts/numerical-computing/qualification/collect-root-performance.cjs"
);

const root = path.resolve(__dirname, "..", "..", "..");
const corpus = validateCorpus(readJson(path.join(root, CORPUS)));
const specification = readJson(path.join(
  root,
  "bench/numerical-computing/qualification/root-performance-capability-spec.json",
));

test("root performance corpus spans methods, trace policies, and callback tiers", () => {
  assert.equal(corpus.cases.length, 12);
  const combinations = new Set(corpus.cases.map((item) =>
    `${item.input.method}:${item.input.callback_tier}`));
  assert.deepEqual(
    combinations,
    new Set(["bisection", "brent", "newton", "secant"].flatMap((method) =>
      ["cheap", "moderate", "expensive"].map((tier) => `${method}:${tier}`))),
  );
  for (const item of corpus.cases) {
    assert.equal(item.measurement.warmup, 2);
    assert.equal(item.measurement.samples, 7);
    assert.equal(item.input.release_ceiling_ms_per_solve, 500);
    assert.deepEqual(
      item.checks.filter((check) => check.id.endsWith("release-ceiling"))
        .map((check) => check.expected.literal),
      [500, 500],
    );
  }
  const draft = capabilityDraft(
    specification,
    corpus,
    { kind: "node", name: "node", version: process.version, engine: null },
  );
  assert.deepEqual(draft.capabilities[0].case_ids, [...combinations].map((entry) => {
    const [method, tier] = entry.split(":");
    return `p1-root-${method}-${tier}`;
  }).sort());
  assert.equal(draft.capabilities[0].envelope.acceleration, "none-qualified");
});

function runUnderCPython(input, sampleIndex = 0) {
  const source = benchmarkSource(input, sampleIndex);
  const python = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
  const prefix = [
    "import collections.abc, hashlib, json, math, sys, time, typing",
    `sys.path.insert(0, ${JSON.stringify(path.join(root, "src", "lib"))})`,
  ].join("\n");
  const result = spawnSync(python, ["-I", "-c", `${prefix}\n${source}`], {
    cwd: root,
    encoding: "utf8",
    timeout: 30_000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return parseMarkedEvaluation(result);
}

test("benchmark source is ordinary CPython and observes both trace modes", () => {
  const input = {
    method: "brent",
    callback_tier: "cheap",
    callback_work: 0,
    repetitions: 2,
    release_ceiling_ms_per_solve: 500,
  };
  const raw = runUnderCPython(input);
  assert.equal(raw.records.none.roots.length, 2);
  assert.equal(raw.records.iterations.roots.length, 2);
  assert.ok(raw.records.none.iteration_events.every((value) => value === 0));
  assert.ok(raw.records.iterations.iteration_events.every((value) => value > 0));
  const observation = normalize(raw, input, 1.25);
  assert.equal(observation.values.all_success, true);
  assert.equal(observation.values.identity_matches, true);
  assert.equal(observation.values.trace_modes_observed, true);
  assert.ok(observation.values.max_residual <= 5e-11);
  assert.ok(observation.values.max_root_error <= 2e-11);
  assert.equal(observation.metrics.counters.solves, 4);
});

test("every method and callback tier satisfies the independent oracle", () => {
  for (const item of corpus.cases) {
    const input = { ...item.input, repetitions: 1 };
    const raw = runUnderCPython(input, 1);
    const observation = normalize(raw, input, 1);
    assert.equal(observation.values.all_success, true, item.id);
    assert.equal(observation.values.identity_matches, true, item.id);
    assert.equal(observation.values.trace_modes_observed, true, item.id);
    assert.ok(observation.values.max_residual <= 5e-11, item.id);
    assert.ok(observation.values.max_root_error <= 2e-11, item.id);
  }
});

test("marked runtime parsing accepts session streams and package process output", () => {
  const record = { records: {}, callback_calls: 0 };
  const line = `__SAGEJS_ROOT_PERFORMANCE__${JSON.stringify(record)}`;
  assert.deepEqual(parseMarkedEvaluation([{ name: "stdout", text: `${line}\n` }]), record);
  assert.deepEqual(parseMarkedEvaluation({ stdout: `${line}\n`, stderr: "" }), record);
  assert.throws(
    () => parseMarkedEvaluation({ stdout: "unmarked\n", stderr: "" }),
    /no marked result/,
  );
});

test("release hook has fixed corpus and adapter and accepts repeated bound artifacts", () => {
  const candidate = "1".repeat(40);
  assert.equal(CORPUS, "bench/numerical-computing/qualification/root-performance.corpus.json");
  assert.equal(ADAPTER, "bench/numerical-computing/qualification/root-performance-adapter.cjs");
  assert.deepEqual(parseArguments([
    "--", "--candidate", candidate,
    "--capabilities", "build/root/capabilities.json",
    "--artifact", "sagejs-dist=dist",
    "--artifact", "browser-dist=packages/flint-wasm/dist",
    "--output", "build/root/node.receipt.json",
  ]), {
    help: false,
    candidate,
    capabilities: "build/root/capabilities.json",
    artifacts: ["sagejs-dist=dist", "browser-dist=packages/flint-wasm/dist"],
    output: "build/root/node.receipt.json",
  });
  assert.throws(() => parseArguments([
    "--candidate", candidate,
    "--capabilities", "build/root/capabilities.json",
    "--artifact", "sagejs-dist=dist",
    "--artifact", "sagejs-dist=other",
    "--output", "build/root/node.receipt.json",
  ]), /uniquely named/);
  assert.throws(() => parseArguments([
    "--candidate", candidate,
    "--capabilities", "build/root/capabilities.json",
    "--artifact", "sagejs-dist",
    "--output", "build/root/node.receipt.json",
  ]), /NAME=PATH/);
  const source = fs.readFileSync(path.join(
    root,
    "scripts/numerical-computing/qualification/collect-root-performance.cjs",
  ), "utf8");
  assert.match(source, /repositoryIdentity\(root\)/);
  assert.match(source, /before\.commit !== options\.candidate/);
  assert.match(source, /verifyReceipt[\s\S]+requireClean: true/);
  assert.doesNotMatch(source, /platform override|--platform|--subject/);
});
