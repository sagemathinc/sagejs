// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { createHash } = require("node:crypto");
const { zipSync } = require("fflate");
const { inspectOrExtract, prepareArtifact, layout, expectedTree, fileView, limits } = require("../scripts/release/extract-artifact.cjs");
const { identity, roles } = require("../scripts/release/artifact-set.cjs");
const checksum = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

test("transport layouts match the actual workflow upload roots", () => {
  const yaml = require("yaml"), root = path.resolve(__dirname, "..");
  const native = yaml.parse(fs.readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8"));
  const browser = yaml.parse(fs.readFileSync(path.join(root, ".github/workflows/wasm-release.yml"), "utf8"));
  for (const [kind, names] of Object.entries(roles)) for (const name of names) {
    const workflow = kind === "native" ? native : browser;
    const uploads = Object.values(workflow.jobs).flatMap((job) => job.steps ?? []).filter((step) =>
      step.uses?.startsWith("actions/upload-artifact@") && step.with?.name?.replace("${{ matrix.replica }}", "a") === name);
    assert.equal(uploads.length, 1, name);
    const paths = uploads[0].with.path.trim().split(/\r?\n/).map((value) => value.replaceAll("${{ matrix.replica }}", "a"));
    const policy = layout(`${kind}/${name}`);
    if (name === "numerical-release-gate") {
      assert.deepEqual(paths, ["build/numerical-qualification/gate"]);
      continue; // The assembler owns this directory's exact generated members.
    }
    const parts = paths.map((value) => value.split("/"));
    let depth = 0;
    while (parts.every((value) => depth < value.length - 1 && value[depth] === parts[0][depth])) depth++;
    const projected = parts.map((value) => value.slice(depth).join("/"));
    const expected = [...policy.prefixes.map((value) => value.slice(0, -1)),
      ...policy.required.filter((value) => !policy.prefixes.some((prefix) => value.startsWith(prefix)))];
    assert.deepEqual(projected.sort(), expected.sort(), name);
  }
});

function fixture(t, key = "native/sagejs-linux-x64", changed = (files) => files) {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "sagejs-extract-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const policy = layout(key), files = Object.fromEntries(policy.required.map((name) => [name, Buffer.from(`fixture ${name}`)]));
  for (const prefix of policy.prefixes) if (!Object.keys(files).some((name) => name.startsWith(prefix))) files[`${prefix}fixture.json`] = Buffer.from("{}");
  const bytes = Buffer.from(zipSync(changed(files), { level: 6 }));
  const filename = path.join(root, "artifact.zip"), directory = path.join(root, "expanded");
  fs.writeFileSync(filename, bytes); fs.mkdirSync(directory);
  const artifacts = [];
  for (const [kind, names] of Object.entries(roles)) for (const name of names) artifacts.push({ kind, name, key: `${kind}/${name}`,
    id: artifacts.length + 1, archiveDigest: checksum(bytes), sizeInBytes: bytes.length, createdAt: "2026-09-07T00:00:00Z" });
  const payload = { schema: "sagejs.release-artifact-set/v1", repository: "sagemathinc/sagejs", repositoryId: 123,
    sourceRevision: "a".repeat(40), ref: "candidate", event: "workflow_dispatch", purpose: "qualification",
    qualification: { native: { runId: 10, runAttempt: 1, jobId: 11 }, browser: { runId: 20, runAttempt: 1, jobId: 21 } }, artifacts };
  return { manifest: { ...payload, manifestDigest: identity(payload) }, expectedDigest: identity(payload), key, filename, directory, files, bytes, root };
}

test("all nine authenticated transport layouts stream to exact regular-file inventories", async (t) => {
  for (const [kind, names] of Object.entries(roles)) for (const name of names) {
    const f = fixture(t, `${kind}/${name}`), result = await inspectOrExtract({ ...f, write: true });
    assert.deepEqual(result.files.map((file) => file.path), Object.keys(f.files).sort((a, b) => a.localeCompare(b)));
    assert.deepEqual(await inspectOrExtract(f), result);
    for (const file of result.files) assert.deepEqual(fs.readFileSync(path.join(f.directory, file.path)), f.files[file.path]);
  }
});

test("recoverable expansion detects corruption and replaces only the affected directory", async (t) => {
  const f = fixture(t), first = await prepareArtifact(f);
  assert.equal(first.reused, false);
  assert.equal((await prepareArtifact(f)).reused, true);
  fs.writeFileSync(path.join(first.directory, "install.sh"), "changed");
  const next = await prepareArtifact(f);
  assert.equal(next.reused, false);
  assert.deepEqual(fs.readFileSync(path.join(next.directory, "install.sh")), f.files["install.sh"]);
});

test("malformed, missing, foreign, traversal and case-colliding members cannot be installed", async (t) => {
  const changes = [
    (files) => { delete files["install.sh"]; return files; },
    (files) => ({ ...files, "scripts/publish.cjs": Buffer.from("untrusted") }),
    (files) => ({ ...files, "../outside": Buffer.from("x") }),
    (files) => ({ ...files, "INSTALL.SH": Buffer.from("x") }),
    (files) => ({ ...files, "npm/CON": Buffer.from("x") }),
  ];
  for (const change of changes) {
    const f = fixture(t, undefined, change);
    await assert.rejects(inspectOrExtract({ ...f, write: true }));
    assert.deepEqual(fs.readdirSync(f.directory), []);
  }
  const f = fixture(t);
  fs.writeFileSync(f.filename, Buffer.alloc(f.bytes.length));
  await assert.rejects(inspectOrExtract({ ...f, write: true }), /digest/);
  assert.deepEqual(fs.readdirSync(f.directory), []);
});

test("symlink and special-file metadata fail before extraction", async (t) => {
  const f = fixture(t), bad = Buffer.from(f.bytes), central = bad.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  bad.writeUInt32LE((0o120777 << 16) >>> 0, central + 38);
  fs.writeFileSync(f.filename, bad);
  for (const record of f.manifest.artifacts) record.archiveDigest = checksum(bad);
  const { manifestDigest, ...payload } = f.manifest;
  f.manifest.manifestDigest = f.expectedDigest = identity(payload);
  await assert.rejects(inspectOrExtract({ ...f, write: true }), /link or special/);
  assert.deepEqual(fs.readdirSync(f.directory), []);
});

test("local/central disagreement and CRC mismatch are rejected even with a matching container pin", async (t) => {
  for (const mutate of [
    (bytes) => { bytes[30] ^= 1; },
    (bytes) => { const offset = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])); bytes.writeUInt32LE(123, offset + 16); },
  ]) {
    const f = fixture(t), changed = Buffer.from(f.bytes); mutate(changed); fs.writeFileSync(f.filename, changed);
    for (const record of f.manifest.artifacts) record.archiveDigest = checksum(changed);
    const { manifestDigest, ...payload } = f.manifest; f.manifest.manifestDigest = f.expectedDigest = identity(payload);
    await assert.rejects(inspectOrExtract({ ...f, write: true }), /disagree|CRC/);
  }
});

