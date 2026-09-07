// sagejs-test-tier: unit
"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { run, identity, snapshot, acquireLock } = require("../scripts/release/runner.cjs");
const { selectGate, performance } = require("../scripts/release/test-gates.cjs");
const { readStatus } = require("../scripts/release/status.cjs");
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-release-runner-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: "pipe" }).trim();
  git("init");
  git("config", "user.name", "Runner test");
  git("config", "user.email", "runner@example.invalid");
  fs.writeFileSync(path.join(root, ".gitignore"), "build/\n");
  git("add", ".gitignore");
  git("commit", "-m", "fixture");
  fs.mkdirSync(path.join(root, "build"));
  fs.writeFileSync(path.join(root, "build/input"), "input");
  // These tiny child-process fixtures exercise scheduling, not production
  // capacity. Capacity policy and failure injection have their own tests.
  return { root, candidate: git("rev-parse", "HEAD"), preflight: () => ({ passed: true }) };
}
function task(id, code, extra = {}) {
  return { id, gate: "correctness", timeoutSeconds: 30,
    commands: [["node", "-e", code]], inputs: ["build/input"], ...extra };
}
test("checkpoints reuse exact successful inputs, but reject altered outputs and commands", async (t) => {
  const context = fixture(t);
  const stages = [task("one", "require('fs').writeFileSync('build/output','ok')", { outputs: ["build/output"] })];
  assert.equal((await run({ ...context, stages }))[0].reused, undefined);
  assert.equal((await run({ ...context, stages }))[0].reused, true);
  fs.writeFileSync(path.join(context.root, "build/output"), "corrupt");
  assert.equal((await run({ ...context, stages }))[0].reused, undefined);
  stages[0].commands[0][2] += "; void 0";
  assert.equal((await run({ ...context, stages }))[0].reused, undefined);
  fs.writeFileSync(path.join(context.root, "build/input"), "changed");
  assert.equal((await run({ ...context, stages }))[0].reused, undefined);
});
test("failed stages stop scheduling and resume without repeating passed work", async (t) => {
  const context = fixture(t);
  const stages = [task("one", "void 0"), task("two", "process.exit(3)"), task("three", "void 0")];
  await assert.rejects(run({ ...context, stages }), /two: command failed/);
  const directory = path.join(context.root, "build/release-runner", context.candidate);
  assert.equal(fs.existsSync(path.join(directory, "three.json")), false);
  const failed = readStatus(context.root, context.candidate);
  assert.equal(failed.state, "failed");
  assert.deepEqual(failed.stages.map((stage) => stage.state), ["passed", "failed", "blocked"]);
  assert.equal(failed.failure.code, "RELEASE_COMMAND");
  stages[1].commands[0][2] = "void 0";
  assert.equal((await run({ ...context, stages }))[0].reused, true);
  const passed = readStatus(context.root, context.candidate);
  assert.equal(passed.state, "passed");
  assert.equal(passed.stages[0].reused, true);
  assert.notEqual(passed.runId, failed.runId);
  assert.equal(JSON.parse(fs.readFileSync(path.join(directory, "runs", `${failed.runId}.json`))).state, "failed");
  assert.equal(JSON.parse(fs.readFileSync(path.join(directory, "runs", failed.runId, "two.json"))).status, "failed");
});
test("dirty, wrong-source and absent-artifact qualifications fail closed", async (t) => {
  const context = fixture(t);
  assert.throws(() => identity(context.root, "0".repeat(40)), /current HEAD/);
  fs.writeFileSync(path.join(context.root, "untracked"), "dirty");
  assert.throws(() => identity(context.root, context.candidate), /clean worktree/);
  fs.unlinkSync(path.join(context.root, "untracked"));
  fs.unlinkSync(path.join(context.root, "build/input"));
  await assert.rejects(run({ ...context, stages: [task("missing", "void 0")] }), /ENOENT/);
  const status = readStatus(context.root, context.candidate);
  assert.equal(status.stages[0].state, "failed");
  assert.equal(status.failure.code, "ENOENT");
});
test("running checkpoints and corrupt state never authorize skipping", async (t) => {
  const context = fixture(t);
  const stages = [task("one", "void 0")];
  await run({ ...context, stages });
  const filename = path.join(context.root, "build/release-runner", context.candidate, "one.json");
  const receipt = JSON.parse(fs.readFileSync(filename));
  receipt.status = "running";
  fs.writeFileSync(filename, JSON.stringify(receipt));
  assert.equal((await run({ ...context, stages }))[0].reused, undefined);
  fs.writeFileSync(filename, "partial write");
  assert.equal((await run({ ...context, stages }))[0].reused, undefined);
});
test("lock prevents overlapping qualification and inputs cannot mutate unnoticed", async (t) => {
  const context = fixture(t);
  const release = acquireLock(path.join(context.root, "build/lock"));
  assert.throws(() => acquireLock(path.join(context.root, "build/lock")), /already active/);
  release();
  await assert.rejects(run({ ...context, stages: [task("mutate",
    "require('fs').writeFileSync('build/input','changed')")] }), /inputs changed/);
  assert.throws(() => snapshot(context.root, ["../outside"]), /escapes/);
});
test("timeout is a failed gate, not a passing checkpoint", async (t) => {
  const context = fixture(t);
  await assert.rejects(run({ ...context, stages: [task("timeout",
    "setInterval(()=>{},1000)", { timeoutSeconds: 0.05 })] }), /failed or interrupted/);
  assert.equal(readStatus(context.root, context.candidate).failure.code, "RELEASE_TIMEOUT");
});
test("fresh release stages force fresh nested file checkpoints", async (t) => {
  const context = fixture(t);
  const stage = task("fresh", "require('node:assert').ok(process.argv.includes('--resume-fresh'))");
  stage.commands[0].push("--", "--resume");
  await run({ ...context, stages: [stage], fresh: true });
});
test("space failure blocks child launch and retry reuses only completed stages", async (t) => {
  const context = fixture(t);
  const stages = [task("one", "void 0"), task("two", "require('fs').writeFileSync('build/launched','yes')")];
  let checks = 0;
  const preflight = () => {
    if (++checks === 2) throw Object.assign(new Error("disk exhausted"), {
      code: "RELEASE_PREFLIGHT", report: { passed: false, failures: ["disk exhausted"] },
    });
    return { passed: true };
  };
  await assert.rejects(run({ ...context, stages, preflight }), /disk exhausted/);
  assert.equal(fs.existsSync(path.join(context.root, "build/launched")), false);
  const status = readStatus(context.root, context.candidate);
  assert.equal(status.failure.code, "RELEASE_PREFLIGHT");
  assert.equal(status.stages[1].preflight.passed, false);
  const result = await run({ ...context, stages });
  assert.equal(result[0].reused, true);
  assert.equal(result[1].reused, undefined);
});
test("child sees durable running status; preflight uses the child's scratch environment", async (t) => {
  const context = fixture(t);
  const statusPath = `build/release-runner/${context.candidate}/status.json`;
  const stages = [task("observe", `const s=JSON.parse(require('fs').readFileSync(${JSON.stringify(statusPath)}));
    require('assert').equal(s.state,'running'); require('assert').equal(s.stages[0].state,'running');
    require('assert').ok(s.stages[0].log);`, { env: { TMPDIR: "stage-scratch" } })];
  await run({ ...context, stages, preflight({ environment }) {
    assert.equal(environment.TMPDIR, "stage-scratch"); return { passed: true };
  } });
});
test("ENOSPC writing a child log cancels work and preserves a failed attempt", async (t) => {
  const context = fixture(t);
  const write = fs.writeSync;
  fs.writeSync = (descriptor, data, ...args) => {
    if (Buffer.isBuffer(data) && data.toString().includes("simulate-log-full")) {
      throw Object.assign(new Error("log disk full"), { code: "ENOSPC" });
    }
    return write(descriptor, data, ...args);
  };
  try {
    await assert.rejects(run({ ...context, stages: [task("full",
      "console.log('simulate-log-full'); setInterval(()=>{},1000)"), task("later", "void 0")] }), { code: "ENOSPC" });
  } finally { fs.writeSync = write; }
  const status = readStatus(context.root, context.candidate);
  assert.equal(status.failure.code, "ENOSPC");
  assert.deepEqual(status.stages.map((stage) => stage.state), ["failed", "blocked"]);
});
test("status works without a build and rejects unsafe paths or corrupt journal identities", (t) => {
  const context = fixture(t);
  assert.equal(readStatus(context.root, context.candidate).state, "unrecorded");
  assert.throws(() => readStatus(context.root, "../../other"), /full candidate/);
  const directory = path.join(context.root, "build/release-runner", context.candidate);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "status.json"), JSON.stringify({ schema: "other" }));
  assert.throws(() => readStatus(context.root, context.candidate), /identity\/schema/);
});
test("gate partition is exhaustive and disjoint; default still runs everything", () => {
  const files = ["test/example.cjs", ...performance];
  const correctness = selectGate(files, "correctness");
  const timing = selectGate(files, "performance");
  assert.deepEqual([...correctness, ...timing].sort(), [...files].sort());
  assert.ok(correctness.every((file) => !timing.includes(file)));
  assert.equal(selectGate(files), files);
  assert.throws(() => selectGate(files, "optional"), /unknown/);
});
test("mixed dense-matrix checks retain every assertion in the serial timing gate", () => {
  const files = ["test/dense-prime-host-boundary.cjs"];
  assert.deepEqual(selectGate(files, "correctness"), []);
  assert.deepEqual(selectGate(files, "performance"), files);
  assert.equal(selectGate(files), files);
  const stages = require("../scripts/release/stages.cjs").plan("native", "integration-performance");
  assert.equal(stages[0].gate, "performance");
  assert.deepEqual(stages[0].commands, [["node", "scripts/run-test-tier.cjs",
    "integration", "--gate", "performance", "--concurrency", "1"]]);
  for (const filename of performance) {
    const source = fs.readFileSync(path.join(__dirname, "..", filename), "utf8");
    assert.match(source, /sagejs-test-tier: integration/, filename);
  }
});
test("coordinator quotes host launch commands without interpolating checkout or environment", () => {
  const { remoteCommand } = require("../scripts/release/coordinate.cjs");
  const host = { root: "/path with spaces/and'quotes", target: "linux-x64", env: { EXAMPLE: "$not-a-shell-variable" } };
  const command = remoteCommand(host, "a".repeat(40));
  assert.ok(command.startsWith("'node' '"));
  assert.ok(command.includes("scripts/release/launch-host.cjs"));
  assert.ok(!command.includes(" -e "));
  assert.ok(!command.includes(host.env.EXAMPLE));
  assert.ok(remoteCommand({ ...host, target: "windows-x64" }, "b".repeat(40)).startsWith("& 'node' '"));
});
test("native profile performs installation before long tests and retains numerical gates", () => {
  const source = fs.readFileSync(path.join(__dirname, "../scripts/release/stages.cjs"), "utf8");
  for (const target of ["linux-x64", "linux-arm64", "macos-arm64", "windows-x64"]) {
    const module = { exports: {} };
    require("node:vm").runInNewContext(source, {
      module,
      require(name) {
        assert.equal(name, "../package-qualification/runtime.cjs");
        return { targetForHost: () => target };
      },
    });
    const ids = module.exports.plan().map((stage) => stage.id);
    const install = ids.indexOf("package-install");
    assert.ok(install >= 0);
    for (const id of ["numerical-node", "numerical-npm", "numerical-sea", "native", "native-performance",
      target === "linux-x64" ? "unit" : "portable"]) {
      assert.ok(ids.indexOf(id) > install, `${target}: installation precedes ${id}`);
    }
    if (target !== "linux-arm64") {
      assert.ok(ids.indexOf("integration") > install);
      assert.ok(ids.indexOf("integration-performance") > ids.indexOf("integration"));
    } else {
      assert.ok(!ids.includes("integration"), "ARM64 matches its portable/native CI inventory");
      assert.ok(!ids.includes("integration-performance"));
    }
    assert.equal(new Set(ids).size, ids.length);
  }
});
test("canonical runtime completes the lazy cache before browser inputs are frozen", () => {
  const stages = require("../scripts/release/stages.cjs").plan("canonical");
  const runtime = stages.find((stage) => stage.id === "public-runtime");
  const browser = stages.find((stage) => stage.id === "public-build");
  assert.deepEqual(runtime.commands, [["pnpm", "build"], ["pnpm", "python:precompile:run"]]);
  assert.ok(runtime.outputs.includes("dist"));
  assert.ok(browser.inputs.includes("dist"));
  assert.ok(stages.indexOf(runtime) < stages.indexOf(browser));
});
test("native preparation finishes mutable runtime caches before qualification", () => {
  const stages = require("../scripts/release/stages.cjs").plan("native");
  const bootstrap = stages.find((stage) => stage.id === "bootstrap");
  assert.deepEqual(bootstrap.commands.slice(1), [["pnpm", "python:precompile:run"],
    ["node", "scripts/release/prepare-test-runtime.cjs"]]);
  assert.ok(stages.indexOf(bootstrap) < stages.findIndex((stage) => stage.id === "sea"));
});
test("browser workload enforcement consumes parity and acceptance before timing reports", () => {
  const stages = require("../scripts/release/stages.cjs").plan("browser");
  const enforcement = stages.find((stage) => stage.id === "wasm-workload");
  assert.equal(enforcement.id, "wasm-workload");
  assert.ok(enforcement.commands[0].includes("--explicit-receipts-only"));
  assert.ok(enforcement.commands[0].includes("--acceptance-only"));
  assert.ok(enforcement.commands[0].includes("{candidate}"));
  assert.ok(!stages.find((stage) => stage.id === "wasm-node").commands.flat().includes("wasm:workload-enforce"));
  for (const engine of ["chromium", "firefox", "webkit"]) {
    const producer = stages.find((stage) => stage.id === `wasm-${engine}`);
    assert.ok(stages.indexOf(producer) < stages.indexOf(enforcement));
    assert.ok(producer.commands.flat().includes("bench/browser-wasm-workload-acceptance.mjs"));
    for (const name of [`build/wasm-parity-${engine}.json`, `build/wasm-acceptance-${engine}.json`]) {
      assert.ok(producer.outputs.includes(name));
      assert.ok(enforcement.inputs.includes(name));
      assert.ok(enforcement.commands[0].includes(name));
    }
  }
  for (const stage of stages.filter((stage) => stage.gate === "performance-report")) {
    assert.ok(stages.indexOf(stage) > stages.indexOf(enforcement));
  }
  assert.equal(stages.filter((stage) => stage.gate === "performance-report").length, 4);
  assert.ok(!enforcement.inputs.some((name) => name.includes("performance")));
});
