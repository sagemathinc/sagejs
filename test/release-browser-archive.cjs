// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), os = require("node:os"), test = require("node:test");
const { createHash, randomBytes } = require("node:crypto"), { gzipSync } = require("node:zlib");
const { authenticateBrowserInputs } = require("../scripts/release/browser-inputs.cjs");
const { authenticateBrowserArchive, archive, distributionSnapshot } = require("../scripts/release/browser-archive.cjs");
const { contentDigestPath } = require("../scripts/numerical-computing/common.cjs");
const { validateArchive, validateBrowserArchive } = require("../scripts/package-qualification/archive-validator.cjs");
const { createBrowserInputs } = require("./helpers/release-browser-inputs.cjs");
const { tarGzip, tar, entry } = require("./helpers/release-tar.cjs");
const candidate = "a".repeat(40), digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
function fixture(t) {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "sagejs-browser-archive-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const browser = createBrowserInputs(root, candidate), filename = path.join(root, archive);
  const selected = authenticateBrowserInputs(root, candidate, browser.gate);
  function replace(bytes) {
    fs.writeFileSync(filename, bytes); fs.writeFileSync(`${filename}.sha256`, `${digest(bytes)}  build/sagejs-wasm.tar.gz\n`);
  }
  return { root, browser, filename, selected, replace };
}
test("GNU and USTAR browser archives match all qualified files without extraction or recompression", async (t) => {
  const f = fixture(t);
  for (const gnu of [true, false]) {
    f.replace(tarGzip([{ name: "dist/", type: "5", gnu }, ...[...f.browser.files].map(([name, data]) => ({ name: `dist/${name}`, data, gnu }))]));
    const before = fs.readdirSync(f.root, { recursive: true });
    const result = await authenticateBrowserArchive(f.root, f.selected);
    assert.equal(result.files, f.browser.files.size);
    assert.equal(result.sha256, digest(fs.readFileSync(f.filename)));
    assert.equal(result.distributionContentSha256, f.selected.contentSha256);
    assert.deepEqual(fs.readdirSync(f.root, { recursive: true }), before);
  }
  t.mock.method(require("node:zlib"), "gzipSync", () => { throw Error("unexpected compression"); });
  t.mock.method(require("node:zlib"), "brotliCompressSync", () => { throw Error("unexpected compression"); });
  await authenticateBrowserArchive(f.root, f.selected);
});
test("a correct download checksum cannot authorize changed, missing or additional browser files", async (t) => {
  const f = fixture(t), files = [...f.browser.files].map(([name, data]) => ({ name: `dist/${name}`, data }));
  for (const bad of [
    files.map((value) => value.name.endsWith("kernel.mjs") ? { ...value, data: "wrong answer" } : value),
    files.map((value) => value.name.endsWith("build-receipt.json") ? { ...value, data: "{}" } : value),
    files.slice(1), [...files, { name: "dist/extra.js", data: "extra" }], [...files, { name: "dist/extra/", type: "5" }],
  ]) {
    f.replace(tarGzip(bad));
    await assert.rejects(authenticateBrowserArchive(f.root, f.selected), /differs|omits|unexpected directory/);
  }
});
test("checksum paths, duplicate checksum records, changed distribution and pre-cancellation fail closed", async (t) => {
  const f = fixture(t), hash = digest(fs.readFileSync(f.filename));
  for (const text of [`${hash}  ../sagejs-wasm.tar.gz\n`, `${hash}  other.tar.gz\n`, `${"0".repeat(64)}  build/sagejs-wasm.tar.gz\n`,
    `${hash}  sagejs-wasm.tar.gz\n${hash}  sagejs-wasm.tar.gz\n`, "x".repeat(257)]) {
    fs.writeFileSync(`${f.filename}.sha256`, text);
    await assert.rejects(authenticateBrowserArchive(f.root, f.selected), /checksum|bounds/);
  }
  fs.writeFileSync(`${f.filename}.sha256`, `${hash}  sagejs-wasm.tar.gz\n`);
  await assert.rejects(authenticateBrowserArchive(f.root, { ...f.selected, contentSha256: "b".repeat(64) }), /changed after qualification/);
  await assert.rejects(authenticateBrowserArchive(f.root, { ...f.selected, directory: "other" }), /qualified browser selection/);
  await assert.rejects(authenticateBrowserArchive(f.root, f.selected, { signal: AbortSignal.abort() }), /abort/i);
});
test("streaming tar hashing covers empty and multi-chunk files but not padding", async (t) => {
  const f = fixture(t), payloads = [Buffer.alloc(0), randomBytes(65537), randomBytes(190007), Buffer.from("last")];
  f.replace(tarGzip(payloads.map((data, i) => ({ name: `dist/data${i}`, data }))));
  const report = await validateBrowserArchive(f.filename);
  assert.deepEqual(report.members.map(({ size, sha256 }) => ({ size, sha256 })), payloads.map((bytes) => ({ size: bytes.length, sha256: digest(bytes) })));
  assert.equal(report.schema, "sagejs.browser-archive-validation/v1");
});
test("streamed distribution identity matches raw qualification identity including nested and empty directories", async (t) => {
  const f = fixture(t), dist = path.join(f.root, f.selected.directory);
  fs.mkdirSync(path.join(dist, "nested", "empty"), { recursive: true });
  fs.writeFileSync(path.join(dist, "nested", "empty-file"), "");
  fs.writeFileSync(path.join(dist, "nested", "big"), randomBytes(1024 * 1024 + 3));
  const snapshot = distributionSnapshot(dist, new AbortController().signal);
  assert.equal(snapshot.contentSha256, contentDigestPath(f.root, f.selected.directory));
  f.selected.contentSha256 = snapshot.contentSha256;
  const files = [...snapshot.files.keys()].map((name) => ({ name, data: fs.readFileSync(path.join(dist, name.slice(5))) }));
  f.replace(tarGzip(files));
  await assert.rejects(authenticateBrowserArchive(f.root, f.selected), /directory layout differs/);
  // Parent directories may be implicit, but a qualified empty directory must
  // be represented, so reconstructing the archive yields the same tree.
  f.replace(tarGzip([...files, { name: "dist/nested/empty/", type: "5" }]));
  assert.equal((await authenticateBrowserArchive(f.root, f.selected)).files, snapshot.files.size);
});
test("browser GNU support does not weaken the npm root or USTAR dialect contract", async (t) => {
  const f = fixture(t);
  f.replace(tarGzip([{ name: "package/x", data: "x" }]));
  await assert.rejects(validateArchive(f.filename), /ustar\/00 dialect/);
  await assert.rejects(validateBrowserArchive(f.filename), /outside dist/);
  f.replace(tarGzip([{ name: "package/x", data: "x", gnu: false }]));
  const npm = await validateArchive(f.filename);
  assert.equal(npm.schema, "sagejs.package-archive-validation/v1");
  assert.deepEqual(npm.members, [{ path: "package/x", type: "file", size: 1 }]);
  f.replace(tarGzip([{ name: "x", prefix: "dist", data: "x", gnu: false }]));
  assert.equal((await validateBrowserArchive(f.filename)).members[0].path, "dist/x");
  f.replace(tarGzip([{ name: "x", prefix: "dist", data: "x" }]));
  await assert.rejects(validateBrowserArchive(f.filename), /outside dist/, "GNU metadata is never interpreted as a USTAR pathname prefix");
});
test("browser tar rejects unsafe layouts, metadata extensions, ambiguous sizes and invalid end markers", async (t) => {
  const f = fixture(t);
  const cases = [
    [{ name: "../outside", data: "x" }], [{ name: "dist/../outside", data: "x" }], [{ name: "/dist/x", data: "x" }],
    [{ name: "dist\\x", data: "x" }], [{ name: "dist/CON", data: "x" }], [{ name: "dist/λ", data: "x" }],
    [{ name: "dist/link", type: "2", link: "/outside" }], [{ name: "dist/link", type: "1", link: "dist/x" }],
    [{ name: "dist/file", type: "0", link: "dist/x" }], [{ name: "dist/device", type: "3" }],
    [{ name: "dist/fifo", type: "6" }], [{ name: "dist/metadata", type: "x" }], [{ name: "dist/longname", type: "L" }],
    [{ name: "dist/sparse", type: "S" }], [{ name: "dist/directory/", type: "5", data: "x" }],
    [{ name: "dist/metadata", mutate: (h) => { h[482] = 1; } }],
    [{ name: "dist/suid", mutate: (h) => { h.write("0004755\0", 100, 8); } }],
    [{ name: "dist/base256", mutate: (h) => { h[124] = 0x80; } }],
    [{ name: "dist/huge", mutate: (h) => { h.write("77777777777\0", 124, 12); } }],
    [{ name: "dist/ambiguous", mutate: (h) => { h.write("000\0" + "0000001\0", 124, 12); } }],
    [{ name: "dist/x" }, { name: "dist/X" }], [{ name: "dist/x" }, { name: "dist/x/child" }],
    [{ name: "dist/x/child" }, { name: "dist/x" }], [{ name: "dist" }],
    [entry({ name: "dist/x" }), Buffer.alloc(512), entry({ name: "dist/y" })],
  ];
  for (const entries of cases) { f.replace(tarGzip(entries)); await assert.rejects(validateBrowserArchive(f.filename)); }
  const badChecksum = entry({ name: "dist/x" }); badChecksum[0] ^= 1;
  f.replace(tarGzip([badChecksum])); await assert.rejects(validateBrowserArchive(f.filename), /checksum/);
  for (const raw of [tar([{ name: "dist/x", data: "hello" }]).subarray(0, 514), entry({ name: "dist/x" }),
    Buffer.concat([tar([{ name: "dist/x" }]), entry({ name: "dist/y" })])]) {
    f.replace(gzipSync(raw)); await assert.rejects(validateBrowserArchive(f.filename), /truncated|end/);
  }
});
test("tar reader reports source and compression errors and supports mid-stream cancellation", async (t) => {
  const f = fixture(t);
  await assert.rejects(validateBrowserArchive(`${f.filename}.missing`), /ENOENT/);
  f.replace(Buffer.from("not gzip")); await assert.rejects(validateBrowserArchive(f.filename), /header|gzip/);
  f.replace(tarGzip([{ name: "dist/big", data: randomBytes(1024 * 1024) }]));
  const controller = new AbortController(), read = validateBrowserArchive(f.filename, { signal: controller.signal });
  setImmediate(() => controller.abort()); await assert.rejects(read, /abort/i);
  // A subsequent read is independent; cancellation did not damage the input.
  assert.equal((await validateBrowserArchive(f.filename)).members.length, 1);
});