test("output extras, shared hardlinks and ancestry collisions cannot pass revalidation", async (t) => {
  const f = fixture(t); await inspectOrExtract({ ...f, write: true });
  fs.writeFileSync(path.join(f.directory, "extra"), "x");
  await assert.rejects(inspectOrExtract(f), /unexpected/);
  fs.unlinkSync(path.join(f.directory, "extra"));
  fs.linkSync(path.join(f.directory, "install.sh"), path.join(f.root, "shared"));
  await assert.rejects(inspectOrExtract(f), /linked/);
  const policy = { required: [], prefixes: ["a/", "A/"] };
  assert.throws(() => expectedTree([{ name: "a/x" }, { name: "A/y" }], policy), /case-colliding/);
  assert.throws(() => expectedTree([{ name: "a", directory: false }, { name: "a/x" }], { required: ["a"], prefixes: ["a/"] }), /collision/);
});

test("metadata reader is bounded and cancellation does not certify partial output", async (t) => {
  const f = fixture(t), fd = fs.openSync(f.filename, "r");
  try {
    const view = fileView(fd, f.bytes.length);
    assert.equal(view.readUInt32LE(0), 0x04034b50);
    assert.throws(() => view.subarray(0, 131073), /bounds/);
    assert.throws(() => view.readUInt32LE(-1), /bounds/);
  } finally { fs.closeSync(fd); }
  const controller = new AbortController(); controller.abort();
  await assert.rejects(inspectOrExtract({ ...f, write: true, signal: controller.signal }), /abort/i);
  assert.deepEqual(fs.readdirSync(f.directory), []);
  assert.equal(limits.expanded_bytes, 4 * 1024 ** 3);
});
