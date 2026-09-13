#!/usr/bin/env node
"use strict";

// Final step of the already-gated publisher. This is not qualification, and
// never creates a tag, uploads/replaces an asset or writes to npm. Its sole
// remote mutation is publishing the selected existing release and making it
// Latest, after independently re-reading local bytes and remote product state.
const fs = require("node:fs"), path = require("node:path");
const { atomicJson, acquireLock } = require("./runner.cjs");
const { realDirectory } = require("./directory-transaction.cjs");
const { githubClient, localInputs, reconcile } = require("./publish-github-assets.cjs");
const { npmClient, readInputs, fileIdentity, verifyVersion } = require("./publish-npm-packages.cjs");
const { parseProductTag, compareProductTags, hasCompleteInstallerAssets } = require("../release-latest-policy.cjs");
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const positive = (x) => Number.isSafeInteger(x) && x > 0;
function releaseIdentity(release, tag, id) {
  if (!positive(release?.id) || release.tag_name !== tag || typeof release.draft !== "boolean" || release.prerelease !== false ||
      (id !== undefined && release.id !== id)) throw new Error("selected release disappeared or changed identity");
}
function requireNotSuperseded(tag, latest, releases) {
  const selected = parseProductTag(tag);
  if (!Array.isArray(releases)) throw new Error("invalid GitHub release inventory");
  if (latest !== null && (!positive(latest?.id) || typeof latest.tag_name !== "string" || latest.draft !== false || latest.prerelease !== false)) throw new Error("invalid GitHub Latest state");
  const publicProducts = releases.filter((release) => release.draft === false && release.prerelease === false && hasCompleteInstallerAssets(release));
  for (const release of [...publicProducts, ...(latest ? [latest] : [])]) {
    const product = parseProductTag(release.tag_name);
    if (product && compareProductTags(product, selected) > 0) throw new Error(`newer GitHub product ${release.tag_name} exists; refusing stale promotion`);
  }
}

async function finalizeGithubRelease(options, clients, checkpoint = () => {}) {
  options.signal?.throwIfAborted();
  const match = /^v((?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*))(?:\+release\.[1-9][0-9]*)?$/.exec(options.tag ?? "");
  if (!match || !/^[0-9a-f]{40}$/.test(options.source ?? "")) throw new Error("exact product tag and source SHA required");
  const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(15 * 60 * 1000)]) : AbortSignal.timeout(15 * 60 * 1000);
  if (!clients) {
    const limitedFetch = (url, init) => fetch(url, { ...init, signal: AbortSignal.any([signal, init.signal]) });
    const github = githubClient(limitedFetch);
    clients = { github, npm: npmClient(limitedFetch, undefined, github) };
  }
  const root = path.resolve(options.root), directory = path.join(root, "release"), notes = path.join(root, "RELEASE_NOTES.md");
  realDirectory(root);
  const inputs = { github: localInputs(directory, notes), npm: readInputs(path.join(directory, "npm"), match[1]) };
  const binding = { repository: "sagemathinc/sagejs", tag: options.tag, source: options.source, inputs };
  const journalPath = path.resolve(options.journal ?? path.join(root, "release-finalization.json"));
  realDirectory(path.dirname(journalPath));
  const unlock = acquireLock(`${journalPath}.lock`);
  let journal = { schema: "sagejs.github-finalization/v1", binding, releaseId: null, phase: "checking" };
  function save(phase) { journal.phase = phase; atomicJson(journalPath, journal); checkpoint(phase, journal); }
  function checkLocal() {
    if (!same(localInputs(directory, notes), inputs.github)) throw new Error("local GitHub promotion inputs changed");
    for (const record of inputs.npm) {
      if (!same(fileIdentity(path.join(directory, "npm", record.archive)), { bytes: record.bytes, integrity: record.integrity })) throw new Error("local npm promotion inputs changed");
    }
  }
  async function observe() {
    signal.throwIfAborted();
    if (await clients.github.resolveTag(options.tag) !== options.source) throw new Error("release tag changed before promotion");
    const release = await clients.github.findRelease(options.tag);
    releaseIdentity(release, options.tag, journal.releaseId ?? undefined);
    const assets = reconcile(inputs.github.assets, await clients.github.listAssets(release.id));
    if (assets.some((asset) => asset.remoteId === null)) throw new Error("missing GitHub asset; finalization cannot upload it");
    // Keep registry reads bounded at four in flight and perform no npm writes.
    for (const records of [inputs.npm.slice(0, 4), inputs.npm.slice(4)]) {
      const ready = await Promise.all(records.map(async (record) => verifyVersion(record, await clients.npm.version(record, signal))));
      if (!ready.every(Boolean)) throw new Error("missing public npm version; finalization cannot publish it");
    }
    if ((await clients.npm.tags(inputs.npm[4].name, signal))?.latest !== match[1]) throw new Error("npm latest is not the selected version; refusing GitHub promotion");
    checkLocal();
    // Check mutable GitHub state after the potentially slower byte/registry
    // inspection. There is no cross-service compare-and-swap: participating
    // writers must hold the shared publication lock; manual writers do not.
    const current = await clients.github.findRelease(options.tag);
    releaseIdentity(current, options.tag, release.id);
    const latest = await clients.github.latestRelease();
    requireNotSuperseded(options.tag, latest, await clients.github.listReleases());
    if (latest?.id === current.id && (latest.tag_name !== options.tag || current.draft)) throw new Error("inconsistent selected release and Latest state; retry inspection");
    if (await clients.github.resolveTag(options.tag) !== options.source) throw new Error("release tag changed during inspection");
    return { release: current, latest, assets };
  }
  try {
    if (fs.existsSync(journalPath)) {
      const stat = fs.lstatSync(journalPath);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 1024 * 1024) throw new Error("unsafe finalization journal");
      const previous = JSON.parse(fs.readFileSync(journalPath, "utf8"));
      if (previous.schema !== journal.schema || !same(previous.binding, binding) || !positive(previous.releaseId)) throw new Error("finalization journal has different or invalid inputs");
      journal.releaseId = previous.releaseId;
    }
    const before = await observe(); journal.releaseId = before.release.id;
    save("ready");
    if (before.release.draft || before.latest?.id !== before.release.id) {
      save("promoting");
      signal.throwIfAborted();
      await clients.github.makePublicLatest(before.release.id);
      checkpoint("remote-promoted", journal);
    }
    const after = await observe();
    if (after.release.draft || after.latest?.id !== after.release.id) throw new Error("GitHub promotion is not observable; retry reconciliation without rebuilding");
    if (!same(before.assets, after.assets)) throw new Error("asset identities changed during promotion");
    save("github-and-npm-promoted");
    return journal;
  } finally { unlock(); }
}
if (require.main === module) {
  finalizeGithubRelease({ root: process.cwd(), tag: process.env.GITHUB_REF_NAME, source: process.env.GITHUB_SHA })
    .then(() => console.log("Selected GitHub release is public and Latest; exact assets and npm state reverified"))
    .catch((error) => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { finalizeGithubRelease, requireNotSuperseded };
