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
  return { root, candidate: git("rev-parse", "HEAD") };
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
  stages[1].commands[0][2] = "void 0";
  assert.equal((await run({ ...context, stages }))[0].reused, true);
});
test("dirty, wrong-source and absent-artifact qualifications fail closed", async (t) => {
  const context = fixture(t);
  assert.throws(() => identity(context.root, "0".repeat(40)), /current HEAD/);
  fs.writeFileSync(path.join(context.root, "untracked"), "dirty");
  assert.throws(() => identity(context.root, context.candidate), /clean worktree/);
  fs.unlinkSync(path.join(context.root, "untracked"));
  fs.unlinkSync(path.join(context.root, "build/input"));
  await assert.rejects(run({ ...context, stages: [task("missing", "void 0")] }), /ENOENT/);
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
test("coordinator quotes host launch commands without interpolating checkout or environment", () => {
  const { remoteCommand } = require("../scripts/release/coordinate.cjs");
  const host = { root: "/path with spaces/and'quotes", target: "linux-x64", env: { EXAMPLE: "$not-a-shell-variable" } };
  const command = remoteCommand(host, "a".repeat(40));
  assert.ok(command.startsWith("'node' -e '"));
  assert.ok(!command.includes(host.root));
  assert.ok(!command.includes(host.env.EXAMPLE));
  assert.ok(remoteCommand({ ...host, target: "windows-x64" }, "b".repeat(40)).startsWith("& 'node' -e '"));
});
test("native profile performs installation before long tests and retains numerical gates", () => {
  const stages = require("../scripts/release/stages.cjs").plan();
  const ids = stages.map((stage) => stage.id);
  assert.ok(ids.indexOf("package-install") < ids.indexOf("integration"));
  for (const id of ["numerical-node", "numerical-npm", "numerical-sea", "integration-performance", "native-performance"]) assert.ok(ids.includes(id));
  assert.equal(new Set(ids).size, ids.length);
});
