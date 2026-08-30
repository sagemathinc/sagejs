// sagejs-test-tier: specialized
"use strict";

process.env.SAGEJS_HYPERELLIPTIC_AUTO_RECEIPT_POLICY = "off";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");
const { Script } = require("node:vm");

const {
  parseArguments,
  profileProcessEvidence,
} = require("../scripts/optimizer-profile.cjs");
const {
  createPrivateProfileEventCollector,
  runAuthenticatedNodeProfile,
} = require("../dist/tools/optimizer-profiler.js");
const {
  hotColdFixture,
} = require("./fixtures/optimizer-development/profile/helpers.cjs");

const ROOT = path.resolve(__dirname, "..");
const RUNNER = path.join(
  ROOT,
  "test/fixtures/optimizer-development/profile-lazy/runner.cjs",
);

function runRaw(payload) {
  const child = spawnSync(process.execPath, [RUNNER], {
    cwd: ROOT,
    env: {
      ...process.env,
      SAGEJS_HYPERELLIPTIC_AUTO_RECEIPT_POLICY: "off",
      SAGEJS_NATIVE_DISABLE: "1",
    },
    input: JSON.stringify(payload),
    encoding: "utf8",
    timeout: 60_000,
    maxBuffer: 128 * 1024 * 1024,
  });
  const line = child.stdout.trim().split("\n").at(-1);
  assert.ok(line, child.stderr);
  return JSON.parse(line);
}

function run(payload) {
  const result = runRaw(payload);
  assert.equal(result.ok, true, JSON.stringify(result.error));
  return result.value;
}

function countRoute(observation, outcome) {
  return observation.privateEvents.aggregates
    .filter((event) => event.outcome === outcome)
    .reduce((total, event) => total + event.count, 0);
}

test("prepared profiles authenticate before sampling and clear warmup routes", () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-warm-profile-"));
  const eagerFilename = path.join(temporary, "warm_profile_eager.py");
  fs.writeFileSync(eagerFilename, "VALUE = 29\n");
  const source = [
    "import sys",
    `sys.path.insert(0, ${JSON.stringify(temporary)})`,
    "import warm_profile_eager",
    "state = 0",
    "",
    "def prepare_workload():",
    "    global state",
    "    state = warm_profile_eager.VALUE - 19",
    "",
    "def run_workload():",
    "    global state",
    "    state += 1",
    "    total = 0",
    "    for step in range(300000):",
    "        total += step",
    "    return state",
  ].join("\n");

  const value = run({
    action: "evaluate",
    source: [
      "import sys",
      `sys.path.insert(0, ${JSON.stringify(temporary)})`,
      "import warm_profile_eager",
      "warm_profile_eager.VALUE",
    ].join("\n"),
  }).evaluation;
  assert.equal(value.repr, "29");

  const result = run({
    action: "profile",
    source,
    options: {
      filename: path.join(temporary, "warm-profile.sage"),
      language: "sage",
      entryPoint: "run_workload",
      prepareEntryPoint: "prepare_workload",
      warmupRuns: 2,
      repetitions: 3,
      samplingIntervalMicros: 100,
    },
  });
  assert.equal(result.evaluation.repr, "15");
  assert.equal(
    result.observation.sampling.scope,
    "warm-prepared-sealed-generated-javascript-execution",
  );
  assert.equal(result.observation.sampling.warmupRuns, 2);
  assert.equal(result.observation.sampling.repetitions, 3);
  assert.ok(result.observation.sampling.preparationMicros > 0);
  assert.ok(result.sourceMaps.some((map) =>
    map.source.identity.path.endsWith("warm_profile_eager.py")));
});

test("warmup route events are absent from the sampled receipt", async () => {
  const fixture = hotColdFixture(
    5_000_000,
    `sagejs-profile:///prepared-route-${process.pid}-${Date.now()}.js`,
  );
  const events = createPrivateProfileEventCollector();
  let program;
  const observation = await runAuthenticatedNodeProfile({
    map: fixture.map,
    javascript: fixture.javascript,
    privateEvents: events,
    samplingIntervalMicros: 100,
    warmupRuns: 2,
    repetitions: 3,
    prepare() {
      program = new Script(fixture.javascript, { filename: fixture.url });
    },
    execute() {
      events.observer(
        "test.prepared-route.v1",
        "test.prepared-route",
        "selected-static-entry",
      );
      return program.runInThisContext();
    },
  });
  assert.equal(observation.privateEvents.count, 3);
  assert.equal(countRoute(observation, "selected-static-entry"), 3);
  assert.equal(observation.sampling.warmupRuns, 2);
  assert.equal(observation.sampling.repetitions, 3);
});

