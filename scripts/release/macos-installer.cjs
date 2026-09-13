#!/usr/bin/env node
"use strict";

// Reviewed control code: inspect an already selected, signed installer. Never
// install, run its executables, sign, notarize or publish. A returned observation
// still needs authenticated transport into the production promotion decision.
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { runBufferedCommand } = require("../build-parallelism.cjs");
const { fileDigest } = require("./runner.cjs");
const { realDirectory } = require("./directory-transaction.cjs");
const { requireDownloadSpace } = require("./stage-artifacts.cjs");
const packagePath = "release/sagejs-macos-arm64.pkg";
const names = ["sagejs", "sagepython"];
const directories = [".", "./usr", "./usr/local", "./usr/local/bin"];
const members = [...directories, ...names.map((name) => `./usr/local/bin/${name}`)].sort();
const maxBytes = 2 * 1024 ** 3;
function ordinary(filename, limit = maxBytes) {
  const stat = fs.lstatSync(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size < 1 || stat.size > limit) throw new Error("installer input must be an ordinary bounded file");
  return stat;
}
function validateRequest(value) {
  if (value?.schema !== "sagejs.macos-installer-request/v1" || value.status !== "pending-native-inspection" ||
      !/^[a-f0-9]{40}$/.test(value.productIdentity?.sourceRevision ?? "") ||
      !/^sha256:[a-f0-9]{64}$/.test(value.productIdentity?.manifestDigest ?? "") ||
      !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value.version ?? "") ||
      value.installer?.path !== packagePath || !/^[a-f0-9]{64}$/.test(value.installer.sha256 ?? "") ||
      !Number.isSafeInteger(value.installer.bytes) || value.installer.bytes < 1 || value.installer.bytes > maxBytes ||
      !Array.isArray(value.executables) || value.executables.length !== 2) throw new Error("invalid macOS installer inspection request");
  for (const name of names) {
    const entries = value.executables.filter((item) => item?.name === name), item = entries[0];
    if (entries.length !== 1 || item.member !== `package/bin/${name}` || !/^[a-f0-9]{64}$/.test(item.sha256 ?? "") ||
        !Number.isSafeInteger(item.bytes) || item.bytes < 1 || item.bytes > maxBytes / 2) throw new Error("invalid macOS qualified executable identity");
  }
  return value;
}
function installerRequest(productIdentity, version, installer, executables) {
  return structuredClone(validateRequest({ schema: "sagejs.macos-installer-request/v1", status: "pending-native-inspection",
    productIdentity, version, installer,
    executables: executables.map(({ name, member, bytes, sha256 }) => ({ name, member, bytes, sha256 })) }));
}
function createMacosInstallerRequest(root, productIdentity, packages, files) {
  const selected = packages.filter((item) => item.platform === "macos-arm64");
  const descriptors = files.filter((item) => item.target === packagePath), descriptor = descriptors[0];
  if (selected.length !== 1 || descriptors.length !== 1) throw new Error("selected macOS installer and executables required");
  const filename = path.join(root, packagePath), checksum = `${filename}.sha256`;
  if (ordinary(filename).size !== descriptor.size || fileDigest(filename) !== descriptor.sha256) throw new Error("selected macOS installer changed");
  ordinary(checksum, 256);
  const text = fs.readFileSync(checksum, "utf8");
  if (!["\n", "\r\n"].some((eol) => text === `${descriptor.sha256}  ${path.basename(filename)}${eol}`)) throw new Error("macOS installer checksum differs from selected input");
  const manifest = path.join(root, "package.json"); ordinary(manifest, 1024 ** 2);
  return installerRequest(productIdentity, JSON.parse(fs.readFileSync(manifest, "utf8")).version,
    { path: packagePath, bytes: descriptor.size, sha256: descriptor.sha256 }, selected[0].executables);
}

