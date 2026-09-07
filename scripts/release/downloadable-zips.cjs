"use strict";

const fs = require("node:fs"), path = require("node:path");
const { repositoryPath } = require("../numerical-computing/common.cjs");
const { fileDigest } = require("./runner.cjs");
const { inspectZipContents } = require("./zip-contents.cjs");
const platforms = ["macos-arm64", "windows-x64"];
function ordinary(filename) {
  const stat = fs.lstatSync(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error("release ZIP input must be an ordinary unlinked file");
  return stat;
}
function documentation(root) {
  const licenses = repositoryPath(root, "licenses", "release license directory").absolute;
  const names = ["LICENSE", "README.md", "DISTRIBUTION.md",
    ...fs.readdirSync(licenses).filter((name) => !name.startsWith(".")).sort().map((name) => `licenses/${name}`)];
  if (names.length === 3) throw new Error("release licenses are missing");
  return names.map((name) => {
    const filename = repositoryPath(root, name, "release documentation").absolute, stat = ordinary(filename);
    if (stat.size < 1 || stat.size > 16 * 1024 ** 2) throw new Error("release documentation exceeds bounds");
    return { name, size: stat.size, sha256: fileDigest(filename) };
  });
}

// Receives byte identities from authenticatePackagedExecutables, after the
// enclosing handoff/numerical evidence has authenticated them. Not a replacement
// for that provenance, Authenticode, codesign or macOS installer verification.
async function authenticateDownloadableZips(root, packages, { signal } = {}) {
  signal = signal ? AbortSignal.any([signal, AbortSignal.timeout(300000)]) : AbortSignal.timeout(300000);
  signal.throwIfAborted();
  if (!Array.isArray(packages) || packages.length !== 4 ||
      ["linux-x64", "linux-arm64", ...platforms].some((platform) => packages.filter((item) => item?.platform === platform).length !== 1)) throw new Error("qualified four-platform executable selection required");
  const result = [];
  for (const platform of platforms) {
    signal.throwIfAborted();
    const selected = packages.find((item) => item.platform === platform);
    if (selected?.archive !== `release/npm/sagejs-${platform}.tgz` || !Array.isArray(selected.executables) || selected.executables.length !== 2) throw new Error("qualified executable selection is incomplete");
    const prefix = platform === "macos-arm64" ? "sagejs-macos-arm64/" : "", extension = platform === "windows-x64" ? ".exe" : "";
    const binaries = ["sagejs", "sagepython"].map((name) => {
      const value = selected.executables.find((item) => item.name === name);
      if (value?.member !== `package/bin/${name}${extension}` || !/^[a-f0-9]{64}$/.test(value.sha256 ?? "") || !Number.isSafeInteger(value.bytes) || value.bytes < 1) throw new Error("qualified executable identity is malformed");
      return { path: `${prefix}${name}${extension}`, size: value.bytes, sha256: value.sha256, executable: true };
    });
    const docs = documentation(root), expected = [...binaries, ...docs.map((item) => ({ ...item, path: `${prefix}${item.name}` }))];
    const relative = `release/sagejs-${platform}.zip`, filename = repositoryPath(root, relative, "downloadable ZIP").absolute;
    const sidecar = repositoryPath(root, `${relative}.sha256`, "downloadable ZIP checksum").absolute;
    const size = ordinary(filename).size;
    if (size < 22 || size > 2 * 1024 ** 3 || ordinary(sidecar).size > 256) throw new Error("release ZIP or checksum exceeds bounds");
    const checksum = fs.readFileSync(sidecar), sha256 = fileDigest(filename);
    if (checksum.toString("utf8") !== `${sha256}  ${path.basename(filename)}\n` && checksum.toString("utf8") !== `${sha256}  ${path.basename(filename)}\r\n`) throw new Error("downloadable ZIP checksum differs from selected archive");
    const inspected = await inspectZipContents(filename, expected.map((item) => item.path), { signal });
    for (const member of inspected.files) {
      const wanted = expected.find((item) => item.path === member.path);
      if (!wanted || wanted.size !== member.size || wanted.sha256 !== member.sha256) throw new Error(`downloadable ZIP differs from qualified binary or source documentation: ${member.path}`);
      if (wanted.executable && platform === "macos-arm64" && member.mode !== 0o755) throw new Error("macOS ZIP binary is not executable");
    }
    signal.throwIfAborted(); ordinary(sidecar);
    if (ordinary(filename).size !== size || fileDigest(filename) !== sha256 || !fs.readFileSync(sidecar).equals(checksum) ||
        JSON.stringify(documentation(root)) !== JSON.stringify(docs)) throw new Error("release ZIP inputs changed during verification");
    result.push({ platform, path: relative, sha256, bytes: size, ...inspected,
      authority: "qualified executable and source-document equality only; not signature or publication authorization" });
  }
  return result;
}
module.exports = { authenticateDownloadableZips, documentation };
