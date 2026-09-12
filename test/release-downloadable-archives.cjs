// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path"), { createHash } = require("node:crypto");
const { zipSync, Zip, ZipPassThrough } = require("fflate");
const { authenticateDownloadableArchives } = require("../scripts/release/downloadable-archives.cjs");
const { inspectZipContents } = require("../scripts/release/zip-contents.cjs");
const { platformPackage } = require("./helpers/release-platform-package.cjs");
const { sourceDocumentation, archiveFiles, encodeArchive } = require("./helpers/release-downloadable-archive.cjs");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
function fixture(t) {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "sagejs-release-zip-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "release"));
  const docs = sourceDocumentation(root), packages = [], entries = new Map();
  const file = (platform) => path.join(root, `release/sagejs-${platform}.${platform.startsWith("linux") ? "tar.xz" : "zip"}`);
  function write(platform, bytes) { fs.writeFileSync(file(platform), bytes); fs.writeFileSync(`${file(platform)}.sha256`, `${hash(bytes)}  ${path.basename(file(platform))}\r\n`); }
  for (const platform of ["linux-x64", "linux-arm64", "macos-arm64", "windows-x64"]) {
    const product = platformPackage(platform), extension = platform === "windows-x64" ? ".exe" : "";
    packages.push({ platform, archive: `release/npm/sagejs-${platform}.tgz`,
      executables: [["sagejs", product.sea], ["sagepython", product.python]].map(([name, data]) => ({ name, member: `package/bin/${name}${extension}`, bytes: data.length, sha256: hash(data) })) });
    const files = archiveFiles(platform, product, docs); entries.set(platform, files); write(platform, encodeArchive(platform, files));
  }
  return { root, packages, entries, file, write, check: (options) => authenticateDownloadableArchives(root, packages, options) };
}
test("all four downloadable platform archives contain the qualified binaries and exact source documentation", async (t) => {
  const f = fixture(t), result = await f.check();
  assert.deepEqual(result.map((item) => item.platform), ["linux-x64", "linux-arm64", "macos-arm64", "windows-x64"]);
  assert.ok(result.every((item) => item.files.length === 6));
  assert.deepEqual(await f.check(), result);
  assert.equal(fs.readdirSync(path.join(f.root, "release")).length, 8, "no executable extraction");
});
test("a valid checksum cannot hide substituted binaries, missing files, changed licenses or extra payloads", async (t) => {
  for (const platform of ["linux-x64", "linux-arm64", "macos-arm64", "windows-x64"]) {
    for (const alter of [
      (files, key) => { files[key][0] = Buffer.from("wrong executable"); },
      (files, key) => { delete files[key]; },
      (files) => { files[Object.keys(files).find((key) => key.includes("notice.txt"))][0] = Buffer.from("wrong license"); },
      (files) => { files["unexpected-code.js"] = Buffer.from("code"); },
    ]) {
      const f = fixture(t), files = f.entries.get(platform), key = Object.keys(files)[1];
      alter(files, key); f.write(platform, encodeArchive(platform, files));
      await assert.rejects(f.check(), /differs from qualified|omits qualified|missing required|unexpected file|outside sagejs/);
    }
  }
});
test("Linux/macOS execute permissions and special Unix bits are validated, not normalized away", async (t) => {
  for (const platform of ["linux-x64", "linux-arm64", "macos-arm64"]) for (const mode of [0o100644, 0o100777, 0o100111, 0o104755]) {
    const f = fixture(t), files = f.entries.get(platform); files[Object.keys(files)[0]][1].attrs = (mode << 16) >>> 0;
    f.write(platform, encodeArchive(platform, files));
    await assert.rejects(f.check(), /not executable|special permission|link or special/);
  }
});
test("noncanonical checksums, changed selections and cancellation cannot authorize ZIPs", async (t) => {
  const f = fixture(t), filename = `${f.file("windows-x64")}.sha256`, valid = fs.readFileSync(filename, "utf8");
  for (const changed of [valid.replace("sagejs-windows-x64.zip", "../other.zip"), valid.replace(/^./, valid[0] === "0" ? "1" : "0"), valid + valid]) {
    fs.writeFileSync(filename, changed); await assert.rejects(f.check(), /checksum/);
  }
  fs.writeFileSync(filename, valid);
  await assert.rejects(f.check({ signal: AbortSignal.abort() }), /abort/i);
  await assert.rejects(authenticateDownloadableArchives(f.root, f.packages.slice(1)), /selection/);
  f.packages[2].executables[0].member = "other"; await assert.rejects(f.check(), /identity is malformed/);
});
test("ZIP reader supports explicit directories and streaming descriptors with bounded content checking", async (t) => {
  const f = fixture(t), filename = f.file("windows-x64");
  const files = { "dir/": [Buffer.alloc(0), { os: 3, attrs: (0o40755 << 16) >>> 0 }], "dir/entry": Buffer.from("payload") };
  fs.writeFileSync(filename, zipSync(files));
  const result = await inspectZipContents(filename, ["dir/entry"]); assert.equal(result.files[0].sha256, hash("payload"));
  const chunks = [], zip = new Zip((error, bytes) => { if (error) throw error; chunks.push(Buffer.from(bytes)); });
  const member = new ZipPassThrough("entry"); zip.add(member); member.push(Buffer.from("streamed payload"), true); zip.end();
  const bytes = Buffer.concat(chunks); fs.writeFileSync(filename, bytes);
  assert.equal((await inspectZipContents(filename, ["entry"])).files[0].sha256, hash("streamed payload"));
  const descriptor = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x07, 0x08])); assert.ok(descriptor > 0);
  bytes[descriptor + 4] ^= 1; fs.writeFileSync(filename, bytes);
  await assert.rejects(inspectZipContents(filename, ["entry"]), /descriptor differs/);
});
test("ZIP reader rejects local/central disagreement, corrupted payloads and structural hazards", async (t) => {
  const f = fixture(t), filename = f.file("windows-x64");
  const good = Buffer.from(zipSync({ entry: Buffer.from("payload") }, { level: 0 }));
  for (const mutate of [
    (b) => { b[14] ^= 1; },
    (b) => { b[18] ^= 1; },
    (b) => { b[35] ^= 1; },
    (b) => b.subarray(0, b.length - 5),
  ]) {
    const bytes = Buffer.from(good), changed = mutate(bytes) || bytes; fs.writeFileSync(filename, changed);
    await assert.rejects(inspectZipContents(filename, ["entry"]), /differs|CRC|end record|topology/);
  }
  for (const files of [{ "../entry": Buffer.from("x") }, { entry: Buffer.from("x"), ENTRY: Buffer.from("x") },
    { "dir/entry": Buffer.from("x"), "DIR/other": Buffer.from("y") }]) {
    fs.writeFileSync(filename, zipSync(files));
    await assert.rejects(inspectZipContents(filename, Object.keys(files)), /canonical|nonportable|case-colliding|duplicate/);
  }
});

test("alternate path, ZIP64 and unknown ZIP extra fields require explicit review", async (t) => {
  const f = fixture(t), filename = f.file("windows-x64");
  for (const kind of [0x7075, 0x0001, 0x756e, 0x9999]) {
    fs.writeFileSync(filename, zipSync({ entry: [Buffer.from("x"), { extra: { [kind]: Buffer.alloc(12) } }] }));
    await assert.rejects(inspectZipContents(filename, ["entry"]), /ZIP extra field/);
  }
});
