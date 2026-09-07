// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { createHash } = require("node:crypto");
const { publishGithubAssets, githubClient, localInputs } = require("../scripts/release/publish-github-assets.cjs");
const { requiredInstallerAssets } = require("../scripts/release-latest-policy.cjs");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-publish-test-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const directory = path.join(root, "release"); fs.mkdirSync(directory);
  for (const name of requiredInstallerAssets.filter((name) => !name.endsWith(".sha256"))) {
    fs.writeFileSync(path.join(directory, name), `qualified fixture bytes: ${name}`);
    if (name !== "install.sh") fs.writeFileSync(path.join(directory, `${name}.sha256`), `${digest(fs.readFileSync(path.join(directory, name)))}  ${name}\r\n`);
  }
  const notes = path.join(root, "notes.md"); fs.writeFileSync(notes, "Fixture release notes");
  const options = { directory, notes, journal: path.join(root, "journal.json"), tag: "v0.8.0", source: "a".repeat(40) };
  let release = null, tagSource = options.source;
  const assets = [], uploads = [], creates = [], reads = [];
  const api = {
    async resolveTag() { return tagSource; },
    async findRelease() { reads.push("release"); return release && { ...release }; },
    async createDraft(tag, source, body) { creates.push({ tag, source, body }); return release = { id: 123, tag_name: tag, draft: true, prerelease: false }; },
    async listAssets() { reads.push("assets"); return assets.map((entry) => ({ ...entry })); },
    async upload(tag, filename) {
      uploads.push(path.basename(filename));
      const bytes = fs.readFileSync(filename);
      assets.push({ id: assets.length + 1, name: path.basename(filename), state: "uploaded", size: bytes.length, digest: `sha256:${digest(bytes)}` });
    },
  };
  return { options, api, assets, uploads, creates, reads, setRelease(value) { release = value; }, setSource(value) { tagSource = value; } };
}
test("uploads all eleven exact assets once and rechecks complete journals", async (t) => {
  const f = fixture(t);
  const result = await publishGithubAssets(f.options, f.api);
  assert.equal(result.phase, "assets-verified"); assert.equal(result.assets.length, 11);
  assert.equal(f.uploads.length, 11); assert.equal(f.creates.length, 1);
  const reads = f.reads.length;
  await publishGithubAssets(f.options, f.api);
  assert.equal(f.uploads.length, 11); assert.equal(f.creates.length, 1); assert.ok(f.reads.length > reads);
  f.assets[0].digest = `sha256:${"0".repeat(64)}`;
  await assert.rejects(publishGithubAssets(f.options, f.api), /conflicts/);
});
test("interruption after remote upload resumes without duplicating any upload", async (t) => {
  const f = fixture(t); let uploaded = 0;
  await assert.rejects(publishGithubAssets(f.options, f.api, (phase) => {
    if (phase === "uploaded-before-recording" && ++uploaded === 3) throw new Error("controller stopped");
  }), /controller stopped/);
  assert.equal(f.uploads.length, 3);
  assert.match(JSON.parse(fs.readFileSync(f.options.journal)).phase, /^uploading:/);
  await publishGithubAssets(f.options, f.api);
  assert.deepEqual(f.uploads, requiredInstallerAssets);
});
test("cold controller can reconstruct partial progress without its journal", async (t) => {
  const f = fixture(t);
  await assert.rejects(publishGithubAssets(f.options, f.api, (phase) => {
    if (phase === "uploaded-before-recording") throw new Error("lost runner");
  }), /lost runner/);
  fs.unlinkSync(f.options.journal);
  await publishGithubAssets(f.options, f.api);
  assert.equal(f.creates.length, 1); assert.deepEqual(f.uploads, requiredInstallerAssets);
});
test("unknown upload outcome is reconciled on next invocation", async (t) => {
  const f = fixture(t), upload = f.api.upload;
  f.api.upload = async (...args) => { await upload(...args); throw new Error("connection lost after acceptance"); };
  await assert.rejects(publishGithubAssets(f.options, f.api), /connection lost/);
  f.api.upload = upload;
  await publishGithubAssets(f.options, f.api);
  assert.equal(f.uploads.length, 11);
});
test("lost draft-creation response reuses the draft discovered remotely", async (t) => {
  const f = fixture(t), create = f.api.createDraft;
  f.api.createDraft = async (...args) => { await create(...args); throw new Error("lost creation response"); };
  await assert.rejects(publishGithubAssets(f.options, f.api), /lost creation/);
  f.api.createDraft = create;
  await publishGithubAssets(f.options, f.api);
  assert.equal(f.creates.length, 1); assert.equal(f.uploads.length, 11);
});
test("tag movement or concurrent publication stops further uploads", async (t) => {
  for (const change of ["tag", "published"]) {
    const f = fixture(t);
    await assert.rejects(publishGithubAssets(f.options, f.api, (phase) => {
      if (phase !== "uploaded-before-recording") return;
      if (change === "tag") f.setSource("b".repeat(40));
      else f.setRelease({ id: 123, tag_name: f.options.tag, draft: false, prerelease: false });
    }), change === "tag" ? /tag does not resolve/ : /published during upload/);
    assert.equal(f.uploads.length, 1);
    assert.notEqual(JSON.parse(fs.readFileSync(f.options.journal)).phase, "assets-verified");
  }
});
test("remote lookup failure never creates a release", async (t) => {
  const f = fixture(t); f.api.findRelease = async () => { throw new Error("rate limited"); };
  await assert.rejects(publishGithubAssets(f.options, f.api), /rate limited/);
  assert.equal(f.creates.length, 0); assert.equal(f.uploads.length, 0);
});
test("wrong source, malformed checksum and changed journal inputs fail before writes", async (t) => {
  const f = fixture(t); f.setSource("b".repeat(40));
  await assert.rejects(publishGithubAssets(f.options, f.api), /tag does not resolve/);
  assert.equal(f.creates.length, 0);
  f.setSource(f.options.source);
  await publishGithubAssets(f.options, f.api);
  fs.appendFileSync(f.options.notes, " altered");
  await assert.rejects(publishGithubAssets(f.options, f.api), /different inputs/);
  fs.writeFileSync(path.join(f.options.directory, "sagejs-linux-x64.tar.xz.sha256"), "wrong");
  assert.throws(() => localInputs(f.options.directory, f.options.notes), /checksum/);
  assert.equal(f.uploads.length, 11);
});
test("complete public release is read-only; incomplete public release is rejected", async (t) => {
  const f = fixture(t); await publishGithubAssets(f.options, f.api);
  f.setRelease({ id: 123, tag_name: f.options.tag, draft: false, prerelease: false });
  await publishGithubAssets(f.options, f.api); assert.equal(f.uploads.length, 11);
  f.assets.pop();
  await assert.rejects(publishGithubAssets(f.options, f.api), /published release is incomplete/);
  assert.equal(f.uploads.length, 11);
});
test("missing digests, starter assets, duplicates and wrong sizes never clobber", async (t) => {
  const f = fixture(t); await publishGithubAssets(f.options, f.api);
  const original = { ...f.assets[0] };
  for (const changed of [{ digest: null }, { state: "starter" }, { size: 1 }]) {
    Object.assign(f.assets[0], original, changed);
    await assert.rejects(publishGithubAssets(f.options, f.api), /conflicts/);
  }
  Object.assign(f.assets[0], original); f.assets.push({ ...original, id: 999 });
  await assert.rejects(publishGithubAssets(f.options, f.api), /duplicate remote/);
  assert.equal(f.uploads.length, 11);
});
test("release disappearance or replacement cannot reuse an old journal", async (t) => {
  const f = fixture(t); await publishGithubAssets(f.options, f.api);
  f.setRelease(null);
  await assert.rejects(publishGithubAssets(f.options, f.api), /disappeared/);
  f.setRelease({ id: 124, tag_name: f.options.tag, draft: true, prerelease: false });
  await assert.rejects(publishGithubAssets(f.options, f.api), /identity changed/);
  assert.equal(f.creates.length, 1);
});
test("mid-upload local changes and invisible writes cannot be journaled as success", async (t) => {
  const f = fixture(t);
  await assert.rejects(publishGithubAssets(f.options, f.api, (phase, record) => {
    if (phase === "uploaded-before-recording") fs.appendFileSync(path.join(f.options.directory, record.name), "tampered");
  }), /input changed/);
  assert.notEqual(JSON.parse(fs.readFileSync(f.options.journal)).phase, "assets-verified");
  const g = fixture(t); g.api.upload = async () => {};
  await assert.rejects(publishGithubAssets(g.options, g.api), /upload not observable/);
});
test("API client distinguishes 404 from errors, paginates and never enables clobber", async (t) => {
  const previous = process.env.GH_TOKEN; process.env.GH_TOKEN = "fixture-not-a-secret";
  t.after(() => { if (previous === undefined) delete process.env.GH_TOKEN; else process.env.GH_TOKEN = previous; });
  let status = 404;
  const client = githubClient(async () => ({ status, ok: false }));
  assert.equal(await client.findRelease("v0.8.0"), null);
  for (status of [401, 403, 429, 500]) await assert.rejects(client.findRelease("v0.8.0"), /HTTP/);
  let page = 0; const calls = [];
  const other = githubClient(async () => ({ ok: true, json: async () => ++page === 1 ? Array(100).fill({}) : [{ id: 101 }] }), (...args) => calls.push(args));
  assert.equal((await other.listAssets(123)).length, 101);
  await other.upload("v0.8.0", "/fixture/asset");
  assert.deepEqual(calls[0][1], ["release", "upload", "v0.8.0", "/fixture/asset", "--repo", "sagemathinc/sagejs"]);
});
test("draft creation pins source and never advances Latest", async (t) => {
  const previous = process.env.GH_TOKEN; process.env.GH_TOKEN = "fixture";
  t.after(() => { if (previous === undefined) delete process.env.GH_TOKEN; else process.env.GH_TOKEN = previous; });
  let request;
  const client = githubClient(async (url, options) => { request = { url, ...options }; return { ok: true, json: async () => ({ id: 1 }) }; });
  await client.createDraft("v0.8.0", "a".repeat(40), "Notes");
  assert.equal(request.method, "POST"); assert.equal(request.redirect, "error");
  assert.deepEqual(JSON.parse(request.body), { tag_name: "v0.8.0", target_commitish: "a".repeat(40), name: "Sage.js 0.8.0 — early alpha",
    body: "Notes", draft: true, prerelease: false, make_latest: "false" });
});