async function command(program, args, { signal, cwd } = {}) {
  const output = [], errors = [], controller = new AbortController();
  const combined = AbortSignal.any([...(signal ? [signal] : []), controller.signal, AbortSignal.timeout(120000)]);
  combined.throwIfAborted();
  let bytes = 0;
  const collect = (target) => (chunk) => {
    bytes += chunk.length;
    if (bytes > 65536) controller.abort(new Error("macOS inspection command output exceeds bounds"));
    else target.push(chunk);
  };
  // Fixed native tools and a minimal environment; no shell/startup files or
  // caller-selected PATH tools. Keep HOME for the native trust/keychain lookup.
  const result = await runBufferedCommand(program, args, { signal: combined, cwd, capture: false,
    env: { PATH: "/usr/bin:/bin:/usr/sbin:/sbin", LC_ALL: "C", HOME: os.homedir(), TMPDIR: cwd || os.tmpdir() },
    terminationGraceMilliseconds: 250, onStdout: collect(output), onStderr: collect(errors) });
  combined.throwIfAborted();
  if (result.status !== 0) throw new Error(`native macOS verification failed: ${path.basename(program)}`);
  return { stdout: Buffer.concat(output).toString("utf8"), stderr: Buffer.concat(errors).toString("utf8") };
}
function assertInstallerSignature(output, team) {
  const leaf = output.match(/^\s*1\. Developer ID Installer: [^\r\n]+ \(([A-Z0-9]{10})\)\s*$/m);
  if (!leaf || leaf[1] !== team || !/^\s*Status: signed by a developer certificate issued by Apple for distribution\s*$/m.test(output) ||
      !/^\s*Signed with a trusted timestamp on: .+$/m.test(output)) throw new Error("macOS installer lacks the required trusted Developer ID identity/timestamp");
}
function assertLines(output, expected, label) {
  const lines = output.trimEnd().split("\n").sort();
  if (JSON.stringify(lines) !== JSON.stringify([...expected].sort())) throw new Error(`unexpected macOS installer ${label}`);
}
function packageInfoPredicate(version) {
  // version has been validated before interpolation. XML parsing is delegated
  // to system libxml, with no network, DTD or entity declarations allowed.
  const attrs = ["overwrite-permissions", "relocatable", "identifier", "postinstall-action", "version", "format-version", "generator-version", "install-location", "auth"];
  const empty = ["bundle-version", "upgrade-bundle", "update-bundle", "atomic-update-bundle", "strict-identifier", "relocate"];
  const conditions = [
    "count(/*)=1", "count(/pkg-info)=1", "/pkg-info/@identifier='org.sagemath.sagejs.cli'", `/pkg-info/@version='${version}'`,
    "/pkg-info/@install-location='/'", "/pkg-info/@relocatable='false'", "/pkg-info/@postinstall-action='none'",
    "/pkg-info/@auth='root'", "/pkg-info/@format-version='2'", "/pkg-info/@overwrite-permissions='true'",
    `count(/pkg-info/@*[not(${attrs.map((name) => `name()='${name}'`).join(" or ")})])=0`,
    `count(/pkg-info/*[not(self::payload or ${empty.map((name) => `self::${name}`).join(" or ")})])=0`,
    "count(/pkg-info/payload)=1", "/pkg-info/payload/@numberOfFiles='6'",
    "count(/pkg-info/payload/@*[not(name()='numberOfFiles' or name()='installKBytes')])=0",
    "count(/pkg-info/*/*)=0", "count(/pkg-info/*[not(self::payload)]/@*)=0",
    "count(//text()[normalize-space(.)!=''])=0", "count(//processing-instruction())=0",
  ];
  return `boolean(${conditions.join(" and ")})`;
}
function inspectPayload(root, executables) {
  const result = [];
  function visit(directory, relative) {
    const stat = fs.lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o7777) !== 0o755) throw new Error("unexpected macOS payload directory");
    result.push(relative);
    for (const name of fs.readdirSync(directory)) {
      const child = `${relative}/${name}`, filename = path.join(directory, name);
      if (!members.includes(child)) throw new Error("unexpected macOS installer payload member");
      if (directories.includes(child)) visit(filename, child);
      else {
        const expected = executables.find((item) => item.name === name), value = ordinary(filename);
        if (!expected || value.size !== expected.bytes || (value.mode & 0o7777) !== 0o755 || fileDigest(filename) !== expected.sha256) throw new Error("macOS installer payload differs from qualified executable");
        result.push(child);
      }
    }
  }
  visit(root, "."); assertLines(result.join("\n"), members, "payload inventory");
}
async function verifyMacosInstaller({ request: input, filename, expectedTeamId, scratchParent = fs.realpathSync(os.tmpdir()), signal }, dependencies = {}) {
  const request = structuredClone(validateRequest(input));
  if ((dependencies.platform ?? process.platform) !== "darwin") throw new Error("macOS installer verification requires native macOS");
  if (!/^[A-Z0-9]{10}$/.test(expectedTeamId ?? "")) throw new Error("explicit policy-selected Apple Team ID required");
  const run = dependencies.command ?? command;
  signal = signal ? AbortSignal.any([signal, AbortSignal.timeout(600000)]) : AbortSignal.timeout(600000);
  signal.throwIfAborted();
  filename = path.resolve(filename); scratchParent = path.resolve(scratchParent); realDirectory(scratchParent);
  const checkInput = () => {
    signal.throwIfAborted();
    if (ordinary(filename).size !== request.installer.bytes || fileDigest(filename) !== request.installer.sha256) throw new Error("macOS installer differs from selected artifact");
  };
  checkInput();
  requireDownloadSpace(scratchParent, request.installer.bytes * 2 + request.executables.reduce((sum, item) => sum + item.bytes, 0));
  const scratch = fs.mkdtempSync(path.join(scratchParent, "sagejs-installer-inspect-"));
  const call = (program, args) => run(program, args, { signal, cwd: scratch });
  try {
    // Authenticate before extracting even metadata. Gatekeeper and stapler must
    // succeed now; an old JSON claiming success is never substituted for them.
    const signature = await call("/usr/sbin/pkgutil", ["--check-signature", filename]);
    assertInstallerSignature(signature.stdout, expectedTeamId);
    await call("/usr/sbin/spctl", ["--assess", "--type", "install", "--verbose=4", filename]);
    await call("/usr/bin/xcrun", ["stapler", "validate", filename]);
    assertLines((await call("/usr/bin/xar", ["-tf", filename])).stdout, ["Bom", "PackageInfo", "Payload"], "outer members");
    assertLines((await call("/usr/sbin/pkgutil", ["--payload-files", filename])).stdout, members, "payload paths");
    const metadata = path.join(scratch, "metadata");
    await call("/usr/sbin/pkgutil", ["--expand", filename, metadata]);
    realDirectory(metadata);
    assertLines(fs.readdirSync(metadata).join("\n"), ["Bom", "PackageInfo", "Payload"], "expanded metadata");
    ordinary(path.join(metadata, "Bom"), 1024 ** 2); ordinary(path.join(metadata, "Payload"));
    const info = path.join(metadata, "PackageInfo"); ordinary(info, 65536);
    const infoBytes = fs.readFileSync(info), infoText = infoBytes.toString("utf8");
    if (infoBytes.includes(0) || !Buffer.from(infoText, "utf8").equals(infoBytes) ||
        !/^<\?xml version="1\.0" encoding="utf-8"\?>/.test(infoText) || /<!|<\?[^x]|<\?xml[\s\S]*<\?xml/i.test(infoText)) throw new Error("unsupported macOS installer XML declaration");
    const xml = await call("/usr/bin/xmllint", ["--nonet", "--xpath", packageInfoPredicate(request.version), info]);
    if (xml.stdout.trim() !== "true") throw new Error("unexpected macOS installer PackageInfo semantics");
    const bom = [...directories.map((name) => `${name}\t40755\t`),
      ...request.executables.map((item) => `./usr/local/bin/${item.name}\t100755\t${item.bytes}`)];
    // Preserve trailing tabs: directory sizes are intentionally absent.
    const bomOutput = (await call("/usr/bin/lsbom", ["-p", "fms", path.join(metadata, "Bom")])).stdout.replace(/\n$/, "");
    if (JSON.stringify(bomOutput.split("\n").sort()) !== JSON.stringify(bom.sort())) throw new Error("macOS installer BOM differs from qualified payload shape/sizes/modes");
    checkInput();
    const expanded = path.join(scratch, "expanded");
    await call("/usr/sbin/pkgutil", ["--expand-full", filename, expanded]);
    realDirectory(expanded);
    assertLines(fs.readdirSync(expanded).join("\n"), ["Bom", "PackageInfo", "Payload"], "expanded package");
    for (const name of ["Bom", "PackageInfo"]) {
      ordinary(path.join(expanded, name), 1024 ** 2);
      if (fileDigest(path.join(expanded, name)) !== fileDigest(path.join(metadata, name))) throw new Error("macOS installer metadata changed during expansion");
    }
    const payload = path.join(expanded, "Payload"); inspectPayload(payload, request.executables);
    // Apple Developer ID requirement, independently constrained to release policy.
    // https://developer.apple.com/documentation/technotes/tn3127-inside-code-signing-requirements
    const requirement = `=anchor apple generic and certificate 1[field.1.2.840.113635.100.6.2.6] exists and certificate leaf[field.1.2.840.113635.100.6.1.13] exists and certificate leaf[subject.OU] = "${expectedTeamId}"`;
    for (const name of names) await call("/usr/bin/codesign", ["--verify", "--strict", "-R", requirement, path.join(payload, "usr/local/bin", name)]);
    inspectPayload(payload, request.executables); checkInput();
    const host = (await call("/usr/bin/sw_vers", ["-productVersion"])).stdout.trim();
    return { schema: "sagejs.macos-installer-observation/v1", status: "passed", request,
      teamId: expectedTeamId, host: { platform: "darwin", version: host }, verifierSha256: fileDigest(__filename),
      checks: ["trusted-installer-identity", "gatekeeper-install", "stapled-notarization", "package-metadata", "exact-payload", "developer-id-executable-signatures"],
      authority: "native observation only; authenticated transport and selected-artifact binding required for promotion" };
  } finally {
    // Only this invocation's mkdtemp is owned here, never the selected package.
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}
async function main(args) {
  if (args.length !== 6 || args[0] !== "--request" || args[2] !== "--installer" || args[4] !== "--team-id") throw new Error("usage: macos-installer.cjs --request request.json --installer selected.pkg --team-id POLICY_TEAM_ID");
  ordinary(args[1], 65536);
  const controller = new AbortController(), cancel = () => controller.abort();
  process.once("SIGINT", cancel); process.once("SIGTERM", cancel);
  try { console.log(JSON.stringify(await verifyMacosInstaller({ request: JSON.parse(fs.readFileSync(args[1], "utf8")), filename: args[3], expectedTeamId: args[5], signal: controller.signal }), null, 2)); }
  finally { process.removeListener("SIGINT", cancel); process.removeListener("SIGTERM", cancel); }
}
module.exports = { createMacosInstallerRequest, installerRequest, validateRequest, verifyMacosInstaller, assertInstallerSignature, assertLines, inspectPayload, packageInfoPredicate, command };
if (require.main === module) main(process.argv.slice(2)).catch((error) => { console.error(error.message); process.exitCode = 1; });
