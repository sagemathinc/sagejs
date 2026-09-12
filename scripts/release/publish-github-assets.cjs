#!/usr/bin/env node
"use strict";

// Reconcile uploads, not qualification. Call only after the selected candidate
// and local products have passed the release gates. Journal entries are hints;
// GitHub state and local bytes are checked again on every invocation.
const fs = require("node:fs"), path = require("node:path");
const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { atomicJson, acquireLock, fileDigest } = require("./runner.cjs");
const { realDirectory } = require("./directory-transaction.cjs");
const { requiredInstallerAssets, parseProductTag } = require("../release-latest-policy.cjs");
const repository = "sagemathinc/sagejs";
const positive = (value) => Number.isSafeInteger(value) && value > 0;

function ordinaryFile(filename, limit) {
  const stat = fs.lstatSync(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 ||
      !positive(stat.size) || stat.size > limit || fs.realpathSync(filename) !== filename) {
    throw new Error(`expected bounded ordinary file: ${filename}`);
  }
  return { size: stat.size, digest: `sha256:${fileDigest(filename)}` };
}
function localInputs(directory, notes) {
  realDirectory(directory);
  const assets = requiredInstallerAssets.map((name) => ({ name,
    ...ordinaryFile(path.join(directory, name), name.endsWith(".sha256") ? 256 : name === "install.sh" ? 1024 * 1024 : 2 * 1024 ** 3) }));
  for (const asset of assets.filter((entry) => entry.name.endsWith(".sha256"))) {
    const name = asset.name.slice(0, -7), binary = assets.find((entry) => entry.name === name);
    const checksum = fs.readFileSync(path.join(directory, asset.name), "utf8");
    if (checksum.trim() !== `${binary.digest.slice(7)}  ${name}`) throw new Error(`checksum does not match selected bytes: ${name}`);
  }
  const notesIdentity = ordinaryFile(notes, 1024 * 1024);
  return { assets, notes: notesIdentity };
}
function same(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
function validateRelease(release, tag, id) {
  if (!positive(release?.id) || release.tag_name !== tag || release.prerelease !== false ||
      typeof release.draft !== "boolean" || (id !== undefined && release.id !== id)) {
    throw new Error("release identity changed or is not a product release");
  }
}
function reconcile(assets, remote) {
  if (!Array.isArray(remote)) throw new Error("invalid GitHub asset list");
  return assets.map((asset) => {
    const matches = remote.filter((entry) => entry.name === asset.name);
    if (matches.length > 1) throw new Error(`duplicate remote asset: ${asset.name}`);
    const found = matches[0];
    if (found && (!positive(found.id) || found.state !== "uploaded" || found.size !== asset.size || found.digest !== asset.digest)) {
      throw new Error(`remote asset conflicts with selected bytes: ${asset.name}; preserve it for investigation`);
    }
    return { ...asset, remoteId: found?.id ?? null };
  });
}

async function publishGithubAssets(options, api = githubClient(), checkpoint = () => {}) {
  const { tag, source } = options;
  if (!parseProductTag(tag) || !/^[0-9a-f]{40}$/.test(source ?? "")) throw new Error("exact product tag and full source SHA required");
  const directory = path.resolve(options.directory), notes = path.resolve(options.notes), journalPath = path.resolve(options.journal);
  realDirectory(path.dirname(journalPath));
  const inputs = localInputs(directory, notes);
  const binding = { repository, tag, source, ...inputs };
  const bindingDigest = createHash("sha256").update(JSON.stringify(binding)).digest("hex");
  const unlock = acquireLock(`${journalPath}.lock`);
  let journal = { schema: "sagejs.github-asset-publication/v1", bindingDigest, binding, releaseId: null, phase: "checking", assets: [] };
  function save(phase, assets = journal.assets) {
    journal.phase = phase; journal.assets = assets;
    atomicJson(journalPath, journal); checkpoint(phase, journal);
  }
  function checkLocal() {
    if (!same(localInputs(directory, notes), inputs)) throw new Error("local publication inputs changed");
  }
  async function checkSource() {
    if (await api.resolveTag(tag) !== source) throw new Error("remote tag does not resolve to the selected source");
  }
  try {
    if (fs.existsSync(journalPath)) {
      ordinaryFile(journalPath, 1024 * 1024);
      const previous = JSON.parse(fs.readFileSync(journalPath, "utf8"));
      if (previous.schema !== journal.schema || previous.bindingDigest !== bindingDigest || !same(previous.binding, binding) ||
          (previous.releaseId !== null && !positive(previous.releaseId))) throw new Error("publication journal belongs to different inputs or is invalid");
      journal.releaseId = previous.releaseId;
    }
    await checkSource();
    let release = await api.findRelease(tag);
    if (release === null) {
      if (journal.releaseId !== null) throw new Error("previous release disappeared; refusing to recreate it");
      checkLocal(); save("creating-draft");
      release = await api.createDraft(tag, source, fs.readFileSync(notes, "utf8"));
    }
    validateRelease(release, tag, journal.releaseId ?? undefined);
    journal.releaseId = release.id;
    let records = reconcile(inputs.assets, await api.listAssets(release.id));
    if (!release.draft && records.some((entry) => entry.remoteId === null)) throw new Error("published release is incomplete; refusing to mutate it");
    save("reconciled", records);
    for (const record of records.filter((entry) => entry.remoteId === null)) {
      await checkSource();
      const current = await api.findRelease(tag); validateRelease(current, tag, release.id);
      // Re-list before each upload: another controller may have completed it.
      const latest = reconcile(inputs.assets, await api.listAssets(release.id));
      if (latest.find((entry) => entry.name === record.name).remoteId !== null) continue;
      if (!current.draft) throw new Error("release was published during upload; refusing mutation");
      const checkAsset = () => {
        if (!same(ordinaryFile(path.join(directory, record.name), 2 * 1024 ** 3), { size: record.size, digest: record.digest })) {
          throw new Error(`local publication input changed: ${record.name}`);
        }
      };
      checkAsset(); save(`uploading:${record.name}`, latest);
      await api.upload(tag, path.join(directory, record.name)); // Never --clobber.
      checkpoint("uploaded-before-recording", record);
      checkAsset();
      records = reconcile(inputs.assets, await api.listAssets(release.id));
      if (records.find((entry) => entry.name === record.name).remoteId === null) throw new Error(`upload not observable: ${record.name}; retry to reconcile`);
      save("verified-upload", records);
    }
    await checkSource(); checkLocal();
    validateRelease(await api.findRelease(tag), tag, release.id);
    records = reconcile(inputs.assets, await api.listAssets(release.id));
    if (records.some((entry) => entry.remoteId === null)) throw new Error("release asset set is incomplete");
    save("assets-verified", records);
    return journal;
  } finally { unlock(); }
}

function githubClient(fetchImplementation = fetch, uploadCommand = execFileSync) {
  async function request(endpoint, { method = "GET", body, allowMissing = false } = {}) {
    const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
    if (!token) throw new Error("GitHub authentication required");
    const response = await fetchImplementation(`https://api.github.com/repos/${repository}/${endpoint}`, {
      method, redirect: "error", signal: AbortSignal.timeout(30000),
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json", "User-Agent": "sagejs-release" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (allowMissing && response.status === 404) return null;
    if (!response.ok) throw new Error(`GitHub ${method} ${endpoint}: HTTP ${response.status}`);
    return response.json();
  }
  async function pages(endpoint) {
    const values = [];
    for (let page = 1; page <= 20; page++) {
      const batch = await request(`${endpoint}?per_page=100&page=${page}`);
      if (!Array.isArray(batch)) throw new Error("invalid GitHub inventory page");
      values.push(...batch);
      if (batch.length < 100) return values;
    }
    throw new Error("unexpectedly large release inventory");
  }
  return {
    async resolveTag(tag) { return (await request(`commits/${encodeURIComponent(tag)}`)).sha; },
    async findRelease(tag) {
      const published = await request(`releases/tags/${encodeURIComponent(tag)}`, { allowMissing: true });
      if (published !== null) return published;
      // The by-tag endpoint can omit drafts, even for their authenticated
      // creator. Discover the exact draft through the paginated inventory;
      // otherwise recovery could try to create a second release.
      const matches = (await pages("releases")).filter(entry => entry.tag_name === tag);
      if (matches.length > 1) throw new Error("duplicate releases for selected tag");
      return matches[0] ?? null;
    },
    latestRelease() { return request("releases/latest", { allowMissing: true }); },
    listReleases() { return pages("releases"); },
    makePublicLatest(id) {
      if (!positive(id)) throw new Error("exact release ID required for promotion");
      return request(`releases/${id}`, { method: "PATCH", body: { draft: false, prerelease: false, make_latest: "true" } });
    },
    createDraft(tag, source, body) { return request("releases", { method: "POST", body: {
      tag_name: tag, target_commitish: source, name: `Sage.js ${tag.slice(1)} — early alpha`, body,
      draft: true, prerelease: false, make_latest: "false",
    } }); },
    listAssets(id) { return pages(`releases/${id}/assets`); },
    async upload(tag, filename) {
      uploadCommand("gh", ["release", "upload", tag, filename, "--repo", repository], {
        encoding: "utf8", timeout: 15 * 60 * 1000, maxBuffer: 1024 * 1024, stdio: ["ignore", "pipe", "pipe"],
      });
    },
  };
}
if (require.main === module) {
  publishGithubAssets({ tag: process.env.GITHUB_REF_NAME, source: process.env.GITHUB_SHA,
    directory: "release", notes: "RELEASE_NOTES.md", journal: "release-publication.json" })
    .then((result) => console.log(`Verified ${result.assets.length} exact GitHub assets; journal: release-publication.json`))
    .catch((error) => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { publishGithubAssets, githubClient, localInputs, reconcile };
