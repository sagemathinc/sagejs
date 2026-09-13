#!/usr/bin/env node
"use strict";

// Runs inside ci.yml's existing Trusted Publishing job, AFTER qualification.
// npm publish is the only write operation. OIDC does not authorize a separate
// dist-tag repair; never manufacture such a capability or repack an archive.
const fs = require("node:fs"), path = require("node:path");
const { createHash } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { setTimeout: delay } = require("node:timers/promises");
const { atomicJson, acquireLock } = require("./runner.cjs");
const { realDirectory } = require("./directory-transaction.cjs");
const { runBufferedCommand } = require("../build-parallelism.cjs");
const { githubClient } = require("./publish-github-assets.cjs");
const packages = Object.freeze([
  ["sagejs-linux-x64.tgz", "@sagemath/sagejs-linux-x64", "linux-x64"],
  ["sagejs-linux-arm64.tgz", "@sagemath/sagejs-linux-arm64", "linux-arm64"],
  ["sagejs-windows-x64.tgz", "@sagemath/sagejs-win32-x64", "windows-x64"],
  ["sagejs-macos-arm64.tgz", "@sagemath/sagejs-darwin-arm64", "macos-arm64"],
  ["sagejs.tgz", "@sagemath/sagejs", "latest"],
].map(([archive, name, tag]) => Object.freeze({ archive, name, tag })));
const registry = "https://registry.npmjs.org/";
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function versionParts(version) {
  if (!/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(version ?? "")) throw new Error("stable numeric npm version required");
  const parts = version.split(".").map(Number);
  if (!parts.every(Number.isSafeInteger)) throw new Error("npm version outside safe integer range");
  return parts;
}
function compareVersions(a, b) {
  const left = versionParts(a), right = versionParts(b);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return Math.sign(left[i] - right[i]);
  return 0;
}
function fileIdentity(filename) {
  const stat = fs.lstatSync(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size <= 0 || stat.size > 2 * 1024 ** 3 || fs.realpathSync(filename) !== filename) throw new Error("npm archive must be an ordinary bounded file");
  const hash = createHash("sha512"), fd = fs.openSync(filename, "r"), buffer = Buffer.allocUnsafe(1024 * 1024);
  try { for (;;) { const count = fs.readSync(fd, buffer, 0, buffer.length, null); if (!count) break; hash.update(buffer.subarray(0, count)); } }
  finally { fs.closeSync(fd); }
  return { bytes: stat.size, integrity: `sha512-${hash.digest("base64")}` };
}
function readInputs(directory, version) {
  realDirectory(directory); versionParts(version);
  const env = { ...process.env }; delete env.TAR_OPTIONS; delete env.GZIP;
  return packages.map((entry) => {
    const filename = path.join(directory, entry.archive), identity = fileIdentity(filename);
    // Bounded metadata read, no extraction, installation, lifecycle or repack.
    const metadata = JSON.parse(execFileSync("tar", ["-xOzf", filename, "package/package.json"], {
      encoding: "utf8", env, timeout: 120000, maxBuffer: 1024 * 1024, stdio: ["ignore", "pipe", "pipe"],
    }));
    if (metadata.name !== entry.name || metadata.version !== version || metadata.private === true ||
        (metadata.publishConfig !== undefined && (!metadata.publishConfig || typeof metadata.publishConfig !== "object" || Array.isArray(metadata.publishConfig) ||
          Object.entries(metadata.publishConfig).some(([key, value]) => key !== "access" || value !== "public")))) throw new Error(`npm metadata/publish configuration differs from expected product: ${entry.archive}`);
    if (entry.tag === "latest" && packages.slice(0, -1).some((item) => metadata.optionalDependencies?.[item.name] !== version)) throw new Error("root package must pin all four exact platform versions");
    if (!same(fileIdentity(filename), identity)) throw new Error("npm archive changed during metadata inspection");
    return { ...entry, version, ...identity };
  });
}
function verifyVersion(record, remote) {
  if (remote === null) return false;
  if (remote?.name !== record.name || remote.version !== record.version || remote.dist?.integrity !== record.integrity) throw new Error(`immutable npm version conflicts with qualified bytes: ${record.name}@${record.version}`);
  return true;
}

