// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { createHash } = require("node:crypto");
const { zipSync } = require("fflate");
const { verifyHandoffArchive, stageHandoff, readManifestZip, argumentsFor, workflow, jobName, requiredSteps } = require("../scripts/release/artifact-handoff.cjs");
const { roles, identity } = require("../scripts/release/artifact-set.cjs");
const { parseWorkflow } = require("../scripts/release/workflow-inventory.cjs");
const repository = "sagemathinc/sagejs";
const checksum = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "sagejs-handoff-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const options = { runId: 50, runAttempt: 2, artifactId: 500, controlSha: "c".repeat(40), sha: "a".repeat(40),
    ref: "release-candidate", event: "workflow_dispatch", purpose: "qualification", filename: path.join(directory, "handoff.zip"), directory };
  const product = Buffer.from("fixture product ZIP bytes"), artifacts = [];
  for (const [kind, names] of Object.entries(roles)) for (const name of names) artifacts.push({ kind, name, key: `${kind}/${name}`,
    id: 100 + artifacts.length, archiveDigest: checksum(product), sizeInBytes: product.length, createdAt: "2026-09-07T00:00:00Z" });
  const payload = { schema: "sagejs.release-artifact-set/v1", repository, repositoryId: 123, sourceRevision: options.sha,
    ref: options.ref, event: options.event, purpose: options.purpose,
    qualification: { native: { runId: 10, runAttempt: 1, jobId: 11 }, browser: { runId: 20, runAttempt: 1, jobId: 21 } }, artifacts };
  const manifest = { ...payload, manifestDigest: identity(payload) };
  const archive = Buffer.from(zipSync({ "artifact-set.json": Buffer.from(JSON.stringify(manifest)) }, { level: 0 }));
  fs.writeFileSync(options.filename, archive);
  const run = { id: 50, run_attempt: 2, head_sha: options.controlSha, path: workflow, event: "workflow_dispatch",
    status: "completed", conclusion: "success", head_branch: "release-control",
    repository: { id: 123, full_name: repository }, head_repository: { id: 123, full_name: repository } };
  const job = { id: 51, run_id: 50, run_attempt: 2, head_sha: options.controlSha, name: jobName, status: "completed", conclusion: "success",
    started_at: "2026-09-07T00:00:00Z", completed_at: "2026-09-07T00:05:00Z",
    steps: requiredSteps.map((name) => ({ name, status: "completed", conclusion: "success" })) };
  const artifact = { id: 500, name: "sagejs-artifact-set-attempt-2", size_in_bytes: archive.length, digest: checksum(archive), expired: false,
    created_at: "2026-09-07T00:04:00Z", workflow_run: { id: 50, head_sha: options.controlSha, head_branch: "release-control", repository_id: 123, head_repository_id: 123 } };
  const calls = [];
  const f = { options, manifest, archive, run, job, artifact, calls, product, extraJobs: [] };
  f.api = (endpoint, paginate) => {
    calls.push(endpoint);
    if (endpoint === `repos/${repository}/actions/runs/50/attempts/2`) return structuredClone(f.run);
    if (endpoint === `repos/${repository}/actions/runs/50/attempts/2/jobs?per_page=100`) {
      assert.equal(paginate, true);
      return structuredClone([{ total_count: 1 + f.extraJobs.length, jobs: [f.job, ...f.extraJobs] }]);
    }
    if (endpoint === `repos/${repository}/actions/artifacts/500`) return structuredClone(f.artifact);
    throw new Error(`unexpected endpoint ${endpoint}`);
  };
  return f;
}

test("authenticate one frozen handoff attempt, independently of newer control or publication attempts", (t) => {
  const f = fixture(t), accepted = verifyHandoffArchive(f.options, f.api);
  assert.deepEqual(accepted.manifest, f.manifest);
  assert.equal(accepted.authentication.runAttempt, 2);
  assert.equal(accepted.authentication.manifestDigest, f.manifest.manifestDigest);
  assert.notEqual(accepted.authentication.controlRevision, accepted.manifest.sourceRevision);
  assert.ok(f.calls.every((endpoint) => endpoint.includes("/attempts/2") || endpoint.endsWith("/artifacts/500")), "never asks for a latest producer/control attempt or selects by artifact name");
});

