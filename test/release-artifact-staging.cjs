// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { spawn } = require("node:child_process");
const { createHash } = require("node:crypto");
const { stageArtifactSet, downloadGithubArchive, requireDownloadSpace, argumentsFor } = require("../scripts/release/stage-artifacts.cjs");
const { roles, identity } = require("../scripts/release/artifact-set.cjs");
const bytes = Buffer.from("exact ZIP fixture bytes");
const archiveDigest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-artifact-stage-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  let id = 100;
  const artifacts = Object.entries(roles).flatMap(([kind, names]) => names.map((name) => ({
    kind, name, key: `${kind}/${name}`, id: id++, archiveDigest, sizeInBytes: bytes.length, createdAt: "2026-09-07T00:00:00Z",
  })));
  const payload = { schema: "sagejs.release-artifact-set/v1", repository: "sagemathinc/sagejs", repositoryId: 123,
    sourceRevision: "a".repeat(40), ref: "candidate", event: "workflow_dispatch", purpose: "qualification",
    qualification: { native: { runId: 10, runAttempt: 1, jobId: 11 }, browser: { runId: 20, runAttempt: 2, jobId: 21 } }, artifacts };
  const manifest = { ...payload, manifestDigest: identity(payload) };
  const downloads = [], checks = [];
  return { directory, manifest, expectedDigest: manifest.manifestDigest, downloads, checks,
    verifyRemote: async (_manifest, _digest, key) => { checks.push(key); },
    download: async (record, filename) => { downloads.push(record.key); fs.writeFileSync(filename, bytes); },
  };
}

test("a failure after two downloads preserves them and retry needs no rebuild or replacement bytes", async (t) => {
  const f = fixture(t), download = f.download;
  f.download = async (record, filename, options) => {
    await download(record, filename, options);
    if (f.downloads.length === 3) { fs.writeFileSync(filename, "partial"); throw new Error("injected disconnection"); }
  };
  await assert.rejects(stageArtifactSet(f), /disconnection/);
  f.download = download;
  const resumed = await stageArtifactSet(f);
  assert.deepEqual(resumed.artifacts.map((item) => item.reused), [true, true, false, false, false, false, false, false, false]);
  assert.equal(f.downloads.length, 10);
  assert.equal(f.checks.length, 10);
  const offline = await stageArtifactSet({ ...f,
    verifyRemote: () => { throw new Error("expired or offline"); },
    download: () => { throw new Error("must not download or compile"); },
  });
  assert.ok(offline.artifacts.every((item) => item.reused));
  assert.equal(offline.status, "archives-staged");
});

test("validated staged bytes survive a controller failure before installation", async (t) => {
  const f = fixture(t);
  let injected = false;
  await assert.rejects(stageArtifactSet({ ...f, checkpoint: ({ phase }) => {
    if (!injected && phase === "ready") { injected = true; throw new Error("controller stopped"); }
  } }), /controller stopped/);
  const result = await stageArtifactSet(f);
  assert.equal(result.artifacts.length, 9);
  assert.equal(f.downloads.length, 9, "already validated pending bytes are installed without downloading again");
});

test("cache corruption is preserved and replaced without redownloading good peers", async (t) => {
  const f = fixture(t), first = await stageArtifactSet(f);
  fs.writeFileSync(first.artifacts[2].filename, Buffer.alloc(bytes.length));
  const restored = await stageArtifactSet(f);
  assert.equal(f.downloads.length, 10);
  assert.equal(restored.artifacts.filter((item) => !item.reused).length, 1);
  const store = path.dirname(path.dirname(restored.artifacts[2].filename));
  const transactions = path.join(store, `.transactions-artifact-${restored.artifacts[2].id}`);
  assert.ok(fs.readdirSync(transactions).some((name) => fs.existsSync(path.join(transactions, name, "previous", "artifact.zip"))), "corrupt copy retained for inspection");
});

test("digest mismatch, invalid remote pins and space failure cannot install an archive", async (t) => {
  const f = fixture(t);
  await assert.rejects(stageArtifactSet({ ...f, download: async (_record, filename) => fs.writeFileSync(filename, Buffer.alloc(bytes.length)) }), /verification/);
  assert.equal(fs.existsSync(path.join(f.directory, `set-${f.expectedDigest.slice(7)}`, "artifact-100")), false);
  await assert.rejects(stageArtifactSet({ ...f, verifyRemote: async () => { throw new Error("pin unavailable"); } }), /pin unavailable/);
  await assert.rejects(stageArtifactSet({ ...f, checkSpace: () => { throw new Error("ENOSPC preflight"); } }), /ENOSPC/);
  assert.equal(f.downloads.length, 0);
  await assert.rejects(stageArtifactSet({ ...f, expectedDigest: undefined }), /authenticated/);
});

