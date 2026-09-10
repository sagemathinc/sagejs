// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";

const assert = require("node:assert/strict"), fs = require("node:fs");
const path = require("node:path"), os = require("node:os"), test = require("node:test");
const { createHash } = require("node:crypto");
const { authenticatePlatformNpmPackages, parseArguments } = require("../../../scripts/numerical-computing/qualification/authenticate-release-gate.cjs");
const platforms = ["linux-x64", "linux-arm64", "macos-arm64", "windows-x64"];
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

function fixture(t) {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "sagejs-platform-bindings-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "release/npm"), { recursive: true });
  const gate = { capability_manifests: [], matrix_receipts: [] }, manifests = new Map();
  for (const platform of platforms) {
    const bytes = Buffer.from(`qualified ${platform} tarball`);
    const relative = `build/numerical-qualification/platform/${platform}/${platform}-npm/capabilities.json`;
    const manifest = { bindings: { artifacts: [{ name: "npm-platform-tarball",
      path: `original-producer/${platform}.tgz`, content_sha256: hash(bytes), bytes: bytes.length, files: 1 }] } };
    fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    const evidence = require("../../helpers/release-platform-package.cjs").serializedEvidence(manifest);
    const serialized = evidence.manifest;
    fs.writeFileSync(path.join(root, relative), serialized);
    fs.writeFileSync(path.join(root, "release/npm", `sagejs-${platform}.tgz`), bytes);
    gate.capability_manifests.push({ row_id: `${platform}-npm`, path: relative, sha256: hash(serialized) });
    const receiptPath = relative.replace("capabilities.json", "npm.receipt.json");
    fs.writeFileSync(path.join(root, receiptPath), evidence.receipt);
    gate.matrix_receipts.push({ row_id: `${platform}-npm`, path: receiptPath, sha256: hash(evidence.receipt) });
    manifests.set(platform, manifest);
  }
  return { root, gate, manifests };
}

test("all four selected platform tarballs bind to the exact raw manifests without rewriting producer paths", (t) => {
  const f = fixture(t), before = JSON.stringify(f.gate);
  const result = authenticatePlatformNpmPackages(f.gate, "release/npm", f.root);
  assert.deepEqual(result.map((file) => file.platform), platforms);
  assert.equal(JSON.stringify(f.gate), before);
  for (const file of result) assert.equal(file.sha256, hash(fs.readFileSync(path.join(f.root, file.path))));
});

test("every platform fails on changed same-size bytes or a missing tarball", (t) => {
  for (const platform of platforms) {
    const f = fixture(t), archive = path.join(f.root, "release/npm", `sagejs-${platform}.tgz`);
    fs.writeFileSync(archive, Buffer.alloc(fs.statSync(archive).size));
    assert.throws(() => authenticatePlatformNpmPackages(f.gate, "release/npm", f.root), /differs from the qualified package/);
    fs.unlinkSync(archive);
    assert.throws(() => authenticatePlatformNpmPackages(f.gate, "release/npm", f.root), /ENOENT/);
  }
});

test("changed raw manifests cannot authorize substituted platform archives", (t) => {
  const f = fixture(t), record = f.gate.capability_manifests[0];
  fs.writeFileSync(path.join(f.root, record.path), "{}");
  assert.throws(() => authenticatePlatformNpmPackages(f.gate, "release/npm", f.root), /differs from the authenticated gate/);
});

test("compact manifests require the matching independently gate-bound receipt", (t) => {
  for (const mutate of [
    (f) => f.gate.matrix_receipts.shift(),
    (f) => f.gate.matrix_receipts.push(f.gate.matrix_receipts[0]),
    (f) => { f.gate.matrix_receipts[0].path = "elsewhere/receipt.json"; },
    (f) => fs.writeFileSync(path.join(f.root, f.gate.matrix_receipts[0].path), "{}"),
    (f) => {
      const record = f.gate.matrix_receipts[0], filename = path.join(f.root, record.path);
      const receipt = JSON.parse(fs.readFileSync(filename)); receipt.artifacts[0].sha256 = "f".repeat(64);
      const bytes = JSON.stringify(receipt); fs.writeFileSync(filename, bytes); record.sha256 = hash(bytes);
    },
  ]) {
    const f = fixture(t); mutate(f);
    assert.throws(() => authenticatePlatformNpmPackages(f.gate, "release/npm", f.root));
  }
});

test("missing, duplicated or relocated manifest rows cannot satisfy a platform", (t) => {
  for (const change of [
    (gate) => gate.capability_manifests.pop(),
    (gate) => gate.capability_manifests.push(gate.capability_manifests[0]),
    (gate) => { gate.capability_manifests[0].path = "elsewhere/capabilities.json"; },
  ]) {
    const f = fixture(t); change(f.gate);
    assert.throws(() => authenticatePlatformNpmPackages(f.gate, "release/npm", f.root), /canonical qualified manifest/);
  }
});

test("tarball bindings must be single ordinary-file records and cannot be hardlinked", (t) => {
  for (const change of [
    (manifest) => { manifest.bindings.artifacts = []; },
    (manifest) => manifest.bindings.artifacts.push(manifest.bindings.artifacts[0]),
    (manifest) => { manifest.bindings.artifacts[0].files = 2; },
    (manifest) => { manifest.bindings.artifacts[0].content_sha256 = "invalid"; },
  ]) {
    const f = fixture(t), record = f.gate.capability_manifests[0], manifest = f.manifests.get(platforms[0]);
    change(manifest); const evidence = require("../../helpers/release-platform-package.cjs").serializedEvidence(manifest), bytes = evidence.manifest;
    fs.writeFileSync(path.join(f.root, record.path), bytes); record.sha256 = hash(bytes);
    const receipt = f.gate.matrix_receipts[0];
    fs.writeFileSync(path.join(f.root, receipt.path), evidence.receipt); receipt.sha256 = hash(evidence.receipt);
    assert.throws(() => authenticatePlatformNpmPackages(f.gate, "release/npm", f.root), /one content-bound platform tarball/);
  }
  const f = fixture(t);
  fs.linkSync(path.join(f.root, "release/npm/sagejs-linux-x64.tgz"), path.join(f.root, "shared.tgz"));
  assert.throws(() => authenticatePlatformNpmPackages(f.gate, "release/npm", f.root), /differs from the qualified package/);
});

test("publisher and resumable consumer explicitly enable platform binding", () => {
  const root = path.resolve(__dirname, "../../..");
  const source = fs.readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8");
  assert.match(source, /scripts\/release\/publish-prepared.cjs/);
  const consumer = fs.readFileSync(path.join(root, "scripts/release/prepare-publication.cjs"), "utf8");
  assert.ok(consumer.includes('authenticatePlatformNpmPackages(gate, "release/npm", root)'));
  const { verificationStages } = require("../../../scripts/release/prepare-publication.cjs");
  const stage = verificationStages(root, "a".repeat(40), `sha256:${"b".repeat(64)}`)[1];
  assert.ok(stage.inputs.includes("release/npm"));
  assert.ok(stage.inputs.includes("build/numerical-qualification/platform"));
  // The control consumer performs the extra binding itself so frozen products
  // do not need a newly introduced candidate-side CLI option.
  const args = [...stage.commands[0].slice(2), "--platform-npm-directory", "release/npm"], options = parseArguments(args);
  assert.equal(options.platform_npm_directory, "release/npm");
  assert.throws(() => parseArguments([...args, "--platform-npm-directory", "other"]), /only once/);
});
