"use strict";

// Compare a retained inner archive with an already authenticated distribution.
// No extraction, execution or compression; this is not standalone provenance.
const fs = require("node:fs"), path = require("node:path");
const { createHash } = require("node:crypto");
const { validateBrowserArchive } = require("../package-qualification/archive-validator.cjs");
const { repositoryPath } = require("../numerical-computing/common.cjs");
const { fileDigest } = require("./runner.cjs");
const { distribution } = require("./browser-inputs.cjs");
const archive = "build/release-publication/browser-reproducible/sagejs-wasm.tar.gz";

function ordinary(filename) {
  const stat = fs.lstatSync(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error("browser archive input must be an ordinary unlinked file");
  return stat;
}
function distributionSnapshot(dist, signal) {
  // Same content identity as common.contentDigestPath, but keep memory bounded
  // and collect per-file identities in the same read, including unreported files.
  const hash = createHash("sha256"), files = new Map(), directories = new Set();
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  function visit(filename, relative) {
    signal.throwIfAborted();
    const stat = fs.lstatSync(filename), name = relative === "." ? "dist" : `dist/${relative}`;
    if (stat.isSymbolicLink()) throw new Error("browser distribution contains a symbolic link");
    if (stat.isDirectory()) {
      directories.add(name); hash.update(`directory\0${relative}\0`);
      for (const part of fs.readdirSync(filename).sort()) visit(path.join(filename, part), relative === "." ? part : `${relative}/${part}`);
      return;
    }
    ordinary(filename);
    const member = createHash("sha256"), fd = fs.openSync(filename, "r"); let size = 0;
    hash.update(`file\0${relative}\0${stat.size}\0`);
    try {
      for (;;) {
        signal.throwIfAborted();
        const count = fs.readSync(fd, buffer, 0, buffer.length, null);
        if (!count) break;
        const chunk = buffer.subarray(0, count); hash.update(chunk); member.update(chunk); size += count;
      }
    } finally { fs.closeSync(fd); }
    if (size !== stat.size) throw new Error("browser distribution changed during snapshot");
    hash.update("\0"); files.set(name, { size, sha256: member.digest("hex") });
  }
  visit(dist, "."); return { files, directories, contentSha256: hash.digest("hex") };
}
async function authenticateBrowserArchive(root, selected, { signal } = {}) {
  // Bound work and propagate caller cancellation, including when no child
  // command is running. The streaming tar reader bounds expansion separately.
  signal = signal ? AbortSignal.any([signal, AbortSignal.timeout(120000)]) : AbortSignal.timeout(120000);
  signal.throwIfAborted();
  if (selected.directory !== distribution || !/^[a-f0-9]{64}$/.test(selected.contentSha256 ?? "")) throw new Error("qualified browser selection required");
  const dist = repositoryPath(root, distribution, "selected browser distribution").absolute;
  const filename = repositoryPath(root, archive, "selected browser archive").absolute;
  const checksumFile = repositoryPath(root, `${archive}.sha256`, "selected browser archive checksum").absolute;
  const size = ordinary(filename).size, checksumSize = ordinary(checksumFile).size;
  if (size <= 0 || size > 2 * 1024 ** 3 || checksumSize > 256) throw new Error("browser archive inputs exceed bounds");
  const sha256 = fileDigest(filename);
  const checksumBytes = fs.readFileSync(checksumFile);
  // The producer runs sha256sum on build/sagejs-wasm.tar.gz. Do not let an
  // arbitrary checksum pathname select a different archive or escape the root.
  const checksum = /^([a-f0-9]{64})  (?:build\/)?sagejs-wasm\.tar\.gz\r?\n$/.exec(checksumBytes.toString("utf8"));
  if (!checksum || checksum[1] !== sha256) throw new Error("browser archive checksum does not match selected bytes");
  function boundDistribution() {
    const result = distributionSnapshot(dist, signal);
    if (result.contentSha256 !== selected.contentSha256) throw new Error("selected browser distribution changed after qualification binding");
    return result;
  }
  const { files: expected, directories } = boundDistribution(), archivedDirectories = new Set(["dist"]);
  if (!expected.size) throw new Error("empty browser distribution");
  const inspected = await validateBrowserArchive(filename, { signal });
  let files = 0, bytes = 0;
  for (const member of inspected.members) {
    const parts = member.path.split("/");
    for (let i = 1; i < parts.length; i++) archivedDirectories.add(parts.slice(0, i).join("/"));
    if (member.type === "directory") {
      if (!directories.has(member.path)) throw new Error("unexpected directory in browser archive");
      archivedDirectories.add(member.path);
      continue;
    }
    const matched = expected.get(member.path);
    if (!matched || member.size !== matched.size || member.sha256 !== matched.sha256) throw new Error(`browser archive differs from qualified distribution: ${member.path}`);
    expected.delete(member.path); files++; bytes += member.size;
  }
  if (expected.size) throw new Error("browser archive omits qualified distribution files");
  if (directories.size !== archivedDirectories.size || [...directories].some((name) => !archivedDirectories.has(name))) throw new Error("browser archive directory layout differs from qualified distribution");
  signal.throwIfAborted(); boundDistribution();
  ordinary(checksumFile);
  if (ordinary(filename).size !== size || fileDigest(filename) !== sha256 || !fs.readFileSync(checksumFile).equals(checksumBytes)) throw new Error("browser archive inputs changed during verification");
  return { path: archive, sha256, bytes: size, files, expandedFileBytes: bytes,
    distributionContentSha256: selected.contentSha256,
    authority: "qualified distribution/archive equality only; not deployment authorization" };
}
module.exports = { authenticateBrowserArchive, archive, distributionSnapshot };
