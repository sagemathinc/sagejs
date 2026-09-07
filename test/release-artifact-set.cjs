// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { captureArtifactSet, validateArtifactSet, verifyPinnedArtifacts, verifyDownloadedArchive,
  readArtifacts, argumentsFor, identity, roles } = require("../scripts/release/artifact-set.cjs");
const { parseWorkflow } = require("../scripts/release/workflow-inventory.cjs");
const options = { sha: "a".repeat(40), ref: "v0.8.0+release.12", event: "push", purpose: "release", nativeRunId: 10, browserRunId: 20 };
const repository = "sagemathinc/sagejs";
const bytes = Buffer.from("fixture archive");
const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
function fixture(expected = options) {
  let id = 100;
  const artifacts = Object.entries(roles).flatMap(([kind, names]) => names.map((name) => ({
    id: id++, name, digest, size_in_bytes: bytes.length, expired: false, created_at: "2026-09-07T00:00:00Z",
    workflow_run: { id: expected[`${kind}RunId`], head_sha: expected.sha, head_branch: expected.ref,
      repository_id: 123, head_repository_id: 123 },
  })));
  const calls = [], inspections = [];
  return { artifacts, calls, inspections,
    inspect(expectation) {
      inspections.push(expectation);
      assert.equal(expectation.sha, expected.sha);
      assert.equal(expectation.ref, expected.ref);
      assert.equal(expectation.event, expected.event);
      assert.equal(expectation.purpose, expected.purpose);
      return { runId: expectation.runId, runAttempt: 2, jobId: expectation.runId * 10 };
    },
    api(endpoint) {
      calls.push(endpoint);
      if (endpoint === `repos/${repository}`) return { full_name: repository, id: 123 };
      const listing = endpoint.match(/\/runs\/(\d+)\/artifacts\?per_page=100&page=1$/);
      if (listing) {
        const selected = artifacts.filter((item) => item.workflow_run.id === Number(listing[1]));
        return structuredClone({ total_count: selected.length, artifacts: selected });
      }
      const byId = endpoint.match(/\/artifacts\/(\d+)$/);
      if (byId) {
        const artifact = artifacts.find((item) => item.id === Number(byId[1]));
        if (!artifact) throw new Error("404");
        return structuredClone(artifact);
      }
      throw new Error(`unexpected fixture endpoint: ${endpoint}`);
    },
  };
}
function reseal(value) { const { manifestDigest, ...payload } = value; return { ...payload, manifestDigest: identity(payload) }; }

test("capture freezes every product/evidence artifact and reinspects both qualification attempts", () => {
  const f = fixture(), manifest = captureArtifactSet(options, f);
  assert.equal(manifest.artifacts.length, 9);
  assert.equal(manifest.qualification.native.runAttempt, 2);
  assert.deepEqual(f.inspections.map((item) => item.kind), ["native", "browser", "native", "browser"]);
  assert.deepEqual(manifest.artifacts.map((item) => item.key), Object.entries(roles).flatMap(([kind, names]) => names.map((name) => `${kind}/${name}`)));
  assert.equal(f.calls.filter((endpoint) => /\/artifacts\/\d+$/.test(endpoint)).length, 9);
  assert.equal(validateArtifactSet(manifest, manifest.manifestDigest), manifest);
  assert.equal(identity({ z: 1, a: { y: 2, x: 3 } }), identity({ a: { x: 3, y: 2 }, z: 1 }));
});

test("retry verifies pinned IDs without substituting a newer same-name artifact or qualification attempt", () => {
  const f = fixture(), manifest = captureArtifactSet(options, f);
  const old = f.artifacts[0];
  f.artifacts.push({ ...old, id: 999, digest: `sha256:${"b".repeat(64)}` });
  f.calls.length = 0;
  assert.equal(verifyPinnedArtifacts(manifest, manifest.manifestDigest, f.api).status, "transport-verified");
  assert.equal(f.inspections.length, 4, "publication retry does not relabel the qualification attempt");
  assert.ok(f.calls.every((endpoint) => /\/artifacts\/\d+$/.test(endpoint)), "never select by name again");
  f.artifacts.shift();
  assert.throws(() => verifyPinnedArtifacts(manifest, manifest.manifestDigest, f.api), /404/, "deleted pinned ID cannot fall back to newer artifact");
});

