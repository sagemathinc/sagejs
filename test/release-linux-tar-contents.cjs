// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { Readable } = require("node:stream"), { createHash } = require("node:crypto"), { execFileSync, spawnSync } = require("node:child_process");
const { tar } = require("./helpers/release-tar.cjs");
const { validateLinuxTarStream } = require("../scripts/package-qualification/archive-validator.cjs");
const { inspectLinuxTarXz, requireXz, decoderEnvironment } = require("../scripts/release/linux-tar-contents.cjs");
const platform = "linux-x64", prefix = `sagejs-${platform}/`;
function fixture(t, bytes) {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "sagejs-linux-tar-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const filename = path.join(root, "binary input with spaces.tar.xz");
  fs.writeFileSync(filename, execFileSync("xz", ["--compress", "--stdout", "--threads=1", "-0"], { input: bytes, timeout: 5000,
    maxBuffer: 1024 * 1024, env: decoderEnvironment(), windowsHide: true, stdio: ["pipe", "pipe", "pipe"] }));
  return filename;
}
test("Linux GNU/USTAR inspection hashes exact payloads across stream boundaries and retains mode", async () => {
  for (const gnu of [true, false]) {
    const bytes = tar([{ name: prefix, type: "5", gnu }, { name: `${prefix}sagejs`, data: "binary\0payload", gnu,
      mutate: (header) => header.write("0000755\0", 100, 8) }]);
    const chunks = []; for (let start = 0; start < bytes.length; start += 7) chunks.push(bytes.subarray(start, start + 7));
    const result = await validateLinuxTarStream(Readable.from(chunks), platform);
    assert.equal(result.members[1].sha256, createHash("sha256").update("binary\0payload").digest("hex"));
    assert.equal(result.members[1].mode, 0o755);
  }
});
test("Linux tar rejects links, extensions, unsafe modes, duplicate paths, wrong roots and overlarge payloads", async () => {
  const ordinary = { name: `${prefix}sagejs`, data: "payload" };
  for (const entries of [
    [{ ...ordinary, type: "2", link: "elsewhere" }], [{ ...ordinary, type: "1", link: "elsewhere" }],
    [{ ...ordinary, type: "L" }], [{ ...ordinary, type: "x" }],
    [{ ...ordinary, mutate: (header) => header.write("0004755\0", 100, 8) }],
    [ordinary, ordinary], [{ ...ordinary, name: "sagejs-linux-arm64/sagejs" }],
    [{ ...ordinary, mutate: (header) => { header[124] = 0x80; } }],
    [{ ...ordinary, mutate: (header) => header.write(`${(2 ** 31 + 1).toString(8)}\0`, 124, 12) }],
  ]) await assert.rejects(validateLinuxTarStream(Readable.from([tar(entries)]), platform), /forbidden|duplicate|outside|base-256|expansion limit/);
  const bytes = tar([ordinary]);
  await assert.rejects(validateLinuxTarStream(Readable.from([bytes.subarray(0, 700)]), platform), /truncated/);
  await assert.rejects(validateLinuxTarStream(Readable.from([Buffer.concat([bytes, bytes])]), platform), /end marker/);
});
test("real XZ decoding is read-only and verifies the decoder exit even after receiving a complete tar", async (t) => {
  const filename = fixture(t, tar([{ name: `${prefix}sagejs`, data: "payload" }])), original = fs.readFileSync(filename);
  assert.match(requireXz().version, /^\d+\.\d+\.\d+$/);
  assert.equal((await inspectLinuxTarXz(filename, platform)).members[0].size, 7);
  assert.ok(fs.readFileSync(filename).equals(original));
  const corrupt = Buffer.from(original); corrupt[corrupt.length - 5] ^= 1;
  fs.writeFileSync(filename, corrupt);
  await assert.rejects(inspectLinuxTarXz(filename, platform), /XZ decoding|truncated|end blocks/);
  fs.writeFileSync(filename, original.subarray(0, original.length - 12));
  await assert.rejects(inspectLinuxTarXz(filename, platform), /XZ decoding|truncated|end blocks/);
});
test("caller cancellation closes the XZ subprocess and cannot return a content receipt", async (t) => {
  const filename = fixture(t, tar([{ name: `${prefix}sagejs`, data: Buffer.alloc(1024 * 1024, 42) }]));
  await assert.rejects(inspectLinuxTarXz(filename, platform, { signal: AbortSignal.abort() }), /abort/i);
  await assert.rejects(inspectLinuxTarXz(filename, platform, { signal: AbortSignal.timeout(1) }), /abort|timeout/i);
  // The decoder has closed before rejection; subsequent inspection still works.
  assert.equal((await inspectLinuxTarXz(filename, platform)).members[0].size, 1024 * 1024);
});
test("ambient XZ options cannot disable integrity checking or decoder memory limits", async (t) => {
  const filename = fixture(t, tar([{ name: `${prefix}sagejs`, data: "payload" }]));
  const before = { XZ_OPT: process.env.XZ_OPT, XZ_DEFAULTS: process.env.XZ_DEFAULTS };
  try {
    process.env.XZ_OPT = "--ignore-check --memlimit-decompress=3GiB";
    process.env.XZ_DEFAULTS = "--compress";
    assert.equal(decoderEnvironment().XZ_OPT, undefined); assert.equal(decoderEnvironment().XZ_DEFAULTS, undefined);
    assert.equal((await inspectLinuxTarXz(filename, platform)).members[0].size, 7);
  } finally {
    for (const [name, value] of Object.entries(before)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  }
});
test("missing XZ is diagnosed before transport work and Windows CI pins its controller-only tool", () => {
  const helper = require.resolve("../scripts/release/linux-tar-contents.cjs");
  const result = spawnSync(process.execPath, ["-e", `require(${JSON.stringify(helper)}).requireXz()`], { env: { ...process.env, PATH: "" }, encoding: "utf8", timeout: 10000 });
  assert.notEqual(result.status, 0); assert.match(result.stderr, /controller requires maintained XZ Utils/);
  const source = fs.readFileSync(require.resolve("../scripts/release/prepare-publication.cjs"), "utf8");
  assert.ok(source.indexOf('.requireXz()') < source.indexOf('await prepareHandoff('));
  const { parseWorkflow } = require("../scripts/release/workflow-inventory.cjs");
  const workflow = parseWorkflow(fs.readFileSync(path.join(__dirname, "../.github/workflows/ci.yml"), "utf8"), "ci.yml");
  const steps = workflow.jobs["windows-x64"].steps, setup = steps.findIndex((step) => step.name === "Provision native XZ for release transport tests");
  assert.ok(setup >= 0 && setup < steps.findIndex((step) => step.name === "Run portable tests"));
  assert.ok(setup < steps.findIndex((step) => step.name === "Bootstrap the compiler and native mathematics stack"));
  assert.match(steps[setup].run, /xz-5\.8\.3-windows\.zip/);
  assert.match(steps[setup].run, /8d0048ee51177b11ef1613959c2a268c951f4e7f6fb3706e681e00e34bb6d5e3/);
  assert.ok(steps[setup].run.indexOf('Get-FileHash') < steps[setup].run.indexOf('Expand-Archive'));
});
