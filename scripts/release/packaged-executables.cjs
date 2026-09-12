"use strict";

// Cross-bind the SEA inside each qualified npm archive to its independently
// qualified standalone SEA row. No extraction, installation or execution.
const fs = require("node:fs");
const { repositoryPath } = require("../numerical-computing/common.cjs");
const { qualifiedPackageArtifact } = require("../numerical-computing/qualification/authenticate-release-gate.cjs");
const { validatePackageArchiveContents } = require("../package-qualification/archive-validator.cjs");
const { fileDigest } = require("./runner.cjs");
const platforms = ["linux-x64", "linux-arm64", "macos-arm64", "windows-x64"];

async function authenticatePackagedExecutables(root, gate, packages, { signal } = {}) {
  signal = signal ? AbortSignal.any([signal, AbortSignal.timeout(300000)]) : AbortSignal.timeout(300000);
  signal.throwIfAborted();
  if (!Array.isArray(packages) || packages.length !== platforms.length || new Set(packages.map((item) => item.platform)).size !== platforms.length) {
    throw new Error("exact four-platform package selection required");
  }
  const result = [];
  for (const platform of platforms) {
    signal.throwIfAborted();
    const selected = packages.find((item) => item.platform === platform);
    if (selected?.path !== `release/npm/sagejs-${platform}.tgz`) throw new Error("noncanonical selected platform package");
    const filename = repositoryPath(root, selected.path, "selected npm archive").absolute;
    function boundInputs() {
      const npm = qualifiedPackageArtifact(gate, platform, "npm", root);
      const sea = qualifiedPackageArtifact(gate, platform, "sea", root);
      const stat = fs.lstatSync(filename);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 2 * 1024 ** 3 ||
          stat.size !== npm.bytes || selected.bytes !== npm.bytes || selected.sha256 !== npm.content_sha256 || fileDigest(filename) !== npm.content_sha256) {
        throw new Error("selected npm archive differs from qualified bytes");
      }
      return sea;
    }
    const sea = boundInputs(), inspected = await validatePackageArchiveContents(filename, { signal });
    const executables = ["sagejs", "sagepython"].map((name) => {
      const memberPath = `package/bin/${name}${platform === "windows-x64" ? ".exe" : ""}`;
      const member = inspected.members.find((item) => item.path === memberPath);
      if (member?.type !== "file" || member.size < 1 || !/^[a-f0-9]{64}$/.test(member.sha256 ?? "")) throw new Error(`qualified package lacks regular executable ${memberPath}`);
      return { name, member: memberPath, sha256: member.sha256, bytes: member.size,
        evidence: name === "sagejs" ? `${platform}-npm and ${platform}-sea` : `${platform}-npm` };
    });
    if (executables[0].sha256 !== sea.content_sha256 || executables[0].bytes !== sea.bytes) {
      throw new Error(`${platform} packaged sagejs differs from the qualified standalone SEA`);
    }
    // The raw SEA row covers sagejs, not sagepython. Do not relabel the latter
    // as independently qualified: it is bound by its tested complete npm tarball.
    boundInputs();
    result.push({ platform, archive: selected.path, archiveSha256: selected.sha256, executables });
  }
  return result;
}
module.exports = { authenticatePackagedExecutables, platforms };
