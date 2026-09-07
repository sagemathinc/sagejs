// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { createHash } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { preparePublication, checkConsumer, projection } = require("../scripts/release/prepare-publication.cjs");
const { zipSync } = require("fflate");
const { verifyHandoffArchive, stageHandoff, prepareHandoff, readManifestZip, argumentsFor, workflow, jobName, requiredSteps } = require("../scripts/release/artifact-handoff.cjs");
const { layout } = require("../scripts/release/extract-artifact.cjs");
const { roles, identity } = require("../scripts/release/artifact-set.cjs");
const { parseWorkflow } = require("../scripts/release/workflow-inventory.cjs");
const repository = "sagemathinc/sagejs";
const checksum = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
function fixture(t, sourceRevision = "a".repeat(40)) {
  const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "sagejs-handoff-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const options = { runId: 50, runAttempt: 2, artifactId: 500, controlSha: "c".repeat(40), sha: sourceRevision,
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

test("prepare authenticates, stages and expands all roles, repairing corruption without new downloads", async (t) => {
  const f = fixture(t), archives = new Map();
  for (const record of f.manifest.artifacts) {
    const policy = layout(record.key), files = Object.fromEntries(policy.required.map((name) => [name, Buffer.from(`fixture ${name}`)]));
    for (const prefix of policy.prefixes) if (!Object.keys(files).some((name) => name.startsWith(prefix))) files[`${prefix}fixture.json`] = Buffer.from("{}");
    const archive = Buffer.from(zipSync(files));
    archives.set(record.key, archive); record.archiveDigest = checksum(archive); record.sizeInBytes = archive.length;
  }
  const { manifestDigest, ...payload } = f.manifest; f.manifest.manifestDigest = identity(payload);
  const handoff = Buffer.from(zipSync({ "artifact-set.json": Buffer.from(JSON.stringify(f.manifest)) }));
  f.artifact.digest = checksum(handoff); f.artifact.size_in_bytes = handoff.length; fs.writeFileSync(f.options.filename, handoff);
  let downloads = 0;
  const dependencies = { api: f.api, staging: { verifyRemote: () => {}, download: async (record, filename) => { downloads++; fs.writeFileSync(filename, archives.get(record.key)); } } };
  const first = await prepareHandoff(f.options, dependencies);
  assert.equal(first.expanded.length, 9);
  assert.ok(first.expanded.every((item) => item.files.length && !item.reused));
  fs.writeFileSync(path.join(first.expanded[0].directory, first.expanded[0].files[0].path), "changed");
  const again = await prepareHandoff(f.options, dependencies);
  assert.equal(downloads, 9);
  assert.equal(again.expanded.filter((item) => !item.reused).length, 1);
  assert.ok(again.staged.artifacts.every((item) => item.reused));
});

test("publication input preparation retains a failed gate, resumes raw verification, then reuses both successful stages", async (t) => {
  const { createBrowserInputs, budget } = require("./helpers/release-browser-inputs.cjs");
  const { platformPackage } = require("./helpers/release-platform-package.cjs");
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "sagejs-consumer-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "scripts/numerical-computing/qualification"), { recursive: true });
  fs.writeFileSync(path.join(root, ".gitignore"), "build/\nrelease/\npackages/flint-wasm/dist/\n");
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "source-only-consumer-fixture", version: "0.8.0" }));
  fs.mkdirSync(path.join(root, "bench"));
  fs.writeFileSync(path.join(root, "bench/browser-wasm-budget.json"), JSON.stringify(budget));
  const rawManifests = new Map(), capability_manifests = [], platformArchives = new Map();
  for (const platform of ["linux-x64", "linux-arm64", "macos-arm64", "windows-x64"]) {
    const fixture = platformPackage(platform); platformArchives.set(platform, fixture.bytes);
    for (const [kind, value] of fixture.manifests) {
      const relative = `platform/${platform}/${platform}-${kind}/capabilities.json`, manifest = JSON.stringify(value);
      rawManifests.set(relative, Buffer.from(manifest));
      capability_manifests.push({ row_id: `${platform}-${kind}`, path: `build/numerical-qualification/${relative}`, sha256: checksum(Buffer.from(manifest)).slice(7) });
    }
  }
  // Source-only CLI fixtures exercise orchestration and byte-equality failure,
  // not numerical correctness or actual product acceptance.
  fs.writeFileSync(path.join(root, "scripts/numerical-computing/qualification/assemble-release-gate.cjs"), `
    const fs=require('node:fs');
    const dir='build/numerical-qualification/gate';
    if(fs.existsSync(dir)&&fs.readdirSync(dir).length)throw Error('nonempty output');
    fs.mkdirSync(dir,{recursive:true});
    if(!fs.existsSync('build/release-publication/seen')){
      fs.writeFileSync('build/release-publication/seen','1');
      fs.writeFileSync(dir+'/partial.json','failed'); process.exit(7);
    }
    fs.copyFileSync('build/validated-numerical-gate/release-gate.json',dir+'/release-gate.json');
  `);
  fs.writeFileSync(path.join(root, "scripts/numerical-computing/qualification/authenticate-release-gate.cjs"), `
    const fs=require('node:fs'),args=process.argv;
    const file=(flag)=>args[args.indexOf(flag)+1];
    if(!fs.readFileSync(file('--gate')).equals(fs.readFileSync(file('--rebuilt-gate'))))throw Error('gate bytes differ');
    for(const flag of ['--public-npm-root','--browser-distribution'])if(!fs.existsSync(file(flag)))throw Error('missing product');
    if(fs.existsSync('build/release-publication/mutate-input'))fs.writeFileSync('release/install.sh','changed by verifier');
    if(fs.existsSync('build/release-publication/mutate-browser-archive')){
      const name='build/release-publication/browser-reproducible/sagejs-wasm.tar.gz';
      const bytes=require('node:zlib').gzipSync(Buffer.alloc(1024));
      fs.writeFileSync(name,bytes);
      fs.writeFileSync(name+'.sha256',require('node:crypto').createHash('sha256').update(bytes).digest('hex')+'  build/sagejs-wasm.tar.gz'+String.fromCharCode(10));
    }
  `);
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init"); git("add", "."); git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "commit", "-m", "Fixture source");
  const candidate = git("rev-parse", "HEAD"), f = fixture(t, candidate), archives = new Map();
  const browser = createBrowserInputs(path.join(f.options.directory, "browser-fixture"), candidate);
  const exact = JSON.stringify({ fixture_gate: true, capability_manifests, ...browser.gate }) + "\n";
  for (const record of f.manifest.artifacts) {
    const policy = layout(record.key), files = Object.fromEntries(policy.required.map((name) => [name, Buffer.from(name === "release-gate.json" ? exact : `fixture ${name}`)]));
    const nativePlatform = record.key.match(/^native\/sagejs-(linux-x64|linux-arm64|macos-arm64|windows-x64)$/)?.[1];
    if (nativePlatform) files[`npm/sagejs-${nativePlatform}.tgz`] = platformArchives.get(nativePlatform);
    if (record.key === "native/sagejs-public-npm-root") for (const [name, bytes] of browser.files) files[`packages/flint-wasm/dist/${name}`] = bytes;
    if (record.key === "browser/wasm-clean-build-a") for (const [name, bytes] of browser.clean) files[name] = bytes;
    if (record.key === "browser/sagejs-wasm-reproducible") for (const [name, bytes] of browser.reproduced) files[name] = bytes;
    if (record.key === "native/numerical-release-evidence") for (const [name, bytes] of rawManifests) files[name] = bytes;
    for (const prefix of policy.prefixes) if (!Object.keys(files).some((name) => name.startsWith(prefix))) files[`${prefix}fixture.json`] = Buffer.from("{}");
    const archive = Buffer.from(zipSync(files)); archives.set(record.key, archive); record.archiveDigest = checksum(archive); record.sizeInBytes = archive.length;
  }
  const { manifestDigest, ...payload } = f.manifest; f.manifest.manifestDigest = identity(payload);
  const handoff = Buffer.from(zipSync({ "artifact-set.json": Buffer.from(JSON.stringify(f.manifest)) }));
  f.artifact.digest = checksum(handoff); f.artifact.size_in_bytes = handoff.length; fs.writeFileSync(f.options.filename, handoff);
  let downloads = 0;
  const dependencies = { api: f.api, runner: { preflight: () => ({ passed: true }) },
    staging: { verifyRemote: () => {}, download: async (record, filename) => { downloads++; fs.writeFileSync(filename, archives.get(record.key)); } } };
  const options = { ...f.options, candidateRoot: root };
  await assert.rejects(preparePublication(options, dependencies), /command failed/);
  assert.equal(fs.readFileSync(path.join(root, "build/numerical-qualification/gate/partial.json"), "utf8"), "failed");
  const passed = await preparePublication(options, dependencies);
  assert.equal(passed.status, "numerical-publication-inputs-authenticated");
  assert.equal(passed.platformPackages.length, 4);
  assert.equal(passed.packagedExecutables.length, 4);
  assert.equal(passed.packagedExecutables[0].executables[0].evidence, "linux-x64-npm and linux-x64-sea");
  assert.equal(passed.selectedBrowser.artifactIdentity, browser.report.artifact_identity);
  assert.equal(passed.selectedBrowser.archive.files, browser.files.size);
  assert.equal(passed.selectedBrowser.archive.sha256, checksum(browser.reproduced.get("sagejs-wasm.tar.gz")).slice(7));
  assert.equal(passed.results.length, 2); assert.ok(passed.results.every((result) => !result.reused));
  const retained = path.join(root, "build/release-publication/retained-gates");
  assert.ok(fs.readdirSync(retained).some((id) => fs.existsSync(path.join(retained, id, "partial.json"))));
  const reused = await preparePublication(options, dependencies);
  assert.ok(reused.results.every((result) => result.reused));
  assert.deepEqual(reused.selectedBrowser.archive, passed.selectedBrowser.archive);
  assert.deepEqual(reused.packagedExecutables, passed.packagedExecutables);
  assert.equal(downloads, 9);
  assert.equal(git("status", "--porcelain"), "");
  // A successful reconstructed gate and matching archive checksum are not
  // enough: the inner tree must match, even when runner checkpoints are reused.
  const mutateArchive = path.join(root, "build/release-publication/mutate-browser-archive");
  fs.writeFileSync(mutateArchive, "1");
  fs.unlinkSync(path.join(root, "build/release-runner", candidate, "publication-numerical-authentication.json"));
  await assert.rejects(preparePublication(options, dependencies), /archive omits qualified/);
  fs.unlinkSync(mutateArchive);
  const archiveRepaired = await preparePublication(options, dependencies);
  assert.ok(archiveRepaired.results.every((result) => result.reused));
  assert.deepEqual(archiveRepaired.selectedBrowser.archive, passed.selectedBrowser.archive);
  // A changed rebuilt gate cannot inherit its earlier authentication pass.
  fs.writeFileSync(path.join(root, "build/numerical-qualification/gate/release-gate.json"), "changed");
  const repaired = await preparePublication(options, dependencies);
  assert.notEqual(repaired.results[0].reused, true);
  assert.equal(fs.readFileSync(path.join(root, "build/numerical-qualification/gate/release-gate.json"), "utf8"), exact);
  // Even a verifier that exits successfully cannot certify a changed input
  // outside its own numerical subset (such as a projected installer).
  const mutate = path.join(root, "build/release-publication/mutate-input");
  fs.writeFileSync(mutate, "1");
  fs.unlinkSync(path.join(root, "build/release-runner", candidate, "publication-numerical-authentication.json"));
  await assert.rejects(preparePublication(options, dependencies), /inputs changed during verification/);
  fs.unlinkSync(mutate);
  const restored = await preparePublication(options, dependencies);
  assert.equal(restored.status, "numerical-publication-inputs-authenticated");
  const installer = restored.files.find((file) => file.path === "release/install.sh");
  assert.equal(installer.sha256, createHash("sha256").update(fs.readFileSync(path.join(root, installer.path))).digest("hex"));
  assert.throws(() => checkConsumer(root, candidate, `sha256:${"d".repeat(64)}`), /another artifact set/);
  assert.throws(() => projection([{ key: "native/sagejs-linux-x64", directory: root, files: [{ path: "x" }, { path: "X" }] }]), /collide/);
  const marker = path.join(root, "build/release-publication/state.json"), saved = fs.readFileSync(marker);
  fs.unlinkSync(marker);
  const calls = f.calls.length;
  try { await assert.rejects(preparePublication(options, dependencies), /source-only publication checkout/); }
  finally { fs.writeFileSync(marker, saved); }
  assert.equal(f.calls.length, calls, "a built producer is rejected before inspecting or downloading remote artifacts");
});

test("handoff CLI cannot omit trusted identities or accept partial integer strings", () => {
  const args = ["verify", "--run-id", "50", "--attempt", "2", "--artifact-id", "500", "--control-sha", "c".repeat(40),
    "--sha", "a".repeat(40), "--ref", "candidate", "--event", "workflow_dispatch", "--purpose", "qualification", "--archive", "handoff.zip"];
  assert.equal(argumentsFor(args).options.runAttempt, 2);
  assert.throws(() => argumentsFor(args.slice(0, -2)));
  assert.throws(() => argumentsFor(args.map((x) => x === "50" ? "50junk" : x)));
  assert.throws(() => argumentsFor(["stage", ...args.slice(1)]));
});
