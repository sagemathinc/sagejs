#!/usr/bin/env node
"use strict";

// Fetch only the selected native macOS role. Its observation is compared with
// independently qualified executable identities by the final consumer; this
// job does not repeat or replace numerical qualification on every platform.
const fs = require("node:fs"), path = require("node:path");
const { githubApi } = require("./product-acceptance.cjs");
const { inspectControlArtifact } = require("./control-artifact.cjs");
const { verifyHandoffArchive, contract: handoffContract, argumentsFor: handoffArguments } = require("./artifact-handoff.cjs");
const { stageArtifactSet, downloadGithubArchive, requireDownloadSpace } = require("./stage-artifacts.cjs");
const { prepareArtifact } = require("./extract-artifact.cjs");
const { replaceDirectory, realDirectory } = require("./directory-transaction.cjs");
const { identity: sourceIdentity, fileDigest } = require("./runner.cjs");
const { validatePackageArchiveContents } = require("../package-qualification/archive-validator.cjs");
const { installerRequest, verifyMacosInstaller } = require("./macos-installer.cjs");
const key = "native/sagejs-macos-arm64";
async function collectMacosInspection(options, dependencies = {}) {
  options.signal?.throwIfAborted();
  if ((dependencies.platform ?? process.platform) !== "darwin") throw new Error("macOS inspection collection requires native macOS");
  if (!/^[A-Z0-9]{10}$/.test(options.teamId ?? "")) throw new Error("independent policy Team ID required");
  const root = path.resolve(options.candidateRoot), directory = path.resolve(options.directory);
  realDirectory(root); sourceIdentity(root, options.sha); realDirectory(directory);
  const api = dependencies.api ?? githubApi;
  const frozen = await replaceDirectory({ parent: directory, name: `macos-handoff-${options.artifactId}-attempt-${options.runAttempt}`,
    async prepare(pending) {
      const { artifact } = inspectControlArtifact(options, handoffContract, api);
      requireDownloadSpace(pending, artifact.size_in_bytes);
      await (dependencies.handoffDownload ?? downloadGithubArchive)({ id: artifact.id, sizeInBytes: artifact.size_in_bytes }, path.join(pending, "handoff.zip"), { signal: options.signal });
    },
    validate(pending) { return verifyHandoffArchive({ ...options, filename: path.join(pending, "handoff.zip") }, api); },
  });
  const accepted = frozen.value, manifest = accepted.manifest;
  const staged = await stageArtifactSet({ ...dependencies.staging, manifest, expectedDigest: manifest.manifestDigest,
    directory, signal: options.signal, keys: [key] });
  const artifact = staged.artifacts[0];
  const expanded = await prepareArtifact({ manifest, expectedDigest: manifest.manifestDigest, key,
    filename: artifact.filename, directory, signal: options.signal });
  const assertInputs = () => {
    sourceIdentity(root, options.sha);
    for (const file of expanded.value.files) {
      const filename = path.join(expanded.directory, file.path), stat = fs.lstatSync(filename);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size !== file.size || fileDigest(filename) !== file.sha256) throw new Error("selected macOS transport inputs changed");
    }
  };
  assertInputs();
  const npm = await validatePackageArchiveContents(path.join(expanded.directory, "npm/sagejs-macos-arm64.tgz"), { signal: options.signal });
  const executables = ["sagejs", "sagepython"].map((name) => {
    const item = npm.members.find((member) => member.path === `package/bin/${name}`);
    if (item?.type !== "file") throw new Error("selected macOS npm package lacks an executable");
    return { name, member: item.path, bytes: item.size, sha256: item.sha256 };
  });
  const descriptor = expanded.value.files.find((item) => item.path === "sagejs-macos-arm64.pkg");
  if (expanded.value.files.find((item) => item.path === "sagejs-macos-arm64.pkg.sha256").size > 256) throw new Error("macOS installer checksum exceeds bounds");
  const checksum = fs.readFileSync(path.join(expanded.directory, "sagejs-macos-arm64.pkg.sha256"), "utf8");
  if (!["\n", "\r\n"].some((eol) => checksum === `${descriptor.sha256}  ${descriptor.path}${eol}`)) throw new Error("selected macOS installer checksum mismatch");
  const packageJson = path.join(root, "package.json"), packageStat = fs.lstatSync(packageJson);
  if (!packageStat.isFile() || packageStat.isSymbolicLink() || packageStat.nlink !== 1 || packageStat.size > 1024 ** 2) throw new Error("candidate package metadata must be an ordinary bounded file");
  const version = JSON.parse(fs.readFileSync(packageJson, "utf8")).version;
  const request = installerRequest({ sourceRevision: manifest.sourceRevision, ref: manifest.ref, event: manifest.event,
    purpose: manifest.purpose, manifestDigest: manifest.manifestDigest }, version,
  { path: "release/sagejs-macos-arm64.pkg", bytes: descriptor.size, sha256: descriptor.sha256 }, executables);
  const result = await (dependencies.verify ?? verifyMacosInstaller)({ request, filename: path.join(expanded.directory, descriptor.path),
    expectedTeamId: options.teamId, signal: options.signal, scratchParent: directory });
  assertInputs(); options.signal?.throwIfAborted();
  return result;
}
function argumentsFor(args) {
  const rest = [...args], index = rest.indexOf("--candidate-root");
  if (index < 0 || !rest[index + 1] || rest[index + 1].startsWith("--")) throw new Error("dedicated candidate source checkout required");
  const [, candidateRoot] = rest.splice(index, 2);
  const { options } = handoffArguments(["stage", ...rest, "--archive", "managed-handoff.zip"]);
  return { ...options, candidateRoot, teamId: "BVF94G2MB4" };
}
async function main(args) {
  const options = argumentsFor(args), controller = new AbortController(), cancel = () => controller.abort();
  process.once("SIGINT", cancel); process.once("SIGTERM", cancel);
  try { console.log(JSON.stringify(await collectMacosInspection({ ...options, signal: controller.signal }), null, 2)); }
  finally { process.removeListener("SIGINT", cancel); process.removeListener("SIGTERM", cancel); }
}
module.exports = { collectMacosInspection, argumentsFor };
if (require.main === module) main(process.argv.slice(2)).catch(() => { console.error("Selected macOS inspection failed; no publication authorization granted."); process.exitCode = 1; });