test("wrong source, workflow, attempt, trigger, repository or incomplete capture cannot authenticate", (t) => {
  for (const mutate of [
    (f) => { f.run.head_sha = "b".repeat(40); }, (f) => { f.run.path = ".github/workflows/ci.yml"; },
    (f) => { f.run.run_attempt = 3; }, (f) => { f.run.event = "pull_request"; },
    (f) => { f.run.head_repository.full_name = "fork/sagejs"; }, (f) => { f.run.head_repository.id = 456; },
    (f) => { f.run.status = "in_progress"; }, (f) => { f.run.conclusion = "failure"; },
    (f) => { f.job.conclusion = "failure"; }, (f) => { f.job.run_attempt = 1; },
    (f) => { f.job.name = "untrusted job"; }, (f) => { f.job.steps.pop(); },
    (f) => { f.job.steps[0].conclusion = "skipped"; }, (f) => { f.job.steps.push(f.job.steps[0]); },
    (f) => { f.extraJobs.push({ ...f.job, id: 52 }); },
  ]) { const f = fixture(t); mutate(f); assert.throws(() => verifyHandoffArchive(f.options, f.api)); }
});

test("expired, replaced, oversized or foreign capture artifacts fail before accepting local bytes", (t) => {
  for (const mutate of [
    (f) => { f.artifact.expired = true; }, (f) => { f.artifact.id = 501; },
    (f) => { f.artifact.name = "sagejs-artifact-set-attempt-1"; }, (f) => { f.artifact.digest = null; },
    (f) => { f.artifact.size_in_bytes = 200000; }, (f) => { f.artifact.workflow_run.id = 51; },
    (f) => { f.artifact.workflow_run.head_sha = f.options.sha; }, (f) => { f.artifact.workflow_run.repository_id = 456; },
    (f) => { f.artifact.created_at = "2026-09-06T00:00:00Z"; }, (f) => { f.artifact.created_at = "2026-09-08T00:00:00Z"; },
  ]) { const f = fixture(t); mutate(f); assert.throws(() => verifyHandoffArchive(f.options, f.api)); }
  const f = fixture(t), request = f.api; let count = 0;
  f.api = (...args) => { const result = request(...args); if (args[0].endsWith("/artifacts/500") && ++count === 2) result.digest = checksum(Buffer.from("replacement")); return result; };
  assert.throws(() => verifyHandoffArchive(f.options, f.api), /changed/);
});

test("ZIP digest, self-seal, and explicit product identity are all checked separately", (t) => {
  const f = fixture(t);
  fs.writeFileSync(f.options.filename, Buffer.alloc(f.archive.length));
  assert.throws(() => verifyHandoffArchive(f.options, f.api), /digest/);
  fs.writeFileSync(f.options.filename, f.archive.subarray(1));
  assert.throws(() => verifyHandoffArchive(f.options, f.api), /size/);
  fs.writeFileSync(f.options.filename, f.archive);
  for (const changed of [{ sha: "b".repeat(40) }, { ref: "main" }, { event: "push" }, { purpose: "release" }]) {
    assert.throws(() => verifyHandoffArchive({ ...f.options, ...changed }, f.api), /product identity/);
  }
  const invalid = { ...f.manifest, sourceRevision: "b".repeat(40) };
  assert.throws(() => readManifestZip(Buffer.from(zipSync({ "artifact-set.json": Buffer.from(JSON.stringify(invalid)) }))), /digest/);
});