test("missing, duplicate, expired, foreign-source and digestless artifacts fail capture", () => {
  const mutations = [
    (f) => f.artifacts.shift(),
    (f) => f.artifacts.push({ ...f.artifacts[0], id: 900 }),
    (f) => { f.artifacts[0].expired = true; },
    (f) => { f.artifacts[0].digest = null; },
    (f) => { f.artifacts[0].size_in_bytes = 0; },
    (f) => { f.artifacts[0].workflow_run.head_sha = "b".repeat(40); },
    (f) => { f.artifacts[0].workflow_run.head_branch = "main"; },
    (f) => { f.artifacts[0].workflow_run.head_repository_id = 456; },
  ];
  for (const mutate of mutations) { const f = fixture(); mutate(f); assert.throws(() => captureArtifactSet(options, f)); }
  const rejected = fixture(); rejected.inspect = () => { throw new Error("product not accepted"); };
  assert.throws(() => captureArtifactSet(options, rejected), /product not accepted/);
});

test("artifact replacement and producer retries during capture cannot produce a frozen set", () => {
  const f = fixture();
  const inspect = f.inspect;
  f.inspect = (expectation) => ({ ...inspect(expectation), runAttempt: f.inspections.length > 2 ? 3 : 2 });
  assert.throws(() => captureArtifactSet(options, f), /attempt changed/);
  const g = fixture(), request = g.api;
  g.api = (endpoint) => {
    const result = request(endpoint);
    if (/\/artifacts\/100$/.test(endpoint)) result.digest = `sha256:${"b".repeat(64)}`;
    return result;
  };
  assert.throws(() => captureArtifactSet(options, g), /changed during capture/);
});

test("manifest tampering, incomplete matrices and cross-product substitutions are rejected", () => {
  const manifest = captureArtifactSet(options, fixture());
  const changed = structuredClone(manifest); changed.artifacts[0].id++;
  assert.throws(() => validateArtifactSet(changed), /digest mismatch/);
  assert.throws(() => verifyPinnedArtifacts(manifest, undefined, fixture().api), /independently authenticated/);
  assert.throws(() => verifyPinnedArtifacts(manifest, `sha256:${"b".repeat(64)}`, fixture().api), /digest mismatch/);
  for (const mutate of [
    (v) => v.artifacts.pop(), (v) => { v.artifacts[0] = v.artifacts[1]; },
    (v) => { v.artifacts[0].kind = "browser"; },
    (v) => { v.artifacts[0].key = "../escape"; },
    (v) => { v.artifacts[0].sizeInBytes = -1; },
    (v) => { v.qualification.native.runAttempt = 0; },
    (v) => { v.qualification.native.runId = v.qualification.browser.runId; },
    (v) => { v.qualification.extra = v.qualification.native; },
    (v) => { v.authorizedToPublish = true; },
    (v) => { v.artifacts[0].qualified = true; },
    (v) => { v.qualification.native.publicationAttempt = 3; },
  ]) { const copy = structuredClone(manifest); mutate(copy); assert.throws(() => validateArtifactSet(reseal(copy))); }
});

test("remote verification rejects changed digests, metadata and expired pins", () => {
  for (const mutate of [
    (v) => { v.digest = `sha256:${"c".repeat(64)}`; },
    (v) => { v.created_at = "2026-09-08T00:00:00Z"; },
    (v) => { v.expired = true; },
    (v) => { v.size_in_bytes++; },
    (v) => { v.workflow_run.id++; },
    (v) => { v.workflow_run.head_sha = "b".repeat(40); },
  ]) {
    const f = fixture(), manifest = captureArtifactSet(options, f);
    mutate(f.artifacts[0]);
    assert.throws(() => verifyPinnedArtifacts(manifest, manifest.manifestDigest, f.api));
  }
});

