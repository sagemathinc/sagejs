#!/usr/bin/env node
"use strict";

// Read-only with respect to GitHub and public services. The protected app
// workflow owns staging/upload/activation; this controller owns product inputs.
const fs = require("node:fs"), path = require("node:path");
const { validateBrowserRequest, configureConsumer, controlArchive, assertPreparedFiles } = require("./publish-prepared.cjs");
const { contract, verifyHandoffArchive, prepareHandoff } = require("./artifact-handoff.cjs");
const { prepareBrowserDeployment, browserKeys, projection, checkConsumer } = require("./prepare-publication.cjs");
const { acquireLock, atomicJson } = require("./runner.cjs");
const { realDirectory } = require("./directory-transaction.cjs");

function requestFromInputs(inputs) {
  if (typeof inputs?.prepared_request !== "string" || !inputs.prepared_request || inputs.prepared_request.length > 8192 ||
      !["preview", "production"].includes(inputs.target) ||
      (inputs.target === "preview" && !/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/.test(inputs.preview_name ?? ""))) throw new Error("explicit frozen browser request and valid deployment target required");
  return validateBrowserRequest(JSON.parse(inputs.prepared_request));
}

async function runBrowser(options, dependencies = {}) {
  options.signal?.throwIfAborted();
  const request = validateBrowserRequest(options.request);
  if (!["prepare", "recheck"].includes(options.action)) throw new Error("explicit prepare or recheck action required");
  const root = path.resolve(options.candidateRoot), cache = path.resolve(options.directory);
  realDirectory(cache); configureConsumer(root, request.sourceRevision);
  if (cache === root || cache.startsWith(root + path.sep)) throw new Error("browser artifact cache must be outside the product clone");
  if (`v${JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version}` !== request.tag.split("+")[0]) throw new Error("browser version differs from requested tag");
  const unlock = acquireLock(path.join(cache, "prepared-promotion.lock"));
  try {
    const product = { sha: request.sourceRevision, ref: request.sourceRef, event: request.sourceEvent, purpose: request.purpose };
    const handoff = await controlArchive(cache, request.handoff, contract, "handoff", filename =>
      verifyHandoffArchive({ ...request.handoff, ...product, filename }, dependencies.api), dependencies, options.signal);
    const preparation = { ...request.handoff, ...product, filename: handoff.value, directory: cache, candidateRoot: root, signal: options.signal };
    if (options.action === "recheck") {
      // Derive expected bytes again from authenticated transport, not a saved
      // success JSON. Never repair changed candidate inputs before activation:
      // the already staged app might have consumed the changed bytes.
      const unlockProducts = acquireLock(path.join(root, "build/release-publication/active.lock"));
      try {
        const accepted = await prepareHandoff({ ...preparation, keys: browserKeys }, dependencies.preparation);
        checkConsumer(root, request.sourceRevision, accepted.manifest.manifestDigest);
        const files = projection(accepted.expanded).map(({ target, size, sha256 }) => ({ path: target, size, sha256 }));
        assertPreparedFiles(root, request.sourceRevision, files, options.signal);
        return { status: "browser-inputs-unchanged", sourceRevision: request.sourceRevision, manifestDigest: accepted.manifest.manifestDigest };
      } finally { unlockProducts(); }
    }
    const prepared = await prepareBrowserDeployment(preparation, dependencies.preparation);
    if (prepared.status !== "browser-deployment-inputs-authenticated" || prepared.productIdentity.sourceRevision !== request.sourceRevision) throw new Error("browser input authentication required");
    const result = { schema: "sagejs.prepared-browser/v1", request, productIdentity: prepared.productIdentity,
      selectedBrowser: prepared.selectedBrowser, status: prepared.status,
      authority: "verified browser inputs only; not native installer qualification or deployment success" };
    atomicJson(path.join(cache, "prepared-browser.json"), result);
    return result;
  } finally { unlock(); }
}

if (require.main === module) {
  const controller = new AbortController(), stop = () => controller.abort();
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
  (async () => {
    const request = requestFromInputs(JSON.parse(process.env.SAGEJS_BROWSER_INPUTS ?? "{}"));
    const [action, candidateRoot, directory] = process.argv.slice(2);
    if (action === "admit" && process.argv.length === 3) { console.log(JSON.stringify(request)); return; }
    if (process.argv.length !== 5) throw new Error("specify action, product clone and artifact cache");
    console.log(JSON.stringify(await runBrowser({ request, action, candidateRoot, directory, signal: controller.signal })));
  })().catch(() => { console.error("Frozen browser preparation failed; inspect retained verification logs. No deployment was requested by this controller."); process.exitCode = 1; })
    .finally(() => { process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop); });
}
module.exports = { requestFromInputs, runBrowser };
