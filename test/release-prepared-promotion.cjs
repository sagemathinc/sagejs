// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { execFileSync } = require("node:child_process");
const { validateRequest, requestFromInputs, configureConsumer, runPrepared } = require("../scripts/release/publish-prepared.cjs");
const pins = { runId: 1, runAttempt: 1, artifactId: 2, controlSha: "a".repeat(40) };
const request = { schema: "sagejs.prepared-promotion-request/v1", sourceRevision: "b".repeat(40), sourceRef: "release-candidate",
  sourceEvent: "workflow_dispatch", purpose: "qualification", tag: "v0.8.0", handoff: pins, macos: { ...pins, artifactId: 3 } };
test("prepared request binds exact historical controls and does not mix producer modes", () => {
  assert.deepEqual(validateRequest(request), request);
  assert.equal(requestFromInputs({ prepared_request: JSON.stringify(request), publish_prepared: false }).publish, false);
  for (const changes of [{ qualify_release: true }, { platform_smoke: true }, { candidate_sha: request.sourceRevision },
    { recovery_run_id: "123" }, { recovery_tag: request.tag }, { publish_prepared: "true" }, { native_targets: "linux-x64" }]) {
    assert.throws(() => requestFromInputs({ prepared_request: JSON.stringify(request), publish_prepared: false, ...changes }));
  }
  for (const changes of [{ tag: "v0.8.0\n" }, { sourceRevision: "short" }, { sourceEvent: "pull_request" },
    { sourceRef: "x\nsha=bad" }, { purpose: "release" }, { extra: "unexpected" }, { macos: { ...pins, runAttempt: "1" } }]) {
    assert.throws(() => validateRequest({ ...request, ...changes }));
  }
});
test("isolated consumer excludes generated release files without hiding tracked source changes", t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-prepared-clone-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: "pipe" }).trim();
  fs.writeFileSync(path.join(root, "source.txt"), "tracked"); git("init"); git("add", ".");
  git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "commit", "-m", "fixture");
  const source = git("rev-parse", "HEAD"); configureConsumer(root, source);
  fs.mkdirSync(path.join(root, "release")); fs.writeFileSync(path.join(root, "release/product.zip"), "product");
  configureConsumer(root, source); assert.equal(git("status", "--porcelain"), "");
  fs.writeFileSync(path.join(root, "source.txt"), "changed"); assert.throws(() => configureConsumer(root, source), /clean worktree/);
});
test("already cancelled preparation does not inspect or mutate a checkout", async () => {
  await assert.rejects(runPrepared({ request, publish: false, signal: AbortSignal.abort() }), /abort/i);
});
