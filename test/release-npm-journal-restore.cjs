// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const YAML = require("yaml");
const { recoveryPins, restoreAcceptedNpmJournal } = require("../scripts/release/restore-npm-journal.cjs");
const names = ["@sagemath/sagejs-linux-x64", "@sagemath/sagejs-linux-arm64",
  "@sagemath/sagejs-win32-x64", "@sagemath/sagejs-darwin-arm64", "@sagemath/sagejs"];
test("recovery pins must be paired exact positive IDs", () => {
  assert.equal(recoveryPins(), null);
  assert.deepEqual(recoveryPins("123", "456"), { runId: 123, artifactId: 456 });
  for (const pair of [["123", ""], ["", "456"], ["0", "456"], ["123; true", "456"],
    ["01", "456"], ["9007199254740992", "456"]]) assert.throws(() => recoveryPins(...pair), /both exact/);
});
test("protected publisher restores the exact prior artifact before its publication step", () => {
  const workflow = YAML.parse(fs.readFileSync(path.join(__dirname, "../.github/workflows/ci.yml"), "utf8"));
  const job = workflow.jobs["publish-prepared"], steps = job.steps;
  const index = name => steps.findIndex(step => step.name === name);
  assert.ok(index("Admit paired prior-publication pins") < index("Download exact prior publication journal"));
  assert.ok(index("Download exact prior publication journal") < index("Restore accepted npm publication state"));
  assert.ok(index("Restore accepted npm publication state") < index("Publish the frozen artifact set"));
  const download = steps[index("Download exact prior publication journal")];
  assert.equal(download.uses, "actions/download-artifact@v7");
  assert.equal(download.with["artifact-ids"], "${{ inputs.resume_publication_artifact_id }}");
  assert.equal(download.with["run-id"], "${{ inputs.resume_publication_run_id }}");
  assert.equal(download.with["github-token"], "${{ github.token }}");
  assert.match(steps[index("Restore accepted npm publication state")].run, /restore-npm-journal\.cjs/);
});
function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-npm-restore-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const request = { schema: "sagejs.prepared-promotion-request/v1", sourceRevision: "a".repeat(40), sourceRef: "release-candidate",
    sourceEvent: "workflow_dispatch", purpose: "qualification", tag: "v0.9.0",
    handoff: { runId: 1, runAttempt: 1, artifactId: 2, controlSha: "a".repeat(40) },
    macos: { runId: 3, runAttempt: 1, artifactId: 4, controlSha: "a".repeat(40) } };
  const journal = { schema: "sagejs.npm-publication/v1", phase: "waiting-for-registry:@sagemath/sagejs",
    accepted: [...names], binding: { registry: "https://registry.npmjs.org/", tag: request.tag,
      source: request.sourceRevision, packages: names.map(name => ({ name, version: "0.9.0", bytes: 1, integrity: "sha512-fixture" })) } };
  const requestFile = path.join(root, "request.json"), priorFile = path.join(root, "prior.json"), cache = path.join(root, "cache");
  fs.writeFileSync(requestFile, JSON.stringify(request));
  const write = () => fs.writeFileSync(priorFile, JSON.stringify(journal)); write();
  return { request, journal, requestFile, priorFile, cache, write };
}
test("restores an accepted root checkpoint without changing its binding", t => {
  const f = fixture(t), result = restoreAcceptedNpmJournal(f.requestFile, f.priorFile, f.cache);
  assert.deepEqual(result, { tag: "v0.9.0", source: f.request.sourceRevision, accepted: 5 });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.cache, "publication/npm.json"), "utf8")), f.journal);
  assert.throws(() => restoreAcceptedNpmJournal(f.requestFile, f.priorFile, f.cache), /already exists/);
});
test("rejects wrong or unaccepted prior publication state", t => {
  const f = fixture(t);
  for (const change of [() => { f.journal.binding.source = "b".repeat(40); },
    () => { f.journal.accepted.pop(); }, () => { f.journal.phase = "publishing:@sagemath/sagejs"; }]) {
    const original = structuredClone(f.journal); change(); f.write();
    assert.throws(() => restoreAcceptedNpmJournal(f.requestFile, f.priorFile, f.cache), /not the exact accepted root/);
    Object.assign(f.journal, original);
  }
});