test("downloaded archives are streamed and checked for exact length and digest", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-artifact-set-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "artifact.zip"), manifest = captureArtifactSet(options, fixture()), key = manifest.artifacts[0].key;
  fs.writeFileSync(file, bytes);
  assert.equal((await verifyDownloadedArchive(manifest, manifest.manifestDigest, key, file)).status, "archive-verified");
  await assert.rejects(verifyDownloadedArchive(manifest, undefined, key, file), /independently authenticated/);
  for (const content of [Buffer.alloc(bytes.length), bytes.subarray(0, 3), Buffer.concat([bytes, bytes])]) {
    fs.writeFileSync(file, content);
    await assert.rejects(verifyDownloadedArchive(manifest, manifest.manifestDigest, key, file), /differs/);
  }
  await assert.rejects(verifyDownloadedArchive(manifest, manifest.manifestDigest, "../other", file), /unknown artifact/);
});

test("pagination rejects incomplete, duplicate and changing inventories", () => {
  let page = 0;
  assert.equal(readArtifacts(10, () => ({ total_count: 2, artifacts: [{ id: ++page }] })).length, 2);
  assert.throws(() => readArtifacts(10, () => ({ total_count: 2, artifacts: [] })), /invalid/);
  assert.throws(() => readArtifacts(10, () => ({ total_count: 2, artifacts: [{ id: 1 }] })), /duplicate/);
  page = 0;
  assert.throws(() => readArtifacts(10, () => ({ total_count: 2 + page, artifacts: [{ id: ++page }] })), /changed/);
  assert.throws(() => readArtifacts(10, () => ({ total_count: 1, artifacts: [{ id: 1 }, { id: 2 }] })), /exceeded/);
});

test("the pinned role inventory covers the actual workflow uploads and excludes unsigned Mac output", () => {
  for (const [kind, filename] of Object.entries({ native: "ci.yml", browser: "wasm-release.yml" })) {
    const root = path.resolve(__dirname, ".."), relative = `.github/workflows/${filename}`;
    const jobs = parseWorkflow(fs.readFileSync(path.join(root, relative), "utf8"), relative).jobs;
    for (const role of roles[kind]) {
      const producers = Object.entries(jobs).filter(([, job]) => job.steps?.some((step) => step.uses?.startsWith("actions/upload-artifact@") &&
        (step.with.name === role || (role === "wasm-clean-build-a" && step.with.name === "wasm-clean-build-${{ matrix.replica }}"))));
      assert.equal(producers.length, 1, `${kind}/${role}`);
      if (role === "sagejs-macos-arm64") assert.equal(producers[0][0], "macos-sign");
    }
  }
});

test("CLI rejects ambiguous or incomplete capture and verification options", () => {
  for (const args of [[], ["capture"], ["verify", "--manifest", "x"], ["verify", "--manifest", "x", "--manifest", "y"],
    ["capture", "--sha", options.sha, "--ref", options.ref, "--event", "push", "--purpose", "release", "--native-run", "1e2", "--browser-run", "20"]]) {
    assert.throws(() => argumentsFor(args));
  }
  assert.equal(argumentsFor(["verify", "--manifest", "x", "--expected-digest", digest]).action, "verify");
});

test("pre-tag qualification stays distinct from release publication", () => {
  const candidate = { ...options, ref: "candidate/release-080", event: "workflow_dispatch", purpose: "qualification" };
  const manifest = captureArtifactSet(candidate, fixture(candidate));
  assert.equal(manifest.purpose, "qualification");
  assert.equal(manifest.ref, candidate.ref);
  const changed = structuredClone(manifest); changed.purpose = "release";
  assert.throws(() => validateArtifactSet(reseal(changed)), /immutable tag push/);
  assert.throws(() => captureArtifactSet({ ...candidate, purpose: "release" }, fixture(candidate)), /immutable tag push/);
});
