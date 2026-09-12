#!/usr/bin/env node
"use strict";

// Prepare only exact GitHub artifact ZIPs. No extraction, compilation, signing,
// registry mutation or promotion occurs here. The manifest digest must be
// supplied through an independently authenticated producer handoff.
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { Transform } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const { acquireLock, atomicJson } = require("./runner.cjs");
const { replaceDirectory, realDirectory, exists } = require("./directory-transaction.cjs");
const { validateArtifactSet, verifyPinnedArtifact, verifyDownloadedArchive } = require("./artifact-set.cjs");

function regularFile(filename) {
  const stat = fs.lstatSync(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error("artifact cache requires an ordinary, unlinked file");
  return stat;
}
function requireDownloadSpace(directory, bytes, statfs = fs.statfsSync) {
  const stats = statfs(directory, { bigint: true });
  // A download-specific floor, not the larger native-build reservation. Work
  // is sequential; previous/failed copies are already charged by statfs.
  if (stats.bavail * stats.bsize < BigInt(bytes) + 64n * 1024n ** 2n ||
      (stats.files > 0n && stats.ffree < 64n)) throw new Error("insufficient artifact download scratch space or inodes");
}
async function downloadGithubArchive(record, filename, { signal, timeoutMs = 600000, spawnProcess = spawn } = {}) {
  signal?.throwIfAborted();
  if (!Number.isSafeInteger(record?.id) || record.id <= 0 || !Number.isSafeInteger(record.sizeInBytes) || record.sizeInBytes <= 0 ||
      !Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 1800000) throw new Error("invalid artifact download bounds");
  const child = spawnProcess("gh", ["api", "--hostname", "github.com",
    `repos/sagemathinc/sagejs/actions/artifacts/${record.id}/zip`], { stdio: ["ignore", "pipe", "ignore"], shell: false });
  let received = 0, escalation;
  const limit = new Transform({ transform(bytes, encoding, callback) {
    received += bytes.length;
    callback(received > record.sizeInBytes ? new Error("artifact download exceeds pinned byte count") : null, bytes);
  } });
  const output = fs.createWriteStream(filename, { flags: "wx" });
  function stop() {
    child.kill("SIGTERM");
    escalation ??= setTimeout(() => child.kill("SIGKILL"), 1000);
    escalation.unref();
    limit.destroy(new Error("artifact download cancelled or timed out"));
  }
  const timer = setTimeout(stop, timeoutMs); timer.unref();
  signal?.addEventListener("abort", stop, { once: true });
  const exit = new Promise((resolve, reject) => {
    child.once("error", () => reject(new Error("cannot start GitHub artifact download")));
    child.once("close", (code) => code === 0 ? resolve() : reject(new Error("GitHub artifact download did not complete")));
  });
  const transfer = pipeline(child.stdout, limit, output);
  if (signal?.aborted) stop();
  try {
    await Promise.all([exit, transfer]);
    if (received !== record.sizeInBytes) throw new Error("artifact download is truncated");
  } catch {
    stop();
    await Promise.allSettled([exit, transfer]);
    // Never print response bodies, signed redirect URLs or CLI credential diagnostics.
    throw new Error("artifact download failed, cancelled, timed out or violated its byte bound");
  } finally {
    clearTimeout(timer); clearTimeout(escalation);
    signal?.removeEventListener("abort", stop);
  }
}

async function stageArtifactSet({ manifest: supplied, expectedDigest, directory, signal, onProgress = () => {},
  download = downloadGithubArchive, verifyRemote = verifyPinnedArtifact, checkSpace = requireDownloadSpace,
  checkpoint = () => {}, keys }) {
  if (!/^sha256:[a-f0-9]{64}$/.test(expectedDigest ?? "")) throw new Error("an independently authenticated manifest digest is required");
  // Do not let a caller mutate the accepted identity while asynchronous work runs.
  const manifest = structuredClone(validateArtifactSet(supplied, expectedDigest));
  // A consumer may need one platform, but the full nine-role manifest is still
  // authenticated above. A subset is never resealed as a complete artifact set.
  if (keys !== undefined && (!Array.isArray(keys) || keys.length === 0 || new Set(keys).size !== keys.length ||
      keys.some((key) => !manifest.artifacts.some((item) => item.key === key)))) throw new Error("explicit nonempty artifact subset contains unknown or duplicate roles");
  const selected = manifest.artifacts.filter((item) => keys === undefined || keys.includes(item.key));
  directory = path.resolve(directory); realDirectory(directory);
  const store = path.join(directory, `set-${expectedDigest.slice(7)}`);
  realDirectory(store, !exists(store));
  const lock = path.join(store, "active.lock");
  if (exists(lock)) regularFile(lock);
  const unlock = acquireLock(lock);
  try {
    const manifestFile = path.join(store, "manifest.json");
    if (exists(manifestFile)) {
      if (regularFile(manifestFile).size > 65536) throw new Error("oversized artifact-set cache manifest");
      validateArtifactSet(JSON.parse(fs.readFileSync(manifestFile, "utf8")), expectedDigest);
    } else atomicJson(manifestFile, manifest);
    const artifacts = [];
    for (const [index, original] of selected.entries()) {
      signal?.throwIfAborted();
      const record = Object.freeze({ ...original });
      onProgress({ index, count: selected.length, key: record.key, state: "checking" });
      const result = await replaceDirectory({ parent: store, name: `artifact-${record.id}`,
        async prepare(pending) {
          signal?.throwIfAborted();
          checkSpace(store, record.sizeInBytes);
          // Missing/corrupt cache entries need current availability; valid cached
          // bytes can be reused after remote expiry using the trusted frozen pin.
          await verifyRemote(manifest, expectedDigest, record.key);
          onProgress({ index, count: selected.length, key: record.key, state: "downloading" });
          await download(record, path.join(pending, "artifact.zip"), { signal });
          signal?.throwIfAborted();
        },
        async validate(candidate) {
          if (fs.readdirSync(candidate).join(",") !== "artifact.zip") throw new Error("artifact cache directory must contain exactly one archive");
          const filename = path.join(candidate, "artifact.zip");
          if (regularFile(filename).size !== record.sizeInBytes) throw new Error("artifact cache byte count mismatch");
          await verifyDownloadedArchive(manifest, expectedDigest, record.key, filename);
          return { key: record.key, archiveDigest: record.archiveDigest };
        },
        checkpoint: (phase) => checkpoint({ key: record.key, phase }),
      });
      signal?.throwIfAborted();
      artifacts.push({ key: record.key, id: record.id, archiveDigest: record.archiveDigest,
        filename: path.join(result.directory, "artifact.zip"), reused: result.reused });
      onProgress({ index, count: selected.length, key: record.key, state: "ready", reused: result.reused });
    }
    return { schema: "sagejs.release-artifact-staging/v1", manifestDigest: expectedDigest,
      status: "archives-staged", artifacts,
      authority: "verified download cache only; not product qualification or publication authorization" };
  } finally { unlock(); }
}

function argumentsFor(args) {
  const allowed = ["--manifest", "--expected-digest", "--directory"], values = {};
  if (args.length !== 6) throw new Error("provide --manifest, --expected-digest and an existing dedicated --directory");
  for (let i = 0; i < args.length; i += 2) {
    if (!allowed.includes(args[i]) || Object.hasOwn(values, args[i]) || !args[i + 1] || args[i + 1].startsWith("--")) throw new Error("invalid artifact staging arguments");
    values[args[i]] = args[i + 1];
  }
  return values;
}
async function main() {
  const args = argumentsFor(process.argv.slice(2));
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.once("SIGINT", cancel); process.once("SIGTERM", cancel);
  try {
    if (regularFile(args["--manifest"]).size > 65536) throw new Error("oversized artifact-set manifest");
    const result = await stageArtifactSet({ manifest: JSON.parse(fs.readFileSync(args["--manifest"], "utf8")),
      expectedDigest: args["--expected-digest"], directory: args["--directory"], signal: controller.signal,
      onProgress: ({ index, count, key, state, reused }) => console.error(`[artifact-stage] ${index + 1}/${count} ${key}: ${state}${reused ? " (reused)" : ""}`),
    });
    console.log(JSON.stringify(result, null, 2));
  } finally { process.removeListener("SIGINT", cancel); process.removeListener("SIGTERM", cancel); }
}
if (require.main === module) main().catch(() => { console.error("Artifact staging failed; verified prior downloads and transaction evidence are retained. No publication occurred."); process.exitCode = 1; });
module.exports = { stageArtifactSet, downloadGithubArchive, requireDownloadSpace, argumentsFor };