test("ZIP decoding is bounded, rejects duplicates/paths/extra members and never extracts files", (t) => {
  const f = fixture(t), content = Buffer.from(JSON.stringify(f.manifest));
  assert.deepEqual(readManifestZip(Buffer.from(zipSync({ "artifact-set.json": content }))), f.manifest);
  for (const members of [{}, { "../artifact-set.json": content }, { "artifact-set.json": Buffer.alloc(65537) },
    { "artifact-set.json": content, extra: Buffer.from("x") }]) assert.throws(() => readManifestZip(Buffer.from(zipSync(members))));
  for (const length of [0, 1, 21, 131073]) assert.throws(() => readManifestZip(Buffer.alloc(length)));
  const duplicate = Buffer.from(zipSync({ "artifact-set.json": content, "artifact-set.jsox": content }, { level: 0 }));
  for (let offset = duplicate.indexOf("artifact-set.jsox"); offset >= 0; offset = duplicate.indexOf("artifact-set.jsox")) duplicate.write("artifact-set.json", offset);
  assert.throws(() => readManifestZip(duplicate), /member/);
  assert.deepEqual(fs.readdirSync(f.options.directory), ["handoff.zip"]);
});

test("authenticated handoff stages products directly, then resumes without redownloading them", async (t) => {
  const f = fixture(t); let downloads = 0;
  const dependencies = { api: f.api, staging: { verifyRemote: () => {}, download: async (_record, filename) => { downloads++; fs.writeFileSync(filename, f.product); } } };
  const first = await stageHandoff(f.options, dependencies);
  assert.equal(first.staged.artifacts.length, 9);
  const again = await stageHandoff(f.options, dependencies);
  assert.equal(downloads, 9);
  assert.ok(again.staged.artifacts.every((item) => item.reused));
  assert.equal(first.authentication.manifestDigest, first.staged.manifestDigest);
  const bad = fixture(t);
  bad.run.conclusion = "failure";
  await assert.rejects(stageHandoff(bad.options, { api: bad.api, staging: dependencies.staging }));
  assert.equal(downloads, 9, "authentication failure cannot reach downloads");
});

test("capture workflow is non-publishing, bounded, one-job and retains an immutable attempt-specific artifact", () => {
  const doc = parseWorkflow(fs.readFileSync(path.join(__dirname, "..", workflow), "utf8"), workflow);
  assert.deepEqual(Object.keys(doc.on), ["workflow_dispatch"]);
  assert.deepEqual(doc.permissions, { actions: "read", contents: "read" });
  assert.deepEqual(Object.keys(doc.jobs), ["capture"]);
  const job = doc.jobs.capture;
  assert.equal(job.name, jobName); assert.equal(job["timeout-minutes"], 10);
  assert.equal(job.environment, undefined);
  const capture = job.steps.find((step) => step.name === requiredSteps[0]);
  assert.match(capture.run, /node scripts\/release\/artifact-set.cjs capture/);
  assert.match(capture.run, /--sha "\$SOURCE_SHA"/);
  assert.ok(!capture.run.includes("${{"), "user input is passed via env, never interpolated as shell code");
  const upload = job.steps.find((step) => step.name === requiredSteps[1]);
  assert.equal(upload.uses, "actions/upload-artifact@v7");
  assert.equal(upload.with.name, "sagejs-artifact-set-attempt-${{ github.run_attempt }}");
  assert.equal(upload.with.path, "artifact-set.json");
  assert.equal(upload.with.overwrite, false);
  assert.equal(upload.with["if-no-files-found"], "error");
  assert.equal(upload.with["compression-level"], 0);
  assert.equal(job.steps.filter((step) => step.run).length, 1);
});

test("handoff CLI cannot omit trusted identities or accept partial integer strings", () => {
  const args = ["verify", "--run-id", "50", "--attempt", "2", "--artifact-id", "500", "--control-sha", "c".repeat(40),
    "--sha", "a".repeat(40), "--ref", "candidate", "--event", "workflow_dispatch", "--purpose", "qualification", "--archive", "handoff.zip"];
  assert.equal(argumentsFor(args).options.runAttempt, 2);
  assert.throws(() => argumentsFor(args.slice(0, -2)));
  assert.throws(() => argumentsFor(args.map((x) => x === "50" ? "50junk" : x)));
  assert.throws(() => argumentsFor(["stage", ...args.slice(1)]));
});