async function publishNpmPackages(options, api = npmClient(), checkpoint = () => {}) {
  options.signal?.throwIfAborted();
  const match = /^v((?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*))(?:\+release\.[1-9][0-9]*)?$/.exec(options.tag ?? "");
  if (!match || !/^[0-9a-f]{40}$/.test(options.source ?? "")) throw new Error("exact product tag and full source SHA required");
  const directory = path.resolve(options.directory), journalPath = path.resolve(options.journal);
  realDirectory(path.dirname(journalPath));
  const inputs = readInputs(directory, match[1]);
  const binding = { registry, tag: options.tag, source: options.source, packages: inputs };
  const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(45 * 60 * 1000)]) : AbortSignal.timeout(45 * 60 * 1000);
  const unlock = acquireLock(`${journalPath}.lock`);
  let journal = { schema: "sagejs.npm-publication/v1", binding, phase: "checking", accepted: [] };
  function save(phase) { journal.phase = phase; atomicJson(journalPath, journal); checkpoint(phase, journal); }
  function checkLocal(record) {
    if (!same(fileIdentity(path.join(directory, record.archive)), { bytes: record.bytes, integrity: record.integrity })) throw new Error(`npm archive changed: ${record.name}`);
  }
  async function checkSource() {
    signal.throwIfAborted();
    if (await api.resolveTag(options.tag) !== options.source) throw new Error("remote release tag changed");
  }
  async function checkLatest(rootExists, requireCurrent = false) {
    const tags = await api.tags(inputs[4].name, signal), latest = tags?.latest;
    if (tags !== null && (typeof tags !== "object" || Array.isArray(tags))) throw new Error("invalid npm dist-tag response");
    if (latest !== undefined && compareVersions(latest, inputs[4].version) > 0) throw new Error("newer npm latest already exists; refusing stale promotion");
    if ((rootExists || requireCurrent) && latest !== inputs[4].version) {
      if (journal.accepted.includes(inputs[4].name)) return false;
      throw new Error("root version exists but latest differs; authenticated channel repair is required (OIDC publish cannot repair dist-tags)");
    }
    return true;
  }
  async function inspect(records) {
    // At most four small registry requests at once. HTTP/auth failures reject;
    // only an actual version-endpoint 404 is a missing observation.
    return Promise.all(records.map(async (record) => verifyVersion(record, await api.version(record, signal))));
  }
  async function waitFor(records) {
    for (let attempt = 0; attempt < 120; attempt++) {
      signal.throwIfAborted();
      const present = await inspect(records);
      if (present.every(Boolean) && (records[0].tag !== "latest" || await checkLatest(true, true))) return;
      const missing = records.filter((_record, index) => !present[index]).map((record) => record.name);
      save(`waiting-for-registry:${missing.length ? missing.join(",") : "root latest"}`);
      if (attempt === 119) throw new Error(`npm scanning/visibility deadline exceeded: ${missing.length ? missing.join(", ") : "root latest"}; retry without rebuilding or perform authenticated channel repair`);
      await api.wait(15000, signal);
    }
  }
  async function uploadMissing(record, exists) {
    if (exists) return;
    // A successful command followed by a scanning delay must not be repeated
    // merely because its immutable version is not yet publicly visible.
    if (journal.accepted.includes(record.name)) return;
    await checkSource(); checkLocal(record); save(`publishing:${record.name}`);
    await api.publish(record, path.join(directory, record.archive), signal);
    journal.accepted.push(record.name); save(`accepted:${record.name}`);
    checkLocal(record);
  }
  try {
    if (fs.existsSync(journalPath)) {
      const stat = fs.lstatSync(journalPath);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 1024 * 1024) throw new Error("unsafe npm publication journal");
      const previous = JSON.parse(fs.readFileSync(journalPath, "utf8"));
      if (previous.schema !== journal.schema || !same(previous.binding, binding) || !Array.isArray(previous.accepted) ||
          new Set(previous.accepted).size !== previous.accepted.length || previous.accepted.some((name) => !inputs.some((record) => record.name === name))) throw new Error("npm publication journal belongs to different inputs or is invalid");
      journal.accepted = previous.accepted;
    }
    await checkSource();
    const present = [...await inspect(inputs.slice(0, 4)), ...await inspect(inputs.slice(4))];
    await checkLatest(present[4]); save("reconciled");
    for (let i = 0; i < 4; i++) await uploadMissing(inputs[i], present[i]);
    await waitFor(inputs.slice(0, 4)); save("platforms-visible");
    await checkSource();
    // Recheck root state after waiting; another publisher may have finished or
    // superseded this candidate. Never advance latest before its dependencies.
    const rootExists = verifyVersion(inputs[4], await api.version(inputs[4], signal));
    await checkLatest(rootExists);
    await uploadMissing(inputs[4], rootExists);
    await waitFor(inputs.slice(4));
    await checkSource();
    if (!(await inspect(inputs.slice(0, 4))).every(Boolean)) throw new Error("platform package disappeared before completion");
    if (!await checkLatest(true, true)) throw new Error("root latest changed before completion; inspect channel state");
    for (const record of inputs) checkLocal(record);
    save("packages-and-root-channel-verified");
    return journal;
  } finally { unlock(); }
}

