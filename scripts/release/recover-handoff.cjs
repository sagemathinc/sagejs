"use strict";
const fs = require("node:fs"), path = require("node:path");
const { execFileSync } = require("node:child_process");
const { githubApi } = require("./product-acceptance.cjs");
const { inspectProducers } = require("./numerical-recovery.cjs");
const { readArtifacts, artifactRecord, identity, captureArtifactSet } = require("./artifact-set.cjs");
const { fileDigest } = require("./runner.cjs");
const { fileView, expectedTree, limits } = require("./extract-artifact.cjs");
const { zipEntries, zipMemberData } = require("../numerical-computing/qualification/scipy-oracle-provisioner.cjs");
const repository = "sagemathinc/sagejs";
const options = () => ({ sha: process.env.SOURCE_SHA, ref: process.env.SOURCE_REF,
  event: process.env.SOURCE_EVENT, purpose: process.env.PURPOSE,
  nativeRunId: Number(process.env.NATIVE_RUN_ID), browserRunId: Number(process.env.BROWSER_RUN_ID) });
const inputs = [
  ...["linux-x64", "linux-arm64", "windows-x64", "macos-arm64"].map((platform) => ({
    name: `numerical-qualification-${platform}`, target: `build/numerical-qualification/platform/${platform}`,
    policy: { required: [], prefixes: [`${platform}-`] },
  })),
  { name: "numerical-qualification-browser-supplemental", target: ".", policy: {
    required: ["build/sea/sagejs"], prefixes: ["build/numerical-qualification/browser/", "dist/numerical/", "packages/flint-wasm/dist/", "packages/flint-wasm/numerical/build/"] } },
  { name: "sagejs-public-npm-root", target: ".", policy: {
    required: ["build/release/npm/sagejs.tgz"], prefixes: ["packages/flint-wasm/dist/"] } },
];
function extract(filename, destination, policy) {
  const fd = fs.openSync(filename, "r");
  try {
    const view = fileView(fd, fs.fstatSync(fd).size), index = zipEntries(view, { limits, wheel: false });
    expectedTree(index.entries, policy);
    for (const entry of index.entries) if (!entry.directory) zipMemberData(view, entry, index.centralOffset);
  } finally { fs.closeSync(fd); }
  fs.mkdirSync(destination, { recursive: true });
  execFileSync("unzip", ["-q", "-o", filename, "-d", destination], { stdio: "inherit" });
}
function restore(root, directory) {
  const o = options(), proof = inspectProducers(o);
  const repo = githubApi(`repos/${repository}`), available = readArtifacts(o.nativeRunId, githubApi), records = [];
  fs.mkdirSync(directory, { recursive: false });
  for (const input of inputs) {
    const matches = available.filter((a) => a.name === input.name);
    if (matches.length !== 1) throw new Error("ambiguous recovery input");
    const context = { runId: o.nativeRunId, sourceRevision: o.sha, ref: o.ref, repositoryId: repo.id };
    const record = artifactRecord(matches[0], "native", input.name, context);
    const filename = path.resolve(directory, `${record.id}.zip`), fd = fs.openSync(filename, "wx");
    try { execFileSync("gh", ["api", `repos/${repository}/actions/artifacts/${record.id}/zip`], { stdio: ["ignore", fd, "inherit"], timeout: 300000 }); }
    finally { fs.closeSync(fd); }
    if (fs.statSync(filename).size !== record.sizeInBytes || `sha256:${fileDigest(filename)}` !== record.archiveDigest) throw new Error("recovery archive digest mismatch");
    const current = artifactRecord(githubApi(`repos/${repository}/actions/artifacts/${record.id}`), "native", input.name, context);
    if (identity(record) !== identity(current)) throw new Error("recovery artifact changed");
    extract(filename, path.resolve(root, input.target), input.policy);
    records.push(record);
  }
  if (identity(inspectProducers(o)) !== identity(proof)) throw new Error("recovery producer changed");
  fs.writeFileSync(path.join(directory, "inputs.json"), JSON.stringify({ options: o, proof, records }));
}
function capture(directory) {
  const o = options(), saved = JSON.parse(fs.readFileSync(path.join(directory, "inputs.json")));
  if (identity(saved.options) !== identity(o) || identity(saved.proof) !== identity(inspectProducers(o))) throw new Error("recovery input identity changed");
  const repo = githubApi(`repos/${repository}`);
  for (const record of saved.records) {
    const current = artifactRecord(githubApi(`repos/${repository}/actions/artifacts/${record.id}`), "native", record.name,
      { runId: o.nativeRunId, sourceRevision: o.sha, ref: o.ref, repositoryId: repo.id });
    if (identity(record) !== identity(current)) throw new Error("recovery input replaced");
  }
  return captureArtifactSet({ ...o, recovery: { runId: Number(process.env.GITHUB_RUN_ID),
    runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT), controlRevision: process.env.GITHUB_SHA, ref: process.env.GITHUB_REF_NAME } });
}
if (require.main === module) {
  const [action, root, directory] = process.argv.slice(2);
  if (action === "restore" && root && directory) restore(path.resolve(root), path.resolve(directory));
  else if (action === "capture" && root && !directory) console.log(JSON.stringify(capture(path.resolve(root)), null, 2));
  else throw new Error("recover-handoff restore ROOT CACHE | capture CACHE");
}
module.exports = { inputs, extract };
