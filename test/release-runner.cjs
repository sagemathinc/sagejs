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
test("parent cancellation reaches the running child and never records a pass", async (t) => {
  const context = fixture(t), controller = new AbortController();
  const running = run({ ...context, signal: controller.signal, stages: [task("cancelled",
    "require('fs').writeFileSync('build/child-pid',String(process.pid));setInterval(()=>{},1000)"), task("never", "void 0")] });
  const rejected = assert.rejects(running, /interrupted/);
  const marker = path.join(context.root, "build/child-pid");
  try {
    const deadline = Date.now() + 5000;
    while (!fs.existsSync(marker) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.ok(fs.existsSync(marker), "child started before cancellation");
  } finally { controller.abort(); await rejected; }
  const pid = Number(fs.readFileSync(marker, "utf8"));
  assert.throws(() => process.kill(pid, 0), (error) => error.code === "ESRCH");
  const status = readStatus(context.root, context.candidate);
  assert.equal(status.state, "failed");
  assert.deepEqual(status.stages.map((stage) => stage.state), ["failed", "blocked"]);
  assert.equal(fs.existsSync(path.join(context.root, "build/release-runner/active.lock")), false);
});
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
test("status computes fresh observation times without rewriting durable evidence or assuming owner health", (t) => {
  const context = fixture(t);
  const filename = path.join(context.root, "build/release-runner", context.candidate, "status.json");
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const journal = { schema: "sagejs.release-run/v1", source: { commit: context.candidate },
    owner: { host: "reference-host", pid: 42 }, state: "running", elapsedSeconds: 10,
    started: "2026-09-07T00:00:00.000Z", updated: "2026-09-07T00:00:10.000Z",
    stages: [{ id: "built", state: "passed", durationSeconds: 10 },
      { id: "building", state: "running", started: "2026-09-07T00:00:10.000Z" },
      { id: "next", state: "pending" }] };
  const options = { hostname: "reference-host", probe: () => {}, now: Date.parse("2026-09-07T00:05:00.000Z") };
  const save = () => fs.writeFileSync(filename, JSON.stringify(journal));
  save();
  const before = fs.readFileSync(filename);
  const live = readStatus(context.root, context.candidate, options);
  assert.equal(live.elapsedSeconds, 10, "durable elapsed field is not silently overwritten");
  assert.equal(live.observation.elapsedSeconds, 300);
  assert.equal(live.observation.journalAgeSeconds, 290);
  assert.deepEqual(live.observation.activeStages, [{ id: "building", state: "running", elapsedSeconds: 290 }]);
  assert.equal(readStatus(context.root, context.candidate, { ...options, now: options.now + 1000 }).observation.elapsedSeconds, 301);
  assert.deepEqual(fs.readFileSync(filename), before);
  for (const code of ["ESRCH", "EPERM"]) {
    const result = readStatus(context.root, context.candidate, { ...options,
      probe: () => { throw Object.assign(new Error(), { code }); } });
    assert.equal(result.observation.elapsedSeconds, null);
    assert.equal(result.observation.activeStages[0].elapsedSeconds, null);
    assert.equal(result.observation.journalAgeSeconds, 290);
  }
  assert.equal(readStatus(context.root, context.candidate, { ...options, hostname: "remote" }).observation.elapsedSeconds, null);
  journal.state = "failed";
  save();
  assert.equal(readStatus(context.root, context.candidate, options).observation.elapsedSeconds, null);
  journal.state = "running";
  journal.started = "not-a-time";
  journal.stages[1].started = "2026-09-08T00:00:00.000Z";
  save();
  const invalid = readStatus(context.root, context.candidate, options);
  assert.equal(invalid.observation.elapsedSeconds, null);
  assert.equal(invalid.observation.activeStages[0].elapsedSeconds, null);
  assert.throws(() => readStatus(context.root, context.candidate, { ...options, now: NaN }), /observation time/);
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
        if (name === "./source-preflight.cjs") return require("../scripts/release/source-preflight.cjs");
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
test("non-publishing preparation is distinct from mandatory canonical numerical admission", () => {
  const { plan } = require("../scripts/release/stages.cjs");
  const preparation = plan("preparation"), canonical = plan("canonical");
  assert.deepEqual(preparation.map((stage) => stage.id), ["numerical-product", "public-runtime", "public-build", "public-pack"]);
  assert.deepEqual(canonical.map((stage) => stage.id), ["numerical-product", "numerical-eligibility", "public-runtime", "public-build", "public-pack"]);
  assert.deepEqual(canonical.filter((stage) => stage.id !== "numerical-eligibility"), preparation);
  const admission = canonical[1];
  assert.equal(admission.gate, "numerical-evidence");
  assert.deepEqual(admission.commands, [["node", "src/lib/sagejs/numerics/optimization/backends/nlopt/scripts/verify-release.cjs", "--require-qualified"]]);
  assert.ok(admission.inputs.includes("build/authenticated-numerical-product"));
  assert.ok(admission.inputs.includes("src/lib/sagejs/numerics/optimization/backends/nlopt/build"));
  assert.ok(!preparation.flatMap((stage) => stage.commands.flat()).includes("--require-qualified"));
  assert.throws(() => plan("typo", "numerical-product"), /unknown profile/);
  const ci = fs.readFileSync(path.join(__dirname, "../.github/workflows/ci.yml"), "utf8");
  assert.match(ci, /name: Require source-current qualified NLopt for a release product or candidate[\s\S]*?--require-qualified/);
});
test("preparation status cannot be mistaken for complete release qualification", async (t) => {
  const context = fixture(t);
  await run({ ...context, profile: "preparation", selectedStages: false,
    stages: [task("numerical-product", "void 0")] });
  const status = readStatus(context.root, context.candidate);
  assert.deepEqual(status.scope, { profile: "preparation", selectedStages: false,
    authority: "scheduling-only; not release eligibility or publication authorization" });
  // A successful preparation checkpoint is reusable, but never satisfies a
  // different admission command or grants a successful canonical status.
  await assert.rejects(run({ ...context, profile: "canonical", selectedStages: false,
    stages: [task("numerical-product", "void 0"), task("numerical-eligibility", "process.exit(1)")] }), /numerical-eligibility/);
  const failed = readStatus(context.root, context.candidate);
  assert.equal(failed.state, "failed");
  assert.equal(failed.scope.profile, "canonical");
  assert.equal(failed.stages[0].reused, true);
  assert.equal(failed.stages[1].state, "failed");
});
test("native preparation finishes mutable runtime caches before qualification", () => {
  const stages = require("../scripts/release/stages.cjs").plan("native");
  const bootstrap = stages.find((stage) => stage.id === "bootstrap");
  assert.deepEqual(bootstrap.commands.slice(1), [["pnpm", "python:precompile:run"],
    ["node", "scripts/release/prepare-test-runtime.cjs"]]);
  assert.ok(stages.indexOf(bootstrap) < stages.findIndex((stage) => stage.id === "sea"));
});
test("browser workload enforcement consumes parity and acceptance independently of reporting", () => {
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
  assert.equal(stages.filter((stage) => stage.gate === "performance-report").length, 0);
  assert.ok(stages.find((stage) => stage.id === "wasm-native-acceptance").commands.flat().includes("--native-acceptance"));
  const reports = require("../scripts/release/stages.cjs").plan("reporting");
  assert.equal(reports.length, 4);
  assert.ok(reports.every((stage) => stage.gate === "performance-report"));
  assert.deepEqual(reports[0].commands[0].slice(2, 6), ["--runtime", "node-native", "--samples", "7"]);
  assert.ok(reports.every((stage) => !stages.some((required) => required.id === stage.id)));
  assert.ok(reports.every((stage) => stage.commands.every((command) => command[0] === "node" && command[1] === "bench/browser-wasm-performance.mjs")), "reports consume prepared artifacts, never launch a build");
  assert.ok(!enforcement.inputs.some((name) => name.includes("performance")));
});
test("failed separate reporting does not invalidate accepted products or conceal correctness failure", async (t) => {
  const context = fixture(t);
  const product = task("product", "require('fs').writeFileSync('build/product','accepted')", { outputs: ["build/product"] });
  const reporting = task("report", "process.exit(7)", { gate: "performance-report" });
  await run({ ...context, stages: [product], profile: "browser", selectedStages: false });
  const accepted = readStatus(context.root, context.candidate);
  await assert.rejects(run({ ...context, stages: [reporting], profile: "reporting", selectedStages: false }), /command failed/);
  const failedReport = readStatus(context.root, context.candidate);
  assert.equal(failedReport.scope.profile, "reporting");
  assert.equal(failedReport.state, "failed", "report failure remains visible");
  const repeat = await run({ ...context, stages: [product], profile: "browser", selectedStages: false });
  assert.equal(repeat[0].reused, true);
  const retained = path.join(context.root, "build/release-runner", context.candidate, "runs");
  assert.equal(JSON.parse(fs.readFileSync(path.join(retained, `${accepted.runId}.json`))).state, "passed");
  assert.equal(JSON.parse(fs.readFileSync(path.join(retained, `${failedReport.runId}.json`))).state, "failed");
  product.commands = [["node", "-e", "process.exit(3)"]];
  await assert.rejects(run({ ...context, stages: [product], profile: "browser", selectedStages: false }), /command failed/);
  assert.equal(readStatus(context.root, context.candidate).state, "failed", "a changed correctness command cannot reuse older acceptance");
});
