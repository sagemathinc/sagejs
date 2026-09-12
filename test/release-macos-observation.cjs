// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path"), { execFileSync } = require("node:child_process");
const { zipSync } = require("fflate");
const { identity, roles } = require("../scripts/release/artifact-set.cjs");
const { fileDigest } = require("../scripts/release/runner.cjs");
const { authenticateMacosObservation, contract, checks } = require("../scripts/release/macos-observation.cjs");
const { installerRequest } = require("../scripts/release/macos-installer.cjs");
const { collectMacosInspection, argumentsFor } = require("../scripts/release/collect-macos-inspection.cjs");
const { contract: handoffContract } = require("../scripts/release/artifact-handoff.cjs");
const { platformPackage } = require("./helpers/release-platform-package.cjs");
const { parseWorkflow } = require("../scripts/release/workflow-inventory.cjs");
const { createHash } = require("node:crypto");
const digest = (data) => `sha256:${createHash("sha256").update(data).digest("hex")}`;
function controlFixture(t, selectedContract, member, document) {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "sagejs-control-fixture-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const options = { runId: 30, runAttempt: 2, artifactId: 300, controlSha: "c".repeat(40), filename: path.join(root, "control.zip") };
  const run = { id: 30, run_attempt: 2, head_sha: options.controlSha, path: selectedContract.workflow,
    head_branch: "reviewed-control", event: "workflow_dispatch", status: "completed", conclusion: "success",
    repository: { id: 123, full_name: "sagemathinc/sagejs" }, head_repository: { id: 123, full_name: "sagemathinc/sagejs" } };
  const job = { id: 31, run_id: 30, run_attempt: 2, head_sha: options.controlSha, name: selectedContract.jobName,
    status: "completed", conclusion: "success", started_at: "2026-09-07T01:00:00Z", completed_at: "2026-09-07T01:10:00Z",
    steps: selectedContract.requiredSteps.map(name => ({ name, status: "completed", conclusion: "success" })) };
  const artifact = { id: 300, name: `${selectedContract.artifactPrefix}2`, expired: false, created_at: "2026-09-07T01:09:00Z",
    workflow_run: { id: 30, head_sha: options.controlSha, head_branch: "reviewed-control", repository_id: 123, head_repository_id: 123 } };
  const fixture = { root, options, run, job, artifact, document, calls: [] };
  fixture.reseal = (value = document) => {
    fixture.bytes = Buffer.from(zipSync({ [member]: Buffer.from(JSON.stringify(value)) }));
    fs.writeFileSync(options.filename, fixture.bytes); artifact.digest = digest(fixture.bytes); artifact.size_in_bytes = fixture.bytes.length;
  };
  fixture.reseal();
  fixture.api = (endpoint) => {
    fixture.calls.push(endpoint);
    if (endpoint.endsWith("/attempts/2")) return structuredClone(run);
    if (endpoint.endsWith("/attempts/2/jobs?per_page=100")) return [{ total_count: 1, jobs: [structuredClone(job)] }];
    if (endpoint.endsWith("/artifacts/300")) return structuredClone(artifact);
    throw new Error("unexpected control API endpoint");
  };
  return fixture;
}
function observationFixture(t) {
  const request = installerRequest({ sourceRevision: "a".repeat(40), manifestDigest: `sha256:${"b".repeat(64)}` }, "0.8.0",
    { path: "release/sagejs-macos-arm64.pkg", bytes: 100, sha256: "d".repeat(64) },
    ["sagejs", "sagepython"].map(name => ({ name, member: `package/bin/${name}`, bytes: 20, sha256: "e".repeat(64) })));
  const expected = { request, teamId: "BVF94G2MB4", verifierSha256: "f".repeat(64) };
  const document = { schema: "sagejs.macos-installer-observation/v1", status: "passed", request: structuredClone(request),
    teamId: expected.teamId, verifierSha256: expected.verifierSha256, host: { platform: "darwin", version: "26.4" }, checks: [...checks] };
  const fixture = controlFixture(t, contract, "macos-observation.json", document);
  return { ...fixture, expected, check: () => authenticateMacosObservation(fixture.options, expected, fixture.api) };
}
test("native observation authenticates exact control attempt and matches independently prepared product/policy", (t) => {
  const f = observationFixture(t), result = f.check();
  assert.deepEqual(result.observation, f.document);
  assert.equal(result.authentication.manifestDigest, f.expected.request.productIdentity.manifestDigest);
  assert.equal(result.authentication.runAttempt, 2);
  assert.notEqual(result.authentication.controlRevision, f.expected.request.productIdentity.sourceRevision);
});
test("a genuine retained artifact cannot substitute another product, signer, verifier or missing native checks", (t) => {
  for (const mutate of [
    (d) => { d.request.productIdentity.sourceRevision = "0".repeat(40); },
    (d) => { d.request.productIdentity.manifestDigest = `sha256:${"0".repeat(64)}`; },
    (d) => { d.request.installer.sha256 = "0".repeat(64); }, (d) => { d.request.version = "0.9.0"; },
    (d) => { d.request.executables[0].bytes++; }, (d) => { d.teamId = "AAAAAAAAAA"; },
    (d) => { d.verifierSha256 = "0".repeat(64); }, (d) => { d.host.platform = "linux"; },
    (d) => { d.checks.pop(); }, (d) => { d.checks[1] = d.checks[0]; }, (d) => { d.status = "pending"; },
  ]) { const f = observationFixture(t); mutate(f.document); f.reseal(); assert.throws(f.check, /differs from selected/); }
});
test("self-authored passed JSON, wrong workflow/attempt/source and skipped native steps cannot authenticate", (t) => {
  for (const mutate of [
    (f) => { f.run.path = handoffContract.workflow; }, (f) => { f.run.event = "pull_request"; },
    (f) => { f.run.head_sha = "0".repeat(40); }, (f) => { f.run.run_attempt = 3; },
    (f) => { f.job.steps[0].conclusion = "skipped"; }, (f) => { f.job.steps.pop(); },
    (f) => { f.artifact.name = `${contract.artifactPrefix}1`; }, (f) => { f.artifact.expired = true; },
    (f) => { f.artifact.created_at = "2026-09-06T01:00:00Z"; }, (f) => { f.artifact.workflow_run.head_sha = "0".repeat(40); },
    (f) => { fs.writeFileSync(f.options.filename, Buffer.alloc(f.artifact.size_in_bytes)); },
  ]) { const f = observationFixture(t); mutate(f); assert.throws(f.check); }
});
test("native collection downloads only macOS, resumes its exact cache and rechecks native state", async (t) => {
  const product = platformPackage("macos-arm64"), pkg = Buffer.from("selected signed installer fixture");
  const mac = Buffer.from(zipSync({ "sagejs-macos-arm64.zip": Buffer.from("selected download"), "sagejs-macos-arm64.zip.sha256": Buffer.from("unused by this inspector"),
    "npm/sagejs-macos-arm64.tgz": product.bytes, "sagejs-macos-arm64.pkg": pkg,
    "sagejs-macos-arm64.pkg.sha256": Buffer.from(`${digest(pkg).slice(7)}  sagejs-macos-arm64.pkg\n`) }));
  const artifacts = [];
  for (const [kind, values] of Object.entries(roles)) for (const name of values) artifacts.push({ kind, name, key: `${kind}/${name}`,
    id: 100 + artifacts.length, archiveDigest: digest(mac), sizeInBytes: mac.length, createdAt: "2026-09-07T00:00:00Z" });
  const f = controlFixture(t, handoffContract, "artifact-set.json", {});
  const candidateRoot = path.join(f.root, "candidate"), directory = path.join(f.root, "cache");
  fs.mkdirSync(candidateRoot); fs.mkdirSync(directory);
  fs.writeFileSync(path.join(candidateRoot, "package.json"), '{"version":"0.8.0"}');
  const git = (...args) => execFileSync("git", ["-C", candidateRoot, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init"); git("add", "."); git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "commit", "-m", "Fixture");
  const sha = git("rev-parse", "HEAD"), payload = { schema: "sagejs.release-artifact-set/v1", repository: "sagemathinc/sagejs", repositoryId: 123,
    sourceRevision: sha, ref: "release-candidate", event: "workflow_dispatch", purpose: "qualification",
    qualification: { native: { runId: 10, runAttempt: 1, jobId: 11 }, browser: { runId: 20, runAttempt: 1, jobId: 21 } }, artifacts };
  const manifest = { ...payload, manifestDigest: identity(payload) }; f.reseal(manifest);
  const options = { ...f.options, candidateRoot, directory, sha, ref: payload.ref, event: payload.event, purpose: payload.purpose, teamId: "BVF94G2MB4" };
  let handoffs = 0, products = 0, verifications = 0;
  const dependencies = { platform: "darwin", api: f.api,
    handoffDownload: async (_record, filename) => { handoffs++; fs.writeFileSync(filename, f.bytes); },
    staging: { verifyRemote: () => {}, download: async (record, filename) => { assert.equal(record.key, "native/sagejs-macos-arm64"); products++; fs.writeFileSync(filename, mac); } },
    verify: async ({ request, filename, expectedTeamId }) => {
      verifications++; assert.equal(expectedTeamId, options.teamId); assert.equal(fileDigest(filename), request.installer.sha256);
      assert.equal(request.productIdentity.manifestDigest, manifest.manifestDigest);
      assert.equal(request.executables[0].sha256, digest(product.sea).slice(7));
      return { fixture: true, request };
    } };
  const first = await collectMacosInspection(options, dependencies), second = await collectMacosInspection(options, dependencies);
  assert.deepEqual(second, first); assert.equal(handoffs, 1); assert.equal(products, 1); assert.equal(verifications, 2);
  assert.equal(git("status", "--porcelain"), "", "candidate source untouched");
  await assert.rejects(collectMacosInspection(options, { ...dependencies, platform: "linux" }), /requires native macOS/);
  f.job.conclusion = "failure";
  await assert.rejects(collectMacosInspection(options, dependencies), /single successful job/);
  assert.equal(verifications, 2, "failed current handoff authentication cannot reuse a past observation");
});
test("inspection workflow has no publishing/signing authority, only one bounded native job and exact input arguments", () => {
  const doc = parseWorkflow(fs.readFileSync(path.join(__dirname, "..", contract.workflow), "utf8"), contract.workflow);
  assert.deepEqual(Object.keys(doc.on), ["workflow_dispatch"]); assert.deepEqual(doc.permissions, { actions: "read", contents: "read" });
  assert.deepEqual(Object.keys(doc.jobs), ["inspect"]);
  const job = doc.jobs.inspect; assert.equal(job.name, contract.jobName); assert.equal(job["timeout-minutes"], 25); assert.equal(job.environment, undefined);
  const step = job.steps.find(s => s.name === contract.requiredSteps[0]);
  assert.match(step.run, /collect-macos-inspection\.cjs/); assert.doesNotMatch(step.run, /\$\{\{|pnpm build|gh release|codesign|notarytool/);
  assert.ok(job.steps.filter(s => s.uses?.startsWith("actions/checkout")).every(s => s.with["persist-credentials"] === false));
  const upload = job.steps.find(s => s.name === contract.requiredSteps[1]);
  assert.equal(upload.with.name, `${contract.artifactPrefix}\${{ github.run_attempt }}`); assert.equal(upload.with.overwrite, false);
  assert.equal(upload.with.path, "control/macos-observation.json");
  const args = ["--candidate-root", "candidate", "--directory", "cache", "--run-id", "30", "--attempt", "2", "--artifact-id", "300", "--control-sha", "c".repeat(40),
    "--sha", "a".repeat(40), "--ref", "release-candidate", "--event", "workflow_dispatch", "--purpose", "qualification"];
  assert.equal(argumentsFor(args).teamId, "BVF94G2MB4");
  assert.throws(() => argumentsFor([...args, "--team-id", "AAAAAAAAAA"]));
});