test("abort stops new downloads and cannot claim a complete staged set", async (t) => {
  const f = fixture(t), controller = new AbortController();
  await assert.rejects(stageArtifactSet({ ...f, signal: controller.signal, download: async (record, filename, { signal }) => {
    await f.download(record, filename); controller.abort(); signal.throwIfAborted();
  } }), /abort/i);
  assert.equal(f.downloads.length, 1);
  const resumed = await stageArtifactSet(f);
  assert.equal(resumed.artifacts.length, 9);
  assert.equal(f.downloads.length, 9, "fully written aborted download can be verified and recovered, not treated as a prior pass");
});

test("concurrent staging is rejected by the existing process lease", async (t) => {
  const f = fixture(t);
  let enter, release;
  const entered = new Promise((resolve) => { enter = resolve; });
  const held = new Promise((resolve) => { release = resolve; });
  const running = stageArtifactSet({ ...f, download: async (record, filename) => { enter(); await held; await f.download(record, filename); } });
  await entered;
  try { await assert.rejects(stageArtifactSet(f), /already active/); }
  finally { release(); await running; }
});

test("cancellation during the last installation cannot report a complete set", async (t) => {
  const f = fixture(t), controller = new AbortController();
  await assert.rejects(stageArtifactSet({ ...f, signal: controller.signal, checkpoint: ({ key, phase }) => {
    if (key === f.manifest.artifacts.at(-1).key && phase === "complete") controller.abort();
  } }), /abort/i);
  const resumed = await stageArtifactSet(f);
  assert.ok(resumed.artifacts.every((item) => item.reused));
  assert.equal(f.downloads.length, 9);
});

test("download space policy covers exact bytes plus bounded headroom, including Windows inode absence", () => {
  const good = { bavail: 65n * 1024n ** 2n, bsize: 1n, files: 0n, ffree: 0n };
  requireDownloadSpace("fixture", 1024, () => good);
  assert.throws(() => requireDownloadSpace("fixture", 2 * 1024 ** 2, () => good), /scratch space/);
  assert.throws(() => requireDownloadSpace("fixture", 1, () => ({ ...good, files: 100n, ffree: 1n })), /inodes/);
});

test("the real streaming downloader enforces byte bounds, deadlines and cancellation without printing child diagnostics", async (t) => {
  const f = fixture(t), record = f.manifest.artifacts[0];
  let lastChild;
  function source(script) {
    return (command, args, options) => {
      assert.equal(command, "gh");
      assert.deepEqual(args, ["api", "--hostname", "github.com", "repos/sagemathinc/sagejs/actions/artifacts/100/zip"]);
      assert.equal(options.shell, false);
      lastChild = spawn(process.execPath, ["-e", script], options);
      return lastChild;
    };
  }
  const file = (name) => path.join(f.directory, name);
  await downloadGithubArchive(record, file("good.zip"), { spawnProcess: source(`process.stdout.write(${JSON.stringify(bytes.toString())})`) });
  assert.deepEqual(fs.readFileSync(file("good.zip")), bytes);
  for (const [name, script] of [["short", "process.stdout.write('x')"], ["large", "process.stdout.write(Buffer.alloc(10000))"],
    ["failed", "process.stderr.write('private credential diagnostic');process.exit(1)"]]) {
    await assert.rejects(downloadGithubArchive(record, file(`${name}.zip`), { spawnProcess: source(script) }), /download failed/);
    assert.ok(fs.statSync(file(`${name}.zip`)).size <= record.sizeInBytes);
  }
  await assert.rejects(downloadGithubArchive(record, file("timeout.zip"), {
    spawnProcess: source("setInterval(()=>{},1000)"), timeoutMs: 50,
  }), /timed out/);
  assert.ok(lastChild.exitCode !== null || lastChild.signalCode !== null);
  const controller = new AbortController();
  const running = downloadGithubArchive(record, file("abort.zip"), { signal: controller.signal, spawnProcess: source("setInterval(()=>{},1000)") });
  controller.abort();
  await assert.rejects(running, /cancelled/);
  assert.ok(lastChild.exitCode !== null || lastChild.signalCode !== null);
});

test("staging CLI requires explicit trusted inputs and a dedicated directory", () => {
  for (const args of [[], ["--manifest", "x"], ["--manifest", "x", "--manifest", "y", "--directory", "z"]]) assert.throws(() => argumentsFor(args));
  assert.equal(argumentsFor(["--manifest", "x", "--expected-digest", archiveDigest, "--directory", "z"])["--directory"], "z");
});