function npmClient(fetchImplementation = fetch, runCommand = runBufferedCommand, github = githubClient()) {
  async function get(endpoint, signal) {
    const response = await fetchImplementation(`${registry}${endpoint}`, {
      redirect: "error", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000),
      headers: { Accept: "application/json" },
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`public npm registry: HTTP ${response.status}`);
    return response.json();
  }
  return {
    resolveTag: (tag) => github.resolveTag(tag),
    version: (record, signal) => get(`${encodeURIComponent(record.name)}/${record.version}`, signal),
    tags: (name, signal) => get(`-/package/${encodeURIComponent(name)}/dist-tags`, signal),
    wait: (ms, signal) => delay(ms, undefined, { signal }),
    async publish(record, filename, signal) {
      signal.throwIfAborted();
      const aborter = new AbortController(), commandSignal = AbortSignal.any([signal, aborter.signal, AbortSignal.timeout(5 * 60 * 1000)]);
      let outputBytes = 0, errorCode = "unknown";
      const count = (chunk) => {
        outputBytes += chunk.length;
        const code = /npm (?:error|ERR!) code (E[A-Z0-9_]+)/.exec(chunk.toString());
        if (code) errorCode = code[1];
        if (outputBytes > 1024 * 1024) aborter.abort(new Error("npm output limit exceeded"));
      };
      const result = await runCommand("npm", ["publish", filename, "--access", "public", "--tag", record.tag,
        "--ignore-scripts", "--provenance", `--registry=${registry}`], {
        signal: commandSignal, capture: false, onStdout: count, onStderr: count,
      });
      commandSignal.throwIfAborted();
      if (result.status !== 0) throw new Error(`npm publish failed for ${record.name} (exit ${result.status}, code ${errorCode}); inspect registry state before retrying, no further packages were published`);
    },
  };
}
if (require.main === module) {
  publishNpmPackages({ tag: process.env.GITHUB_REF_NAME, source: process.env.GITHUB_SHA,
    directory: "release/npm", journal: "npm-publication.json" }, npmClient(), (phase) => console.log(`[npm publication] ${phase}`))
    .then(() => console.log("All five immutable npm versions and root latest verified"))
    .catch((error) => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { publishNpmPackages, npmClient, readInputs, packages, compareVersions, fileIdentity, verifyVersion };