test("a sampled late import fails against the sealed prepared closure", () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-late-profile-"));
  fs.writeFileSync(path.join(temporary, "warm_profile_late.py"), "VALUE = 31\n");
  const source = [
    "import sys",
    `sys.path.insert(0, ${JSON.stringify(temporary)})`,
    "calls = 0",
    "",
    "def run_workload():",
    "    global calls",
    "    calls += 1",
    "    if calls > 1:",
    "        import warm_profile_late",
    "        return warm_profile_late.VALUE",
    "    return calls",
  ].join("\n");
  const result = runRaw({
    action: "profile",
    source,
    options: {
      filename: path.join(temporary, "late-profile.sage"),
      entryPoint: "run_workload",
      warmupRuns: 1,
      repetitions: 1,
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.name, "OptimizerProfileExecutionError");
  assert.equal(
    result.error.observation.execution.error.name,
    "OptimizerProfileLateImportError",
  );
  assert.match(result.error.message, /sealed optimizer profile rejected late lazy import/);
  assert.ok(result.error.observation.artifacts.every((artifact) =>
    !artifact.url.includes("warm_profile_late")));
});

test("a caught late-import exception still invalidates the host receipt", () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-caught-late-profile-"));
  fs.writeFileSync(path.join(temporary, "caught_late.py"), "VALUE = 37\n");
  const source = [
    "import sys",
    `sys.path.insert(0, ${JSON.stringify(temporary)})`,
    "calls = 0",
    "",
    "def run_workload():",
    "    global calls",
    "    calls += 1",
    "    if calls > 1:",
    "        try:",
    "            import caught_late",
    "        except Exception:",
    "            return 37",
    "    return calls",
  ].join("\n");
  const result = runRaw({
    action: "profile",
    source,
    options: {
      filename: path.join(temporary, "caught-late-profile.sage"),
      entryPoint: "run_workload",
      warmupRuns: 1,
      repetitions: 1,
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.name, "OptimizerProfileExecutionError");
  assert.equal(
    result.error.observation.execution.error.name,
    "OptimizerProfileLateImportError",
  );
});

test("the CLI exposes an explicit prepared sampling protocol", () => {
  const parsed = parseArguments([
    "--entry", "run_workload",
    "--prepare", "prepare_workload",
    "--warmups", "2",
    "--repetitions", "7",
    "workload.py",
  ]);
  assert.equal(parsed.entryPoint, "run_workload");
  assert.equal(parsed.prepareEntryPoint, "prepare_workload");
  assert.equal(parsed.warmupRuns, 2);
  assert.equal(parsed.repetitions, 7);
  assert.throws(
    () => parseArguments(["--warmups", "1", "workload.py"]),
    /require --entry/,
  );
});

test("profile receipts bind and label the no-inlining attribution mode", () => {
  const options = parseArguments([
    "--entry", "run_workload",
    "--prepare", "prepare_workload",
    "--warmups", "2",
    "--repetitions", "7",
    "workload.py",
  ]);
  const ordinary = profileProcessEvidence(
    options,
    "1".repeat(64),
    [],
    { SAGEJS_HYPERELLIPTIC_AUTO_RECEIPT_POLICY: "off" },
  );
  const noInlining = profileProcessEvidence(
    options,
    "1".repeat(64),
    ["--no-turbo-inlining"],
    { SAGEJS_HYPERELLIPTIC_AUTO_RECEIPT_POLICY: "off" },
  );
  assert.deepEqual(ordinary.capabilities, ["optimizer-source-sampling"]);
  assert.deepEqual(noInlining.capabilities, [
    "optimizer-source-sampling",
    "v8-turbo-inlining-disabled",
  ]);
  assert.deepEqual(noInlining.environment.nodeExecArgv, ["--no-turbo-inlining"]);
  assert.notDeepEqual(ordinary.environment, noInlining.environment);
});
