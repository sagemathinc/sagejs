// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { createHash } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { createMacosInstallerRequest, validateRequest, verifyMacosInstaller, assertInstallerSignature,
  inspectPayload, packageInfoPredicate, command } = require("../scripts/release/macos-installer.cjs");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const team = "BVF94G2MB4";
const signature = `Package "product.pkg":
   Status: signed by a developer certificate issued by Apple for distribution
   Signed with a trusted timestamp on: 2026-09-01 21:57:32 +0000
   Certificate Chain:
    1. Developer ID Installer: William STEIN (${team})
`;
const xml = `<?xml version="1.0" encoding="utf-8"?>
<pkg-info overwrite-permissions="true" relocatable="false" identifier="org.sagemath.sagejs.cli" postinstall-action="none" version="0.8.0" format-version="2" generator-version="test" install-location="/" auth="root">
<payload numberOfFiles="6" installKBytes="1"/><bundle-version/><upgrade-bundle/><update-bundle/><atomic-update-bundle/><strict-identifier/><relocate/>
</pkg-info>`;
function fixture(t) {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "sagejs-installer-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "release"));
  fs.writeFileSync(path.join(root, "package.json"), '{"version":"0.8.0"}');
  const relative = "release/sagejs-macos-arm64.pkg", filename = path.join(root, relative), bytes = Buffer.from("selected signed package fixture");
  fs.writeFileSync(filename, bytes); fs.writeFileSync(`${filename}.sha256`, `${hash(bytes)}  ${path.basename(filename)}\n`);
  const files = [{ target: relative, size: bytes.length, sha256: hash(bytes) }];
  const contents = { sagejs: Buffer.from("qualified sagejs"), sagepython: Buffer.from("qualified sagepython") };
  const packages = [{ platform: "macos-arm64", executables: Object.entries(contents).map(([name, bytes]) => ({ name, member: `package/bin/${name}`, bytes: bytes.length, sha256: hash(bytes) })) }];
  const identity = { sourceRevision: "a".repeat(40), manifestDigest: `sha256:${"b".repeat(64)}` };
  const request = createMacosInstallerRequest(root, identity, packages, files);
  const calls = [], directories = [".", "./usr", "./usr/local", "./usr/local/bin"];
  const bom = [...directories.map((name) => `${name}\t40755\t`), ...Object.entries(contents).map(([name, bytes]) => `./usr/local/bin/${name}\t100755\t${bytes.length}`)].join("\n") + "\n";
  function payload(directory) {
    fs.mkdirSync(path.join(directory, "usr/local/bin"), { recursive: true });
    for (const name of ["", "usr", "usr/local", "usr/local/bin"]) fs.chmodSync(path.join(directory, name), 0o755);
    for (const [name, bytes] of Object.entries(contents)) { fs.writeFileSync(path.join(directory, "usr/local/bin", name), bytes); fs.chmodSync(path.join(directory, "usr/local/bin", name), 0o755); }
  }
  async function run(program, args, options) {
    options.signal.throwIfAborted(); calls.push({ program, args });
    let stdout = "";
    if (args[0] === "--check-signature") stdout = signature;
    if (program.endsWith("xar")) stdout = "Bom\nPayload\nPackageInfo\n";
    if (args[0] === "--payload-files") stdout = [...directories, ...Object.keys(contents).map((name) => `./usr/local/bin/${name}`)].join("\n") + "\n";
    if (["--expand", "--expand-full"].includes(args[0])) {
      const directory = args[2]; fs.mkdirSync(directory);
      fs.writeFileSync(path.join(directory, "Bom"), bom); fs.writeFileSync(path.join(directory, "PackageInfo"), xml);
      if (args[0] === "--expand-full") payload(path.join(directory, "Payload"));
      else fs.writeFileSync(path.join(directory, "Payload"), "compressed fixture");
    }
    if (program.endsWith("lsbom")) stdout = bom;
    if (program.endsWith("xmllint")) stdout = "true\n";
    if (program.endsWith("sw_vers")) stdout = "26.4\n";
    return { stdout, stderr: "" };
  }
  const options = { request, filename, expectedTeamId: team, scratchParent: root };
  return { root, filename, files, packages, identity, request, calls, run, options, contents, payload,
    check: (overrides = {}) => verifyMacosInstaller(options, { platform: "darwin", command: run, ...overrides }),
    assertClean: () => assert.deepEqual(fs.readdirSync(root).sort(), ["package.json", "release"]) };
}
test("preparation emits an exact pending inspection request, not signature approval", (t) => {
  const f = fixture(t);
  assert.equal(f.request.status, "pending-native-inspection"); assert.deepEqual(f.request.productIdentity, f.identity);
  assert.equal(f.request.teamId, undefined, "signer policy must be independent of the input");
  assert.equal(f.request.installer.sha256, f.files[0].sha256);
  f.packages[0].executables[0].sha256 = "f".repeat(64);
  assert.notEqual(f.request.executables[0].sha256, "f".repeat(64), "snapshot, not mutable selection alias");
  fs.writeFileSync(`${f.filename}.sha256`, "wrong checksum");
  assert.throws(() => createMacosInstallerRequest(f.root, f.identity, f.packages, f.files), /checksum differs/);
});
test("request validation rejects incomplete, duplicated, unsafe or oversized identities", (t) => {
  const f = fixture(t);
  for (const mutate of [
    (r) => { r.status = "passed"; }, (r) => { r.productIdentity.sourceRevision = "main"; },
    (r) => { r.version = "0.8.0' or true() or '"; }, (r) => { r.installer.path = "../other.pkg"; },
    (r) => { r.installer.bytes = 3 * 1024 ** 3; }, (r) => { r.executables[1] = r.executables[0]; },
    (r) => { r.executables[0].sha256 = "invalid"; }, (r) => { r.executables[0].bytes = -1; },
  ]) { const request = structuredClone(f.request); mutate(request); assert.throws(() => validateRequest(request), /invalid macOS/); }
});
test("installer identity checks require Apple's trusted status, timestamp and expected leaf team", () => {
  assert.doesNotThrow(() => assertInstallerSignature(signature, team));
  for (const wrong of [signature.replace(team, "AAAAAAAAAA"), signature.replace("signed by a developer", "unsigned by a developer"),
    signature.replace("trusted timestamp", "timestamp"), signature.replace("1. Developer", "2. Developer"), signature.replace("Installer:", "Application:")]) {
    assert.throws(() => assertInstallerSignature(wrong, team), /required trusted/);
  }
});
test("macOS verification requires the native host and policy team, and checks the selected bytes first", async (t) => {
  const f = fixture(t);
  await assert.rejects(f.check({ platform: "linux" }), /native macOS/);
  f.options.expectedTeamId = undefined; await assert.rejects(f.check(), /policy-selected/);
  f.options.expectedTeamId = team; fs.writeFileSync(f.filename, "substitution");
  await assert.rejects(f.check(), /differs from selected/); assert.equal(f.calls.length, 0); f.assertClean();
});
test("native verification checks signatures, metadata and exact payload without installation, execution or re-signing", { skip: process.platform === "win32" }, async (t) => {
  const f = fixture(t), result = await f.check();
  assert.equal(result.status, "passed"); assert.deepEqual(result.request, f.request); assert.match(result.authority, /authenticated transport/);
  assert.equal(f.calls.filter((item) => item.program.endsWith("codesign")).length, 2);
  assert.ok(f.calls.filter((item) => item.program.endsWith("codesign")).every((item) => item.args.includes("--verify") && item.args.some((arg) => arg.includes(team))));
  assert.ok(f.calls.every((item) => !item.args.includes("--sign") && !item.program.endsWith("/installer") && !item.program.endsWith("/sagejs")));
  f.assertClean();
});
test("each failed native command stops acceptance and removes only owned scratch", { skip: process.platform === "win32" }, async (t) => {
  for (const failing of ["--check-signature", "--assess", "stapler", "-tf", "--payload-files", "--expand", "--nonet", "-p", "--expand-full", "--verify"]) {
    const f = fixture(t);
    await assert.rejects(f.check({ command: async (program, args, options) => {
      if (args[0] === failing) throw new Error("native tool failure");
      return f.run(program, args, options);
    } }), /native tool failure/);
    f.assertClean(); assert.ok(fs.existsSync(f.filename));
  }
});
test("extra paths, wrong BOM, invalid metadata, altered payload and in-flight package mutation fail closed", { skip: process.platform === "win32" }, async (t) => {
  for (const scenario of ["outer", "paths", "bom", "xml", "payload", "mutation", "scripts", "entity", "utf16"]) {
    const f = fixture(t);
    await assert.rejects(f.check({ command: async (program, args, options) => {
      const result = await f.run(program, args, options);
      if (scenario === "outer" && program.endsWith("xar")) result.stdout += "Scripts\n";
      if (scenario === "paths" && args[0] === "--payload-files") result.stdout += "../../escape\n";
      if (scenario === "bom" && program.endsWith("lsbom")) result.stdout = result.stdout.replace("100755", "104755");
      if (scenario === "xml" && program.endsWith("xmllint")) result.stdout = "false\n";
      if (scenario === "payload" && args[0] === "--expand-full") fs.writeFileSync(path.join(args[2], "Payload/usr/local/bin/sagejs"), "unqualified");
      if (scenario === "mutation" && program.endsWith("codesign")) fs.appendFileSync(f.filename, "changed");
      if (scenario === "scripts" && args[0] === "--expand-full") fs.writeFileSync(path.join(args[2], "Scripts"), "code");
      if (scenario === "entity" && args[0] === "--expand") fs.writeFileSync(path.join(args[2], "PackageInfo"), '<!DOCTYPE pkg-info SYSTEM "file:///etc/passwd">');
      if (scenario === "utf16" && args[0] === "--expand") fs.writeFileSync(path.join(args[2], "PackageInfo"), Buffer.from(xml, "utf16le"));
      return result;
    } }), /unexpected|differs|unsupported/); f.assertClean();
  }
});
test("extracted payload rejects symlinks, hardlinks, extra files and wrong permissions", { skip: process.platform === "win32" }, (t) => {
  for (const kind of ["symlink", "hardlink", "extra", "mode", "missing"]) {
    const f = fixture(t), root = path.join(f.root, "payload"); f.payload(root);
    const filename = path.join(root, "usr/local/bin/sagejs");
    if (kind === "symlink") { fs.unlinkSync(filename); fs.symlinkSync(f.filename, filename); }
    if (kind === "hardlink") fs.linkSync(filename, path.join(f.root, "linked"));
    if (kind === "extra") fs.writeFileSync(path.join(root, "extra"), "extra");
    if (kind === "mode") fs.chmodSync(filename, 0o4755);
    if (kind === "missing") fs.unlinkSync(filename);
    assert.throws(() => inspectPayload(root, f.request.executables), /ordinary|unexpected|differs/);
  }
});
test("system libxml accepts the real component schema and rejects version, install scripts and alternate semantics", { skip: process.platform !== "darwin" }, (t) => {
  const f = fixture(t), filename = path.join(f.root, "PackageInfo");
  const check = (source) => { fs.writeFileSync(filename, source); return execFileSync("/usr/bin/xmllint", ["--nonet", "--xpath", packageInfoPredicate("0.8.0"), filename], { encoding: "utf8" }).trim(); };
  assert.equal(check(xml), "true");
  for (const bad of [xml.replace('version="0.8.0"', 'version="0.9.0"'), xml.replace('install-location="/"', 'install-location="/etc"'),
    xml.replace("<bundle-version/>", "<scripts><postinstall file='code'/></scripts>"), xml.replace('numberOfFiles="6"', 'numberOfFiles="7"'),
    xml.replace("<relocate/>", "<relocate><bundle path='other'/></relocate>"), xml.replace('auth="root"', 'auth="none"'),
    xml.replace("<payload", "<payload unwanted='true'"), xml.replace("</pkg-info>", "<?extra ignored?></pkg-info>")]) assert.equal(check(bad), "false");
});
test("native command wrapper enforces output bounds, cancellation and nonzero exits", async () => {
  await assert.rejects(command(process.execPath, ["-e", "process.exit(3)"]), /native macOS verification failed/);
  await assert.rejects(command(process.execPath, ["-e", "process.stdout.write('a'.repeat(131072))"]), /output exceeds bounds/);
  await assert.rejects(command(process.execPath, ["-e", "setInterval(()=>{},1000)"], { signal: AbortSignal.timeout(100) }), /abort|timeout/i);
});
