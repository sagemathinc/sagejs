// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { createHash } = require("node:crypto");
const { authenticatePackagedExecutables, platforms } = require("../scripts/release/packaged-executables.cjs");
const { authenticatePlatformNpmPackages } = require("../scripts/numerical-computing/qualification/authenticate-release-gate.cjs");
const { platformPackage } = require("./helpers/release-platform-package.cjs");
const { tarGzip } = require("./helpers/release-tar.cjs");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
function fixture(t) {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "sagejs-packaged-sea-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "release/npm"), { recursive: true });
  const gate = { capability_manifests: [], matrix_receipts: [] }, products = new Map();
  function writeManifest(platform, kind, value) {
    const row_id = `${platform}-${kind}`, relative = `build/numerical-qualification/platform/${platform}/${row_id}/capabilities.json`;
    const evidence = require("./helpers/release-platform-package.cjs").serializedEvidence(value);
    const bytes = evidence.manifest;
    fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true }); fs.writeFileSync(path.join(root, relative), bytes);
    const record = gate.capability_manifests.find((item) => item.row_id === row_id);
    if (record) record.sha256 = hash(bytes);
    else gate.capability_manifests.push({ row_id, path: relative, sha256: hash(bytes) });
    const receiptPath = relative.replace("capabilities.json", `${kind}.receipt.json`);
    fs.writeFileSync(path.join(root, receiptPath), evidence.receipt);
    const receiptRecord = gate.matrix_receipts.find((item) => item.row_id === row_id);
    if (receiptRecord) receiptRecord.sha256 = hash(evidence.receipt);
    else gate.matrix_receipts.push({ row_id, path: receiptPath, sha256: hash(evidence.receipt) });
  }
  for (const platform of platforms) {
    const product = platformPackage(platform); products.set(platform, product);
    fs.writeFileSync(path.join(root, `release/npm/sagejs-${platform}.tgz`), product.bytes);
    for (const [kind, value] of product.manifests) writeManifest(platform, kind, value);
  }
  function replacePackage(platform, entries) {
    const bytes = tarGzip(entries), binding = products.get(platform).manifests.get("npm");
    binding.bindings.artifacts[0].content_sha256 = hash(bytes); binding.bindings.artifacts[0].bytes = bytes.length;
    fs.writeFileSync(path.join(root, `release/npm/sagejs-${platform}.tgz`), bytes); writeManifest(platform, "npm", binding);
  }
  const selected = () => authenticatePlatformNpmPackages(gate, "release/npm", root);
  return { root, gate, products, selected, writeManifest, replacePackage };
}
test("qualified npm binaries cross-bind to all four standalone SEA rows without execution or rewriting evidence", async (t) => {
  const f = fixture(t), before = JSON.stringify(f.gate);
  const result = await authenticatePackagedExecutables(f.root, f.gate, f.selected());
  assert.deepEqual(result.map((item) => item.platform), platforms);
  for (const item of result) {
    assert.equal(item.executables[0].sha256, hash(f.products.get(item.platform).sea));
    assert.equal(item.executables[1].sha256, hash(f.products.get(item.platform).python));
    assert.equal(item.executables[1].evidence, `${item.platform}-npm`, "sagepython is not mislabeled as an independently collected SEA row");
  }
  assert.equal(JSON.stringify(f.gate), before);
  assert.deepEqual(await authenticatePackagedExecutables(f.root, f.gate, f.selected()), result);
});
test("matching tarball qualification alone cannot hide a different packaged SEA on any platform", async (t) => {
  for (const platform of platforms) {
    const f = fixture(t), entries = f.products.get(platform).entries;
    f.replacePackage(platform, [{ ...entries[0], data: "substituted binary" }, entries[1]]);
    await assert.rejects(authenticatePackagedExecutables(f.root, f.gate, f.selected()), /differs from the qualified standalone SEA/);
  }
});
test("missing, duplicate, relocated or modified raw SEA records cannot authorize a packaged binary", async (t) => {
  for (const mutate of [
    (f, record) => f.gate.capability_manifests.splice(f.gate.capability_manifests.indexOf(record), 1),
    (f, record) => f.gate.capability_manifests.push(record),
    (_f, record) => { record.path = "other/capabilities.json"; },
    (f, record) => fs.writeFileSync(path.join(f.root, record.path), "{}"),
    (f) => f.writeManifest("linux-x64", "sea", { bindings: { artifacts: [] } }),
    (f) => { const value = f.products.get("linux-x64").manifests.get("sea"); value.bindings.artifacts.push(value.bindings.artifacts[0]); f.writeManifest("linux-x64", "sea", value); },
  ]) {
    const f = fixture(t), record = f.gate.capability_manifests.find((item) => item.row_id === "linux-x64-sea");
    const selected = f.selected(); mutate(f, record);
    await assert.rejects(authenticatePackagedExecutables(f.root, f.gate, selected), /qualified manifest|authenticated gate|content-bound SEA/);
  }
});
test("missing binaries, duplicate members and GNU archives cannot pass the npm content reader", async (t) => {
  const f = fixture(t), entries = f.products.get("windows-x64").entries;
  for (const changed of [[entries[0]], [{ ...entries[0], data: "" }, entries[1]], [...entries, entries[0]], entries.map((entry) => ({ ...entry, gnu: true }))]) {
    f.replacePackage("windows-x64", changed);
    await assert.rejects(authenticatePackagedExecutables(f.root, f.gate, f.selected()), /lacks regular executable|duplicate|dialect/);
  }
});
test("selected descriptors and archive bytes cannot substitute another source and cancellation is honored", async (t) => {
  const f = fixture(t), selected = f.selected();
  for (const changed of [selected.slice(1), [selected[0], ...selected.slice(0, 3)],
    selected.map((value, i) => i ? value : { ...value, path: "elsewhere.tgz" }),
    selected.map((value, i) => i ? value : { ...value, sha256: "0".repeat(64) })]) {
    await assert.rejects(authenticatePackagedExecutables(f.root, f.gate, changed), /selection|noncanonical|differs/);
  }
  await assert.rejects(authenticatePackagedExecutables(f.root, f.gate, selected, { signal: AbortSignal.abort() }), /abort/i);
  fs.appendFileSync(path.join(f.root, selected[0].path), "replacement");
  await assert.rejects(authenticatePackagedExecutables(f.root, f.gate, selected), /differs/);
});

