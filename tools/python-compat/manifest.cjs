"use strict";

const { lstatSync, readFileSync } = require("node:fs");
const { dirname, join } = require("node:path");
const { canonical, sha256, snapshotSource } = require("./evidence.cjs");

function requireCondition(condition, message) {
  if (!condition) throw new Error(`Python compatibility manifest: ${message}`);
}

function safePath(value) {
  requireCondition(typeof value === "string" && value.length > 0 &&
    value.split("/").every((part) => /^[A-Za-z0-9_.-]+$/.test(part) && !part.endsWith(".") &&
      !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)),
  `unsafe relative path ${JSON.stringify(value)}`);
  return value;
}

function loadManifest(filename) {
  const bytes = readFileSync(filename);
  const manifest = JSON.parse(bytes);
  requireCondition(manifest.schema === "sagejs.python-compat-manifest/v1", "unsupported schema");
  requireCondition(manifest.oracle?.implementation === "CPython" &&
    /^3\.14\.\d+$/.test(manifest.oracle.version), "an exact CPython 3.14 oracle is required");
  requireCondition(manifest.suites && !Array.isArray(manifest.suites) &&
    typeof manifest.suites === "object", "suites must be a mapping");
  const suites = {};
  const provenance = { manifestSha256: sha256(bytes), suites: {} };
  for (const [id, declaration] of Object.entries(manifest.suites)) {
    requireCondition(/^[a-z][a-z0-9-]*$/.test(id), "invalid suite ID");
    const parts = safePath(declaration.root).split("/");
    for (let count = 1; count <= parts.length; count++) {
      const status = lstatSync(join(dirname(filename), ...parts.slice(0, count)));
      requireCondition(status.isDirectory() && !status.isSymbolicLink(), `${id}: linked suite directory`);
    }
    const directory = join(dirname(filename), ...parts);
    const snapshot = snapshotSource(directory);
    const sourceBytes = readFileSync(join(directory, "SOURCE.json"));
    requireCondition(sha256(sourceBytes) === declaration.sourceSha256, `${id}: SOURCE.json digest differs`);
    const source = JSON.parse(sourceBytes);
    requireCondition(source.schema === "sagejs.python-suite-source/v1" &&
      /^[a-f0-9]{40}$/.test(source.revision) &&
      typeof source.repository === "string" && source.repository.startsWith("https://") &&
      typeof source.license === "string" && source.license.length > 0,
    `${id}: missing revision/repository/license provenance`);
    requireCondition(Array.isArray(source.files), `${id}: missing file inventory`);
    const inventory = new Map();
    for (const file of source.files) {
      safePath(file.path);
      safePath(file.upstreamPath);
      requireCondition(!inventory.has(file.path), `${id}: duplicate source file ${file.path}`);
      inventory.set(file.path, file);
    }
    requireCondition(inventory.has("LICENSE"), `${id}: missing license bytes`);
    const actual = snapshot.files.filter((file) => file.path !== "SOURCE.json");
    requireCondition(actual.length === inventory.size, `${id}: source inventory differs`);
    for (const file of actual) {
      const expected = inventory.get(file.path);
      requireCondition(expected?.sha256 === file.sha256 && expected.bytes === file.bytes,
        `${id}: source bytes differ: ${file.path}`);
    }
    suites[id] = { directory, source, inventory };
    provenance.suites[id] = { revision: source.revision, sourceSha256: sha256(sourceBytes),
      inventorySha256: snapshot.sha256 };
  }
  requireCondition(Array.isArray(manifest.cases) && manifest.cases.length > 0, "empty case inventory");
  const seen = new Set();
  const cases = manifest.cases.map((entry) => {
    requireCondition(typeof entry.id === "string" && !seen.has(entry.id) &&
      entry.id.startsWith(`${entry.suite}/`), "invalid or duplicate case ID");
    seen.add(entry.id);
    const suite = suites[entry.suite];
    requireCondition(suite, `${entry.id}: unknown suite`);
    safePath(entry.path);
    const source = suite.inventory.get(entry.path);
    requireCondition(source?.sha256 === entry.sourceSha256 &&
      source.upstreamPath === entry.upstreamPath, `${entry.id}: case source differs`);
    requireCondition(entry.runner === "program" && entry.comparison === "assertion-exit-empty-output" &&
      entry.mode === "python" && entry.disposition === "required", `${entry.id}: unsupported runner/contract`);
    requireCondition(entry.priority === "P1" && Array.isArray(entry.valueTags) &&
      entry.valueTags.length > 0 && entry.valueTags.every((tag) => typeof tag === "string"),
    `${entry.id}: missing priority/value tags`);
    requireCondition(canonical(entry.capabilities) === canonical(["filesystem:temporary"]) &&
      canonical(entry.targets) === canonical(["node"]), `${entry.id}: unsupported capability or target`);
    requireCondition(Array.isArray(entry.performanceScopes) &&
      entry.performanceScopes.every((scope) => ["source-compile", "warm-throughput"].includes(scope)),
    `${entry.id}: invalid performance scopes`);
    for (const [field, maximum] of [["timeoutMs", 30_000], ["maxOutputBytes", 4 * 1024 * 1024]]) {
      requireCondition(Number.isSafeInteger(entry[field]) && entry[field] > 0 && entry[field] <= maximum,
        `${entry.id}: invalid ${field}`);
    }
    requireCondition(Array.isArray(entry.fixtures), `${entry.id}: fixture closure must be explicit`);
    const destinations = new Set(["case.py"]);
    for (const fixture of entry.fixtures) {
      safePath(fixture.path);
      safePath(fixture.destination);
      requireCondition(!fixture.destination.includes("/") && !destinations.has(fixture.destination.toLowerCase()) &&
        suite.inventory.has(fixture.path), `${entry.id}: invalid fixture closure`);
      destinations.add(fixture.destination.toLowerCase());
    }
    return { ...entry, directory: suite.directory };
  });
  return { manifest, cases, provenance };
}

module.exports = { loadManifest, safePath };
