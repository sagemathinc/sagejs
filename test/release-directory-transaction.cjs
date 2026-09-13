// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { replaceDirectory } = require("../scripts/release/directory-transaction.cjs");

function fixture(t) {
  const parent = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-transaction-")));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  let builds = 0;
  let verifies = 0;
  const options = { parent, name: "oracle",
    prepare(directory) { builds++; fs.writeFileSync(path.join(directory, "payload"), "current"); },
    validate(directory) { verifies++; assert.equal(fs.readFileSync(path.join(directory, "payload"), "utf8"), "current"); return "verified"; } };
  const target = path.join(parent, "oracle");
  const old = () => { fs.mkdirSync(target); fs.writeFileSync(path.join(target, "payload"), "previous"); };
  return { parent, target, options, old, builds: () => builds, verifies: () => verifies };
}

test("reuse revalidates current bytes without preparing a second installation", async (t) => {
  const f = fixture(t);
  assert.equal((await replaceDirectory(f.options)).reused, false);
  const checks = f.verifies();
  assert.equal((await replaceDirectory(f.options)).reused, true);
  assert.equal(f.builds(), 1);
  assert.ok(f.verifies() > checks);
});

test("replacement preserves the entire previous directory", async (t) => {
  const f = fixture(t); f.old();
  fs.writeFileSync(path.join(f.target, "additional-evidence"), "retain");
  const result = await replaceDirectory(f.options);
  assert.equal(fs.readFileSync(path.join(result.retained, "previous/payload"), "utf8"), "previous");
  assert.equal(fs.readFileSync(path.join(result.retained, "previous/additional-evidence"), "utf8"), "retain");
  assert.equal(fs.readFileSync(path.join(f.target, "payload"), "utf8"), "current");
});

for (const phase of ["ready", "previous-preserved", "installed"]) {
  test(`interruption at ${phase} recovers without rebuilding verified staged bytes`, async (t) => {
    const f = fixture(t); f.old();
    await assert.rejects(replaceDirectory({ ...f.options, checkpoint(at) { if (at === phase) throw new Error("interrupted"); } }), /interrupted/);
    const result = await replaceDirectory(f.options);
    assert.equal(result.value, "verified");
    assert.equal(f.builds(), 1);
    assert.equal(fs.readFileSync(path.join(f.target, "payload"), "utf8"), "current");
  });
}

test("failed private preparation leaves the previous installation in place", async (t) => {
  const f = fixture(t); f.old();
  await assert.rejects(replaceDirectory({ ...f.options, prepare(directory) {
    fs.writeFileSync(path.join(directory, "partial"), "partial"); throw Object.assign(new Error("disk full"), { code: "ENOSPC" });
  } }), /disk full/);
  assert.equal(fs.readFileSync(path.join(f.target, "payload"), "utf8"), "previous");
  await replaceDirectory(f.options);
  const store = path.join(f.parent, ".transactions-oracle");
  assert.ok(fs.readdirSync(store).some((name) => fs.existsSync(path.join(store, name, "new/partial"))));
});

test("post-install corruption is retained while retry restores and replaces the old directory", async (t) => {
  const f = fixture(t); f.old();
  await assert.rejects(replaceDirectory({ ...f.options, checkpoint(phase) {
    if (phase === "installed") fs.writeFileSync(path.join(f.target, "payload"), "corrupt");
  } }), /installed directory failed verification/);
  await replaceDirectory(f.options);
  assert.equal(f.builds(), 2);
  const store = path.join(f.parent, ".transactions-oracle");
  const all = fs.readdirSync(store).filter((name) => fs.lstatSync(path.join(store, name)).isDirectory());
  assert.ok(all.some((name) => fs.readdirSync(path.join(store, name)).some((entry) => entry.startsWith("failed-installed-"))));
});

test("overlapping transactions cannot prepare concurrently", async (t) => {
  const f = fixture(t);
  let release;
  let entered;
  const ready = new Promise((resolve) => { entered = resolve; });
  const first = replaceDirectory({ ...f.options, async prepare(directory) {
    entered(); await new Promise((resolve) => { release = resolve; }); f.options.prepare(directory);
  } });
  await ready;
  await assert.rejects(replaceDirectory(f.options), /already active/);
  release(); await first;
});

test("untrusted target objects and corrupt journals are rejected without moving them", async (t) => {
  const f = fixture(t);
  fs.writeFileSync(f.target, "not a directory");
  await assert.rejects(replaceDirectory(f.options), /canonical and link-free/);
  assert.equal(fs.readFileSync(f.target, "utf8"), "not a directory");
  fs.unlinkSync(f.target);
  fs.writeFileSync(path.join(f.parent, ".transactions-oracle/active.json"), JSON.stringify({
    schema: "sagejs.directory-transaction/v1", name: "oracle", id: "../../escape", phase: "ready",
  }));
  await assert.rejects(replaceDirectory(f.options), /invalid transaction journal/);
  assert.equal(f.builds(), 0);
});
test("standalone oracle preparation cannot borrow an unrelated checkout lease", async (t) => {
  const f = fixture(t);
  const locks = path.join(f.parent, "build/release-runner");
  fs.mkdirSync(locks, { recursive: true });
  const release = require("../scripts/release/runner.cjs").acquireLock(path.join(locks, "active.lock"));
  try { await assert.rejects(require("../scripts/release/prepare-oracle.cjs").prepareOracle(f.parent), /already active/); }
  finally { release(); }
  assert.equal(fs.existsSync(path.join(f.parent, "build/numerical-scipy")), false);
});
test("the release oracle stage invokes the lease-aware wrapper directly", () => {
  const stages = require("../scripts/release/stages.cjs").plan("native", "oracle", "linux-x64");
  assert.deepEqual(stages[0].commands, [["node", "scripts/release/prepare-oracle.cjs"]]);
  assert.deepEqual(stages[0].outputs, ["build/numerical-scipy"]);
});