test("producer qualification uses post-signing paths and preserves Windows signing mode checks", () => {
  const { parseWorkflow } = require("../scripts/release/workflow-inventory.cjs");
  const name = ".github/workflows/ci.yml", doc = parseWorkflow(fs.readFileSync(path.join(__dirname, "..", name), "utf8"), name);
  const mac = doc.jobs["macos-sign"].steps;
  const index = (steps, name) => { const found = steps.findIndex((step) => step.name === name); assert.ok(found >= 0, name); return found; };
  const sign = index(mac, "Sign, notarize, and package macOS arm64"), pack = index(mac, "Package macOS arm64 for npm");
  const collect = index(mac, "Collect exact signed macOS npm and SEA numerical rows");
  assert.ok(sign < pack && pack < collect);
  assert.match(mac[sign].run, /release:macos --skip-build/);
  assert.ok(!mac[sign].run.includes("--skip-notarize"));
  assert.match(mac[pack].run, /build\/release\/sagejs-macos-arm64\/sagejs/);
  assert.match(mac[pack].run, /build\/release\/sagejs-macos-arm64\/sagepython/);
  assert.match(mac[collect].run, /--sea-executable build\/release\/sagejs-macos-arm64\/sagejs/);
  const windows = doc.jobs["windows-x64"].steps;
  const policy = index(windows, "Record the Windows signing policy"), distribution = index(windows, "Package the Windows x64 SEA distribution");
  assert.ok(index(windows, "Verify Azure-signed Windows executables") < policy);
  assert.ok(index(windows, "Authenticode-sign Windows release or candidate executables with a PFX") < policy);
  assert.ok(policy < distribution && distribution < index(windows, "Package Windows x64 for npm"));
  assert.ok(index(windows, "Package Windows x64 for npm") < index(windows, "Collect exact Windows x64 numerical product rows"));
  assert.match(windows[policy].run, /Unsupported SAGEJS_WINDOWS_SIGNING_MODE/);
});
