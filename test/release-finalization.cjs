// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), os = require("node:os"), { createHash } = require("node:crypto");
const { finalizeGithubRelease, requireNotSuperseded } = require("../scripts/release/finalize-github-release.cjs");
const { githubClient, localInputs, publishGithubAssets } = require("../scripts/release/publish-github-assets.cjs");
const { packages, readInputs, publishNpmPackages } = require("../scripts/release/publish-npm-packages.cjs");
const { requiredInstallerAssets } = require("../scripts/release-latest-policy.cjs");
const { tarGzip } = require("./helpers/release-tar.cjs");
function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-finalization-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const directory = path.join(root, "release"); fs.mkdirSync(path.join(directory, "npm"), { recursive: true });
  fs.writeFileSync(path.join(root, "RELEASE_NOTES.md"), "Qualified fixture release notes");
  for (const name of requiredInstallerAssets.filter((name) => !name.endsWith(".sha256"))) {
    const bytes = Buffer.from(`qualified fixture ${name}`); fs.writeFileSync(path.join(directory, name), bytes);
    if (name !== "install.sh") fs.writeFileSync(path.join(directory, `${name}.sha256`), `${createHash("sha256").update(bytes).digest("hex")}  ${name}\n`);
  }
  for (const entry of packages) {
    const metadata = { name: entry.name, version: "0.8.0", ...(entry.tag === "latest" ? { optionalDependencies:
      Object.fromEntries(packages.slice(0, 4).map((entry) => [entry.name, "0.8.0"])) } : {}) };
    fs.writeFileSync(path.join(directory, "npm", entry.archive), tarGzip([{ name: "package/package.json", data: JSON.stringify(metadata), gnu: false }]));
  }
  const assets = localInputs(directory, path.join(root, "RELEASE_NOTES.md")).assets.map((asset, i) => ({ ...asset, id: i + 1, state: "uploaded" }));
  const versions = new Map(readInputs(path.join(directory, "npm"), "0.8.0").map((record) => [record.name, { name: record.name, version: record.version, dist: { integrity: record.integrity } }]));
  const state = { release: { id: 123, tag_name: "v0.8.0", draft: true, prerelease: false },
    latest: { id: 12, tag_name: "v0.7.0", draft: false, prerelease: false }, extras: [], npmLatest: "0.8.0", source: "a".repeat(40) };
  const patches = [];
  const clients = {
    github: {
      async resolveTag() { return state.source; },
      async findRelease() { return { ...state.release }; },
      async latestRelease() { return state.latest && { ...state.latest }; },
      async listReleases() { return [{ ...state.release, assets }, ...state.extras]; },
      async listAssets() { return assets.map((asset) => ({ ...asset })); },
      async makePublicLatest(id) { patches.push(id); state.release.draft = false; state.latest = { ...state.release }; },
    },
    npm: {
      async version(record) { return versions.get(record.name) ?? null; },
      async tags() { return { latest: state.npmLatest }; },
    },
  };
  return { root, options: { root, tag: "v0.8.0", source: state.source }, clients, state, assets, versions, patches,
    journal: path.join(root, "release-finalization.json") };
}
test("finalization rechecks complete product state and promotes only once", async (t) => {
  const f = fixture(t);
  const result = await finalizeGithubRelease(f.options, f.clients);
  assert.equal(result.phase, "github-and-npm-promoted"); assert.deepEqual(f.patches, [123]);
  assert.equal(f.state.latest.tag_name, "v0.8.0"); assert.equal(f.state.release.draft, false);
  await finalizeGithubRelease(f.options, f.clients); assert.deepEqual(f.patches, [123]);
});
test("interruption after accepted promotion resumes with no second remote mutation", async (t) => {
  const f = fixture(t);
  await assert.rejects(finalizeGithubRelease(f.options, f.clients, (phase) => {
    if (phase === "remote-promoted") throw new Error("controller interrupted");
  }), /controller interrupted/);
  assert.equal(JSON.parse(fs.readFileSync(f.journal)).phase, "promoting");
  await finalizeGithubRelease(f.options, f.clients); assert.deepEqual(f.patches, [123]);
});
test("cold controller recovers a lost successful response from remote state", async (t) => {
  const f = fixture(t), promote = f.clients.github.makePublicLatest;
  f.clients.github.makePublicLatest = async (id) => { await promote(id); throw new Error("lost response"); };
  await assert.rejects(finalizeGithubRelease(f.options, f.clients), /lost response/);
  fs.unlinkSync(f.journal); f.clients.github.makePublicLatest = promote;
  await finalizeGithubRelease(f.options, f.clients); assert.deepEqual(f.patches, [123]);
});
test("an old complete journal cannot hide changed remote bytes or channels", async (t) => {
  for (const defect of ["asset", "package", "channel"]) {
    const f = fixture(t); await finalizeGithubRelease(f.options, f.clients);
    if (defect === "asset") f.assets[0].digest = `sha256:${"0".repeat(64)}`;
    if (defect === "package") f.versions.get(packages[0].name).dist.integrity = "wrong";
    if (defect === "channel") f.state.npmLatest = "0.9.0";
    await assert.rejects(finalizeGithubRelease(f.options, f.clients), /conflicts|npm latest/);
    assert.deepEqual(f.patches, [123]);
  }
});
test("incomplete uploads or npm publication cannot be repaired by finalization", async (t) => {
  for (const defect of ["missing-asset", "starter", "missing-package", "old-channel"]) {
    const f = fixture(t);
    if (defect === "missing-asset") f.assets.pop();
    if (defect === "starter") f.assets[0].state = "starter";
    if (defect === "missing-package") f.versions.delete(packages[0].name);
    if (defect === "old-channel") f.state.npmLatest = "0.7.0";
    await assert.rejects(finalizeGithubRelease(f.options, f.clients), /missing|conflicts|npm latest/);
    assert.deepEqual(f.patches, []); assert.equal(f.state.release.draft, true);
  }
});
test("higher product versions and recovery generations prevent stale promotion", async (t) => {
  for (const tag of ["v0.9.0", "v0.10.0"]) {
    const f = fixture(t); f.state.latest = { ...f.state.latest, tag_name: tag };
    await assert.rejects(finalizeGithubRelease(f.options, f.clients), /newer GitHub product/); assert.equal(f.patches.length, 0);
  }
  const f = fixture(t); f.state.extras = [{ id: 456, tag_name: "v0.9.0", draft: false, prerelease: false, assets: f.assets }];
  await assert.rejects(finalizeGithubRelease(f.options, f.clients), /newer GitHub product/); assert.equal(f.patches.length, 0);
  assert.throws(() => requireNotSuperseded("v0.8.0+release.5", { id: 1, tag_name: "v0.8.0+release.6", draft: false, prerelease: false }, []), /newer/);
  assert.throws(() => requireNotSuperseded("v0.8.0+release.6", { id: 1, tag_name: "v0.8.0", draft: false, prerelease: false }, []), /newer/);
});
test("infrastructure Latest can be replaced by a fully verified product", async (t) => {
  const f = fixture(t); f.state.latest.tag_name = "native-dependencies-99";
  await finalizeGithubRelease(f.options, f.clients); assert.deepEqual(f.patches, [123]);
});
test("lookup errors, changed tags and replaced release IDs stop promotion", async (t) => {
  const f = fixture(t); f.clients.github.latestRelease = async () => { throw new Error("HTTP 503"); };
  await assert.rejects(finalizeGithubRelease(f.options, f.clients), /HTTP 503/); assert.equal(f.patches.length, 0);
  const g = fixture(t); g.state.source = "b".repeat(40);
  await assert.rejects(finalizeGithubRelease(g.options, g.clients), /tag changed/); assert.equal(g.patches.length, 0);
  const h = fixture(t); await finalizeGithubRelease(h.options, h.clients); h.state.release.id = 999;
  await assert.rejects(finalizeGithubRelease(h.options, h.clients), /changed identity/); assert.equal(h.patches.length, 1);
});
test("post-write drift is reported without undoing or repeating publication", async (t) => {
  const f = fixture(t);
  await assert.rejects(finalizeGithubRelease(f.options, f.clients, (phase) => {
    if (phase === "remote-promoted") f.state.npmLatest = "0.9.0";
  }), /npm latest/);
  assert.equal(f.state.release.draft, false); assert.deepEqual(f.patches, [123]);
  await assert.rejects(finalizeGithubRelease(f.options, f.clients), /npm latest/); assert.deepEqual(f.patches, [123]);
});
test("a newer Latest appearing during registry verification is caught before mutation", async (t) => {
  const f = fixture(t), tags = f.clients.npm.tags;
  f.clients.npm.tags = async () => { f.state.latest.tag_name = "v0.9.0"; return tags(); };
  await assert.rejects(finalizeGithubRelease(f.options, f.clients), /newer GitHub product/);
  assert.equal(f.patches.length, 0);
});
test("a successful request is not success until both public state and Latest are observable", async (t) => {
  const f = fixture(t); f.clients.github.makePublicLatest = async (id) => { f.patches.push(id); };
  await assert.rejects(finalizeGithubRelease(f.options, f.clients), /not observable/);
  assert.notEqual(JSON.parse(fs.readFileSync(f.journal)).phase, "github-and-npm-promoted");
});
test("local changes and cancellation between verification and mutation are rejected", async (t) => {
  const f = fixture(t); await finalizeGithubRelease(f.options, f.clients);
  fs.appendFileSync(path.join(f.root, "RELEASE_NOTES.md"), "different inputs");
  await assert.rejects(finalizeGithubRelease(f.options, f.clients), /different or invalid inputs/); assert.equal(f.patches.length, 1);
  const g = fixture(t), controller = new AbortController(); g.options.signal = controller.signal;
  await assert.rejects(finalizeGithubRelease(g.options, g.clients, (phase) => {
    if (phase === "promoting") controller.abort(new Error("cancelled"));
  }), /cancelled/);
  assert.equal(g.patches.length, 0); assert.equal(fs.existsSync(`${g.journal}.lock`), false);
});
test("real GitHub adapter makes only the explicit selected-release PATCH", async (t) => {
  const previous = process.env.GH_TOKEN; process.env.GH_TOKEN = "fixture";
  t.after(() => { if (previous === undefined) delete process.env.GH_TOKEN; else process.env.GH_TOKEN = previous; });
  const requests = [];
  const client = githubClient(async (url, init) => { requests.push({ url, ...init }); return { ok: true, json: async () => [] }; });
  await client.listReleases(); await client.latestRelease(); await client.makePublicLatest(123);
  assert.equal(requests[0].method, "GET"); assert.equal(requests[1].method, "GET");
  assert.equal(requests[2].method, "PATCH"); assert.match(requests[2].url, /\/releases\/123$/);
  assert.deepEqual(JSON.parse(requests[2].body), { draft: false, prerelease: false, make_latest: "true" });
  assert.throws(() => client.makePublicLatest("123"), /exact release ID/);
});
test("the three real publisher controllers resume one interrupted fixture pipeline without duplicate writes", async (t) => {
  const f = fixture(t), githubUploads = [], npmUploads = [];
  f.assets.length = 0; f.versions.clear(); f.state.npmLatest = "0.7.0";
  f.clients.github.upload = async (_tag, filename) => {
    const bytes = fs.readFileSync(filename), name = path.basename(filename);
    githubUploads.push(name); f.assets.push({ name, id: f.assets.length + 1, state: "uploaded", size: bytes.length,
      digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}` });
  };
  f.clients.npm.resolveTag = f.clients.github.resolveTag;
  f.clients.npm.wait = async () => { throw new Error("fixture publishes are immediately visible"); };
  f.clients.npm.publish = async (record) => {
    npmUploads.push(record.name);
    f.versions.set(record.name, { name: record.name, version: record.version, dist: { integrity: record.integrity } });
    if (record.tag === "latest") f.state.npmLatest = record.version;
  };
  const assetOptions = { ...f.options, directory: path.join(f.root, "release"), notes: path.join(f.root, "RELEASE_NOTES.md"), journal: path.join(f.root, "release-publication.json") };
  await assert.rejects(publishGithubAssets(assetOptions, f.clients.github, (phase) => {
    if (phase === "uploaded-before-recording" && githubUploads.length === 3) throw new Error("upload interruption");
  }), /upload interruption/);
  await publishGithubAssets(assetOptions, f.clients.github);
  const npmOptions = { ...f.options, directory: path.join(f.root, "release/npm"), journal: path.join(f.root, "npm-publication.json") };
  await assert.rejects(publishNpmPackages(npmOptions, f.clients.npm, (phase) => {
    if (phase.startsWith("accepted:") && npmUploads.length === 3) throw new Error("npm interruption");
  }), /npm interruption/);
  await publishNpmPackages(npmOptions, f.clients.npm);
  await assert.rejects(finalizeGithubRelease(f.options, f.clients, (phase) => {
    if (phase === "remote-promoted") throw new Error("finalization interruption");
  }), /finalization interruption/);
  await finalizeGithubRelease(f.options, f.clients);
  assert.deepEqual(githubUploads, requiredInstallerAssets);
  assert.deepEqual(npmUploads, packages.map((entry) => entry.name));
  assert.deepEqual(f.patches, [123]);
  assert.equal(f.state.latest.tag_name, f.options.tag); assert.equal(f.state.npmLatest, "0.8.0");
});
