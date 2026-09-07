#!/usr/bin/env node
"use strict";

// Control checkout and product checkout are deliberately distinct. A retry
// authenticates the original handoff/inspection IDs, never the newest build.
const fs = require("node:fs"), path = require("node:path");
const { execFileSync } = require("node:child_process");
const { identity, fileDigest, atomicJson, acquireLock } = require("./runner.cjs");
const { realDirectory, replaceDirectory } = require("./directory-transaction.cjs");
const { inspectControlArtifact } = require("./control-artifact.cjs");
const { downloadGithubArchive, requireDownloadSpace } = require("./stage-artifacts.cjs");
const { contract: handoffContract, verifyHandoffArchive } = require("./artifact-handoff.cjs");
const { contract: macosContract } = require("./macos-observation.cjs");
const { preparePromotion } = require("./prepare-publication.cjs");
const { publishGithubAssets, githubClient } = require("./publish-github-assets.cjs");
const { publishNpmPackages } = require("./publish-npm-packages.cjs");
const { finalizeGithubRelease } = require("./finalize-github-release.cjs");
const sha = x => /^[a-f0-9]{40}$/.test(x ?? "");
const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value) &&
  Object.keys(value).sort().join(",") === [...keys].sort().join(",");
function validateRequest(value) {
  if (!exact(value, ["schema", "sourceRevision", "sourceRef", "sourceEvent", "purpose", "tag", "handoff", "macos"]) ||
      value.schema !== "sagejs.prepared-promotion-request/v1" || !sha(value.sourceRevision) ||
      typeof value.sourceRef !== "string" || !value.sourceRef || /[\s\x00-\x1f]/.test(value.sourceRef) ||
      !["push", "workflow_dispatch"].includes(value.sourceEvent) || !["qualification", "release"].includes(value.purpose) ||
      !/^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:\+release\.[1-9]\d*)?$/.test(value.tag ?? "")) throw new Error("invalid prepared promotion request");
  if (value.purpose === "release" && (value.sourceEvent !== "push" || value.sourceRef !== value.tag)) throw new Error("release handoff must match the exact pushed tag");
  for (const item of [value.handoff, value.macos]) {
    if (!exact(item, ["runId", "runAttempt", "artifactId", "controlSha"]) || !sha(item.controlSha) ||
        ![item.runId, item.runAttempt, item.artifactId].every(x => Number.isSafeInteger(x) && x > 0)) throw new Error("explicit immutable control artifact pins required");
  }
  return structuredClone(value);
}
function requestFromInputs(inputs) {
  if (typeof inputs?.prepared_request !== "string" || !inputs.prepared_request || inputs.prepared_request.length > 8192 ||
      typeof inputs.publish_prepared !== "boolean" || inputs.qualify_release === true || inputs.platform_smoke === true ||
      inputs.candidate_sha || inputs.recovery_run_id || inputs.recovery_tag ||
      (inputs.native_targets !== undefined && inputs.native_targets !== "all")) throw new Error("prepared promotion cannot be mixed with producer or recovery modes");
  let value; try { value = JSON.parse(inputs.prepared_request); } catch { throw new Error("invalid prepared request JSON"); }
  return { request: validateRequest(value), publish: inputs.publish_prepared };
}
function configureConsumer(root, source) {
  realDirectory(root); identity(root, source);
  // Output excludes must never affect other worktrees or hide source changes.
  // Actions checks out an isolated repository here; local callers use a clone.
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", timeout: 10000 }).trim();
  if (path.resolve(root, git("rev-parse", "--git-common-dir")) !== path.join(root, ".git") ||
      !fs.lstatSync(path.join(root, ".git")).isDirectory()) throw new Error("prepared publication requires an isolated clone, not a shared worktree");
  const info = path.join(root, ".git/info"); realDirectory(info);
  const exclude = path.join(info, "exclude");
  let previous = "";
  if (fs.existsSync(exclude)) {
    const stat = fs.lstatSync(exclude);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 65536) throw new Error("unsafe clone-local excludes");
    previous = fs.readFileSync(exclude, "utf8");
  }
  if (!previous.split(/\r?\n/).includes("/release/")) fs.appendFileSync(exclude, "\n# Prepared publication outputs in this isolated consumer only\n/release/\n");
}
async function runPrepared(options, dependencies = {}) {
  options.signal?.throwIfAborted();
  const request = validateRequest(options.request);
  if (typeof options.publish !== "boolean") throw new Error("explicit publication choice required");
  const root = path.resolve(options.candidateRoot), cache = path.resolve(options.directory);
  realDirectory(cache); configureConsumer(root, request.sourceRevision);
  if (cache === root || cache.startsWith(root + path.sep)) throw new Error("prepared artifact cache must be outside the product clone");
  const version = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
  if (request.tag.split("+")[0] !== `v${version}`) throw new Error("product version differs from requested release tag");
  const github = dependencies.github ?? githubClient();
  // Verification-only is valid before a tag exists. Publication never creates
  // or moves a tag and rejects mismatches before downloading large products.
  if (options.publish) {
    if (await github.resolveTag(request.tag) !== request.sourceRevision) throw new Error("publication requires the existing exact source tag");
    execFileSync("git", ["merge-base", "--is-ancestor", request.sourceRevision, "origin/main"], { cwd: root, timeout: 10000, stdio: "pipe" });
  }
  const unlock = acquireLock(path.join(cache, "prepared-promotion.lock"));
  try {
    const product = { sha: request.sourceRevision, ref: request.sourceRef, event: request.sourceEvent, purpose: request.purpose };
    async function controlArchive(pins, contract, name, validate) {
      return replaceDirectory({ parent: cache, name: `${name}-${pins.artifactId}`, signal: options.signal,
        async prepare(pending) {
          const { artifact } = inspectControlArtifact(pins, contract, dependencies.api);
          requireDownloadSpace(pending, artifact.size_in_bytes);
          await (dependencies.download ?? downloadGithubArchive)({ id: artifact.id, sizeInBytes: artifact.size_in_bytes }, path.join(pending, "control.zip"), { signal: options.signal });
        },
        validate(pending) {
          const filename = path.join(pending, "control.zip");
          validate(filename); return filename;
        },
      });
    }
    const handoff = await controlArchive(request.handoff, handoffContract, "handoff", filename =>
      verifyHandoffArchive({ ...request.handoff, ...product, filename }, dependencies.api));
    const macos = await controlArchive(request.macos, macosContract, "macos", filename => {
      // Full native observation authentication occurs inside preparePromotion,
      // after independently reconstructing its expected product request.
      const { artifact } = inspectControlArtifact(request.macos, macosContract, dependencies.api);
      const stat = fs.lstatSync(filename);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size !== artifact.size_in_bytes ||
          `sha256:${fileDigest(filename)}` !== artifact.digest) throw new Error("native observation archive differs from pinned transport");
    });
    const prepared = await (dependencies.prepare ?? preparePromotion)({ ...request.handoff, ...product,
      filename: handoff.value, directory: cache, candidateRoot: root, signal: options.signal,
      macos: { ...request.macos, filename: macos.value, teamId: "BVF94G2MB4",
        verifierSha256: fileDigest(path.join(__dirname, "macos-installer.cjs")) },
    }, dependencies.preparation);
    if (prepared.status !== "product-artifacts-authenticated" || prepared.productIdentity?.sourceRevision !== request.sourceRevision) throw new Error("complete product artifact authentication required");
    const resultFile = path.join(cache, "prepared-promotion.json");
    const result = { schema: "sagejs.prepared-promotion/v1", request, productIdentity: prepared.productIdentity, status: "verified-only" };
    atomicJson(resultFile, result);
    if (!options.publish) return result;
    options.signal?.throwIfAborted();
    // All retries pass preparation again. Stage journals may reuse verified
    // inputs, but a saved success JSON is never publication authority.
    const journals = path.join(cache, "publication"); realDirectory(journals, !fs.existsSync(journals));
    const shared = { tag: request.tag, source: request.sourceRevision, signal: options.signal };
    const unlockProducts = acquireLock(path.join(root, "build/release-publication/active.lock"));
    function assertPrepared() {
      options.signal?.throwIfAborted(); identity(root, request.sourceRevision);
      for (const file of prepared.files) {
        const filename = path.join(root, file.path), stat = fs.lstatSync(filename);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size !== file.size || fileDigest(filename) !== file.sha256) throw new Error("qualified inputs changed before publication");
      }
    }
    try {
      assertPrepared();
      await (dependencies.upload ?? publishGithubAssets)({ ...shared, directory: path.join(root, "release"), notes: path.join(root, "RELEASE_NOTES.md"), journal: path.join(journals, "github.json") }, dependencies.publication?.github);
      assertPrepared();
      await (dependencies.npm ?? publishNpmPackages)({ ...shared, directory: path.join(root, "release/npm"), journal: path.join(journals, "npm.json") }, dependencies.publication?.npm);
      assertPrepared();
      await (dependencies.finalize ?? finalizeGithubRelease)({ ...shared, root, journal: path.join(journals, "finalization.json") }, dependencies.publication);
      assertPrepared();
      result.status = "github-and-npm-promoted"; atomicJson(resultFile, result); return result;
    } finally { unlockProducts(); }
  } finally { unlock(); }
}
if (require.main === module) {
  const controller = new AbortController(), stop = () => controller.abort();
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
  (async () => {
    const selected = requestFromInputs(JSON.parse(process.env.SAGEJS_RELEASE_INPUTS ?? "{}"));
    if (process.argv[2] === "admit" && process.argv.length === 3) { console.log(JSON.stringify(selected.request)); return; }
    if (process.argv.length !== 4) throw new Error("specify product clone and artifact cache");
    console.log(JSON.stringify(await runPrepared({ ...selected, candidateRoot: process.argv[2], directory: process.argv[3], signal: controller.signal })));
  })().catch(() => { console.error("Prepared promotion failed; inspect retained verification logs and publication journals. No rebuild was requested."); process.exitCode = 1; })
    .finally(() => { process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop); });
}
module.exports = { validateRequest, requestFromInputs, configureConsumer, runPrepared };
