// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { publishNpmPackages, npmClient, readInputs, packages, compareVersions } = require("../scripts/release/publish-npm-packages.cjs");
const { tarGzip } = require("./helpers/release-tar.cjs");
function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-npm-publish-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const directory = path.join(root, "npm"); fs.mkdirSync(directory);
  const version = "0.8.0", rootName = packages[4].name;
  function write(index, changes = {}) {
    const entry = packages[index], metadata = { name: entry.name, version,
      ...(index === 4 ? { optionalDependencies: Object.fromEntries(packages.slice(0, 4).map((entry) => [entry.name, version])) } : {}), ...changes };
    fs.writeFileSync(path.join(directory, entry.archive), tarGzip([{ name: "package/package.json", data: JSON.stringify(metadata), gnu: false }]));
  }
  for (let i = 0; i < 5; i++) write(i);
  const options = { directory, journal: path.join(root, "journal.json"), tag: "v0.8.0", source: "a".repeat(40) };
  const versions = new Map(), uploads = [], waits = [], events = [];
  let latest = "0.7.0";
  const api = {
    async resolveTag() { return options.source; },
    async version(record) { return versions.get(record.name) ?? null; },
    async tags(name) { assert.equal(name, rootName); return { latest }; },
    async publish(record) {
      uploads.push(record.name); events.push(`publish:${record.name}`);
      if (record.name === rootName) {
        assert.ok(packages.slice(0, 4).every((entry) => versions.has(entry.name)), "all exact platform versions are visible before root publication");
        latest = record.version;
      }
      versions.set(record.name, { name: record.name, version: record.version, dist: { integrity: record.integrity } });
    },
    async wait(ms, signal) { signal.throwIfAborted(); waits.push(ms); events.push("wait"); },
  };
  return { options, api, versions, uploads, waits, events, write, setLatest(value) { latest = value; } };
}
test("publishes exactly five qualified archives with root/latest last, then reuses all", async (t) => {
  const f = fixture(t);
  const result = await publishNpmPackages(f.options, f.api);
  assert.equal(result.phase, "packages-and-root-channel-verified");
  assert.deepEqual(f.uploads, packages.map((entry) => entry.name));
  await publishNpmPackages(f.options, f.api); assert.equal(f.uploads.length, 5);
  f.versions.get(packages[0].name).dist.integrity = "different";
  await assert.rejects(publishNpmPackages(f.options, f.api), /conflicts with qualified/);
  assert.equal(f.uploads.length, 5);
});
test("failed partial publication resumes without repeating accepted versions", async (t) => {
  const f = fixture(t), publish = f.api.publish; let count = 0;
  f.api.publish = async (...args) => { if (++count === 3) throw new Error("network failure"); await publish(...args); };
  await assert.rejects(publishNpmPackages(f.options, f.api), /network failure/);
  assert.equal(f.uploads.length, 2);
  f.api.publish = publish;
  await publishNpmPackages(f.options, f.api); assert.deepEqual(f.uploads, packages.map((entry) => entry.name));
});
test("cold controller recovers an accepted write whose response was lost", async (t) => {
  const f = fixture(t), publish = f.api.publish;
  f.api.publish = async (...args) => { await publish(...args); throw new Error("lost response"); };
  await assert.rejects(publishNpmPackages(f.options, f.api), /lost response/);
  fs.unlinkSync(f.options.journal); f.api.publish = publish;
  await publishNpmPackages(f.options, f.api); assert.equal(f.uploads.length, 5);
});
test("all platform scanning delays are waited together before publishing root", async (t) => {
  const f = fixture(t), version = f.api.version; let scans = 0;
  f.api.version = async (record) => record.tag !== "latest" && scans < 2 ? null : version(record);
  f.api.wait = async () => { f.waits.push(++scans); assert.equal(f.uploads.length, 4); };
  await publishNpmPackages(f.options, f.api);
  assert.equal(scans, 2); assert.equal(f.uploads.length, 5);
});
test("retained accepted writes wait through scanning on retry without republishing", async (t) => {
  const f = fixture(t); let stop = true;
  await assert.rejects(publishNpmPackages(f.options, f.api, (phase) => {
    if (stop && phase.startsWith("accepted:")) { stop = false; throw new Error("stopped after success"); }
  }), /stopped/);
  const version = f.api.version; let scans = 0;
  f.api.version = async (record) => record.name === packages[0].name && scans === 0 ? null : version(record);
  f.api.wait = async () => { scans++; };
  await publishNpmPackages(f.options, f.api); assert.equal(f.uploads.length, 5); assert.equal(scans, 1);
});
test("visibility deadline preserves immutable uploads and leaves root latest untouched", async (t) => {
  const f = fixture(t); f.api.version = async () => null;
  await assert.rejects(publishNpmPackages(f.options, f.api), /visibility deadline/);
  assert.equal(f.uploads.length, 4); assert.equal(f.waits.length, 119);
  assert.deepEqual(await f.api.tags(packages[4].name), { latest: "0.7.0" });
});
test("registry/auth failures and mismatched existing packages prevent every write", async (t) => {
  for (const mode of ["error", "wrong-integrity"]) {
    const f = fixture(t);
    f.api.version = async () => { if (mode === "error") throw new Error("HTTP 403"); return { name: "wrong", version: "0.8.0", dist: { integrity: "different" } }; };
    await assert.rejects(publishNpmPackages(f.options, f.api), mode === "error" ? /HTTP 403/ : /conflicts/);
    assert.equal(f.uploads.length, 0);
  }
});
test("wrong root latest requires explicit channel repair; newer latest never rolls back", async (t) => {
  const f = fixture(t); await publishNpmPackages(f.options, f.api);
  fs.unlinkSync(f.options.journal); f.setLatest("0.7.0");
  await assert.rejects(publishNpmPackages(f.options, f.api), /authenticated channel repair/);
  f.setLatest("0.9.0");
  await assert.rejects(publishNpmPackages(f.options, f.api), /newer npm latest/);
  assert.equal(f.uploads.length, 5);
  const g = fixture(t); g.setLatest("0.10.0");
  await assert.rejects(publishNpmPackages(g.options, g.api), /newer npm latest/); assert.equal(g.uploads.length, 0);
});
test("root channel propagation can finish after the publish command without republishing", async (t) => {
  const f = fixture(t), publish = f.api.publish;
  f.api.publish = async (...args) => { await publish(...args); f.setLatest("0.7.0"); };
  f.api.wait = async () => { f.waits.push(1); f.setLatest("0.8.0"); };
  await publishNpmPackages(f.options, f.api);
  assert.equal(f.uploads.length, 5); assert.equal(f.waits.length, 1);
});
test("tag movement during scanning stops root publication", async (t) => {
  const f = fixture(t), version = f.api.version; let waited = false;
  f.api.version = async (record) => !waited ? null : version(record);
  f.api.wait = async () => { waited = true; f.api.resolveTag = async () => "b".repeat(40); };
  await assert.rejects(publishNpmPackages(f.options, f.api), /release tag changed/);
  assert.equal(f.uploads.length, 4);
});
test("local metadata, exact root pins and journal identity cannot drift", async (t) => {
  for (const changes of [{ name: "unrelated" }, { version: "0.9.0" }, { publishConfig: { registry: "https://wrong.invalid" } }, { publishConfig: 42 }]) {
    const f = fixture(t); f.write(0, changes);
    await assert.rejects(publishNpmPackages(f.options, f.api), /metadata\/publish configuration/); assert.equal(f.uploads.length, 0);
  }
  const f = fixture(t); f.write(4, { optionalDependencies: {} });
  assert.throws(() => readInputs(f.options.directory, "0.8.0"), /pin all four/);
  const g = fixture(t); await publishNpmPackages(g.options, g.api); g.write(0, { description: "changed bytes" });
  await assert.rejects(publishNpmPackages(g.options, g.api), /different inputs/); assert.equal(g.uploads.length, 5);
});
test("cancellation during visibility wait releases the controller lock", async (t) => {
  const f = fixture(t), controller = new AbortController(); f.options.signal = controller.signal;
  f.api.version = async () => null; f.api.wait = async (_ms, signal) => { controller.abort(new Error("cancelled by user")); signal.throwIfAborted(); };
  await assert.rejects(publishNpmPackages(f.options, f.api), /cancelled by user/);
  assert.equal(f.uploads.length, 4); assert.equal(fs.existsSync(`${f.options.journal}.lock`), false);
});
test("production registry client only treats HTTP 404 as absence and publishes with OIDC-compatible commands", async () => {
  let status = 404;
  const client = npmClient(async () => ({ status, ok: false }));
  assert.equal(await client.version({ name: "@sagemath/sagejs", version: "0.8.0" }), null);
  for (status of [401, 403, 429, 500]) await assert.rejects(client.version({ name: "x", version: "0.8.0" }), /HTTP/);
  const commands = [];
  const other = npmClient(undefined, async (...args) => { commands.push(args); return { status: 0 }; });
  await other.publish(packages[4], "/fixture/sagejs.tgz", new AbortController().signal);
  assert.equal(commands.length, 1); assert.equal(commands[0][0], "npm");
  assert.deepEqual(commands[0][1], ["publish", "/fixture/sagejs.tgz", "--access", "public", "--tag", "latest", "--ignore-scripts", "--provenance", "--registry=https://registry.npmjs.org/"]);
});
test("publish diagnostics expose bounded error codes, not arbitrary CLI output", async () => {
  const client = npmClient(undefined, async (_cmd, _args, options) => {
    options.onStderr(Buffer.from("npm error code E403\nprivate diagnostic contents\n")); return { status: 1 };
  });
  await assert.rejects(client.publish(packages[0], "/fixture/x", new AbortController().signal), (error) => {
    assert.match(error.message, /code E403/); assert.doesNotMatch(error.message, /private diagnostic/); return true;
  });
});
test("cancelled publication never launches npm and excessive command output is stopped", async () => {
  let commands = 0;
  const client = npmClient(undefined, async (_cmd, _args, options) => {
    commands++; options.onStdout(Buffer.alloc(1024 * 1024 + 1));
    assert.equal(options.signal.aborted, true); return { status: 0 };
  });
  const controller = new AbortController(); controller.abort(new Error("already cancelled"));
  await assert.rejects(client.publish(packages[0], "/fixture/x", controller.signal), /already cancelled/);
  assert.equal(commands, 0);
  await assert.rejects(client.publish(packages[0], "/fixture/x", new AbortController().signal), /output limit/);
  assert.equal(commands, 1);
});
test("stable version ordering is numeric and refuses ambiguous channel values", () => {
  assert.equal(compareVersions("0.10.0", "0.9.0"), 1);
  assert.equal(compareVersions("1.0.0", "1.0.0"), 0);
  for (const value of ["next", "0.8.0-rc.1", "00.8.0"]) assert.throws(() => compareVersions(value, "0.8.0"), /stable numeric/);
});
