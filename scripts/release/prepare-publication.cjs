#!/usr/bin/env node
"use strict";

// Materialize authenticated inputs in a dedicated source-only consumer checkout
// and run the existing numerical reconstruction/authenticator there. No build,
// package installation, upload, tagging, signing or pointer mutation occurs.
const fs = require("node:fs"), path = require("node:path");
const { randomUUID } = require("node:crypto");
const { prepareHandoff, argumentsFor: handoffArguments } = require("./artifact-handoff.cjs");
const { run, identity, fileDigest, atomicJson, acquireLock } = require("./runner.cjs");
const { realDirectory, exists } = require("./directory-transaction.cjs");
const { requireDownloadSpace } = require("./stage-artifacts.cjs");
const statePath = "build/release-publication/state.json";

function projectedPath(key, name) {
  if (/^native\/sagejs-(linux-x64|linux-arm64|windows-x64|macos-arm64)$/.test(key)) return `release/${name}`;
  if (key === "native/sagejs-public-npm-root") return name === "build/release/npm/sagejs.tgz" ? "release/npm/sagejs.tgz" : name;
  if (key === "native/numerical-release-gate") return `build/validated-numerical-gate/${name}`;
  if (key === "native/numerical-release-evidence") return `build/numerical-qualification/${name}`;
  if (key === "browser/wasm-clean-build-a") return `build/release-publication/browser-clean/${name}`;
  if (key === "browser/sagejs-wasm-reproducible") return `build/release-publication/browser-reproducible/${name}`;
  throw new Error("unknown publication input role");
}
function projection(expanded) {
  const result = [], targets = new Set();
  for (const artifact of expanded) for (const file of artifact.files) {
    const target = projectedPath(artifact.key, file.path);
    if (targets.has(target.toLowerCase())) throw new Error("publication inputs collide");
    targets.add(target.toLowerCase());
    result.push({ source: path.join(artifact.directory, file.path), target, size: file.size, sha256: file.sha256 });
  }
  return result.sort((a, b) => a.target.localeCompare(b.target));
}
function directory(root, relative) {
  let current = root;
  for (const part of relative.split("/")) {
    if (!part || part === "." || part === ".." || part.includes("\\")) throw new Error("noncanonical consumer directory");
    current = path.join(current, part); realDirectory(current, !exists(current));
  }
  return current;
}
function ordinary(filename) {
  const stat = fs.lstatSync(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error("consumer input must be an unlinked regular file");
  return stat;
}
function checkConsumer(root, candidate, manifestDigest) {
  realDirectory(root); identity(root, candidate);
  if (exists(path.join(root, "dist"))) throw new Error("use a dedicated source-only publication checkout, not a built producer");
  const marker = path.join(root, statePath);
  if (exists(marker)) {
    if (ordinary(marker).size > 65536) throw new Error("oversized publication state");
    const state = JSON.parse(fs.readFileSync(marker, "utf8"));
    if (state.schema !== "sagejs.publication-inputs/v1" || state.candidate !== candidate || !/^sha256:[a-f0-9]{64}$/.test(state.manifestDigest ?? "") ||
        (manifestDigest !== undefined && state.manifestDigest !== manifestDigest)) throw new Error("consumer checkout belongs to another artifact set");
    return;
  }
  // Never commandeer a producer checkout or its frozen validation artifacts.
  for (const relative of ["release", "packages/flint-wasm/dist"]) if (exists(path.join(root, relative))) throw new Error("use a dedicated source-only publication checkout, not a built producer");
  const build = path.join(root, "build");
  if (exists(build)) {
    realDirectory(build);
    if (fs.readdirSync(build).some((name) => name !== "release-publication")) throw new Error("consumer build directory contains unrelated work");
    const control = path.join(build, "release-publication");
    if (exists(control)) { realDirectory(control); if (fs.readdirSync(control).some((name) => name !== "active.lock")) throw new Error("inspect incomplete consumer initialization before reuse"); }
  }
}
function requireState(root, candidate, manifestDigest) {
  if (!exists(path.join(root, statePath))) throw new Error("publication consumer state is required");
  checkConsumer(root, candidate, manifestDigest);
}
function rotateGate(root, candidate, manifestDigest) {
  root = path.resolve(root); requireState(root, candidate, manifestDigest);
  const lease = path.join(root, "build/release-runner/active.lock");
  if (ordinary(lease).size > 65536) throw new Error("invalid consumer runner lease");
  const owner = JSON.parse(fs.readFileSync(lease, "utf8"));
  if (owner.host !== require("node:os").hostname() || owner.pid !== process.ppid) throw new Error("gate rotation requires the parent runner lease");
  const gate = path.join(root, "build/numerical-qualification/gate");
  if (exists(gate)) {
    realDirectory(gate);
    const retained = directory(root, "build/release-publication/retained-gates");
    fs.renameSync(gate, path.join(retained, randomUUID()));
  }
}
function verificationStages(root, candidate, manifestDigest) {
  const state = [statePath];
  return [
    { id: "publication-numerical-reconstruction", gate: "numerical-evidence", timeoutSeconds: 600,
      controlImplementation: fileDigest(__filename),
      inputs: [...state, "build/numerical-qualification/platform", "build/numerical-qualification/browser"],
      outputs: ["build/numerical-qualification/gate"],
      commands: [["node", __filename, "--rotate-gate", root, candidate, manifestDigest],
        ["node", "scripts/numerical-computing/qualification/assemble-release-gate.cjs", "--candidate", candidate,
          "--input", "build/numerical-qualification", "--output", "build/numerical-qualification/gate"]] },
    { id: "publication-numerical-authentication", gate: "numerical-evidence", timeoutSeconds: 600,
      inputs: [...state, "build/validated-numerical-gate", "build/numerical-qualification/gate", "build/numerical-qualification/platform", "release/npm", "packages/flint-wasm/dist"],
      outputs: [],
      commands: [["node", "scripts/numerical-computing/qualification/authenticate-release-gate.cjs", "--candidate", candidate,
        "--gate", "build/validated-numerical-gate/release-gate.json", "--rebuilt-gate", "build/numerical-qualification/gate/release-gate.json",
        "--public-npm-root", "release/npm/sagejs.tgz", "--browser-distribution", "packages/flint-wasm/dist"]] },
  ];
}
async function preparePublication(options, dependencies = {}) {
  if (typeof options.candidateRoot !== "string") throw new Error("explicit dedicated candidate checkout required");
  const root = path.resolve(options.candidateRoot), cache = path.resolve(options.directory);
  realDirectory(root); identity(root, options.sha);
  const relativeCache = path.relative(root, cache);
  if (relativeCache !== ".." && !relativeCache.startsWith(`..${path.sep}`) && !path.isAbsolute(relativeCache)) throw new Error("artifact cache must be outside the consumer checkout");
  checkConsumer(root, options.sha);
  // Authenticate before copying anything into the source-only consumer.
  const accepted = await prepareHandoff(options, dependencies);
  const candidate = accepted.manifest.sourceRevision, digest = accepted.manifest.manifestDigest;
  const inputs = projection(accepted.expanded);
  checkConsumer(root, candidate, digest);
  const control = directory(root, "build/release-publication");
  const unlock = acquireLock(path.join(control, "active.lock"));
  try {
    checkConsumer(root, candidate, digest);
    if (!exists(path.join(root, statePath))) atomicJson(path.join(root, statePath), { schema: "sagejs.publication-inputs/v1", candidate, manifestDigest: digest });
    // Also coordinate with the existing runner/producer mutation lease.
    const runnerDirectory = directory(root, "build/release-runner");
    const unlockRunner = acquireLock(path.join(runnerDirectory, "active.lock"));
    try {
      for (const file of inputs) {
        options.signal?.throwIfAborted();
        if (ordinary(file.source).size !== file.size || fileDigest(file.source) !== file.sha256) throw new Error("expanded input changed before projection");
        const target = path.join(root, file.target);
        directory(root, path.posix.dirname(file.target));
        if (exists(target)) {
          if (ordinary(target).size === file.size && fileDigest(target) === file.sha256) continue;
          requireDownloadSpace(path.dirname(target), file.size);
          const retained = directory(root, "build/release-publication/replaced-inputs");
          fs.renameSync(target, path.join(retained, randomUUID()));
        } else requireDownloadSpace(path.dirname(target), file.size);
        // Failed copies stay outside canonical raw-evidence directories, so
        // retry can retain them without poisoning the exact input inventory.
        const temporary = path.join(directory(root, "build/release-publication/pending-copies"), randomUUID());
        fs.copyFileSync(file.source, temporary, fs.constants.COPYFILE_EXCL);
        if (ordinary(temporary).size !== file.size || fileDigest(temporary) !== file.sha256) throw new Error("publication copy failed byte verification");
        fs.renameSync(temporary, target);
      }
      identity(root, candidate);
    } finally { unlockRunner(); }
    // The shared runner owns progress, deadlines, cancellation and stage reuse.
    // It acquires its own mutation lease synchronously before launching work.
    options.signal?.throwIfAborted();
    const results = await run({ root, candidate, stages: verificationStages(root, candidate, digest),
      profile: "publication-inputs", selectedStages: true, signal: options.signal, preflight: dependencies.runner?.preflight });
    // This additional content binding uses the reviewed control implementation
    // against authenticated product evidence. Do not require older frozen
    // candidates to implement a new CLI flag or rewrite their qualified source.
    const { authenticatePlatformNpmPackages } = require("../numerical-computing/qualification/authenticate-release-gate.cjs");
    const { readJson } = require("../numerical-computing/common.cjs");
    const gate = readJson(path.join(root, "build/validated-numerical-gate/release-gate.json"));
    const platformPackages = authenticatePlatformNpmPackages(gate, "release/npm", root);
    const { authenticatePackagedExecutables } = require("./packaged-executables.cjs");
    const packagedExecutables = await authenticatePackagedExecutables(root, gate, platformPackages, { signal: options.signal });
    const { authenticateBrowserInputs } = require("./browser-inputs.cjs");
    const selectedBrowser = authenticateBrowserInputs(root, candidate, gate);
    const { authenticateBrowserArchive } = require("./browser-archive.cjs");
    selectedBrowser.archive = await authenticateBrowserArchive(root, selectedBrowser, { signal: options.signal });
    selectedBrowser.authority = "qualified distribution and inner archive comparison only; not deployment authorization";
    for (const file of inputs) {
      options.signal?.throwIfAborted();
      const target = path.join(root, file.target);
      if (ordinary(target).size !== file.size || fileDigest(target) !== file.sha256) throw new Error("publication inputs changed during verification");
    }
    identity(root, candidate);
    return { authentication: accepted.authentication, candidateRoot: root, results,
      productIdentity: { sourceRevision: candidate, ref: accepted.manifest.ref, event: accepted.manifest.event,
        purpose: accepted.manifest.purpose, manifestDigest: digest },
      files: inputs.map(({ target, size, sha256 }) => ({ path: target, size, sha256 })), platformPackages, packagedExecutables, selectedBrowser,
      status: "numerical-publication-inputs-authenticated",
      authority: "not publication authorization; downloadable SEA archives, signatures and deployment adoption remain required" };
  } finally { unlock(); }
}
async function main(args) {
  if (args[0] === "--rotate-gate") {
    if (args.length !== 4) throw new Error("invalid gate rotation request");
    rotateGate(args[1], args[2], args[3]); return;
  }
  const index = args.indexOf("--candidate-root");
  if (index < 0 || !args[index + 1]) throw new Error("--candidate-root is required");
  const rest = [...args]; const [, candidateRoot] = rest.splice(index, 2);
  const { options } = handoffArguments(["prepare", ...rest]);
  const controller = new AbortController(), cancel = () => controller.abort();
  process.once("SIGINT", cancel); process.once("SIGTERM", cancel);
  try { console.log(JSON.stringify(await preparePublication({ ...options, candidateRoot, signal: controller.signal }), null, 2)); }
  finally { process.removeListener("SIGINT", cancel); process.removeListener("SIGTERM", cancel); }
}
module.exports = { preparePublication, verificationStages, projection, projectedPath, checkConsumer, rotateGate };
if (require.main === module) main(process.argv.slice(2)).catch(() => { console.error("Publication input preparation failed; inspect retained runner logs. Nothing was published."); process.exitCode = 1; });
