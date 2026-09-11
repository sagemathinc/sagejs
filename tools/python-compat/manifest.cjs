"use strict";

const { lstatSync, readFileSync } = require("node:fs");
const { basename, dirname, join } = require("node:path");
const { canonical, sha256, snapshotSource } = require("./evidence.cjs");
const { loadLegacyOutputSuite, comparison: legacyComparison } = require("./legacy-output-manifest.cjs");

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
    const rootBase = declaration.rootBase ?? "manifest";
    requireCondition(["manifest", "upstream-tests"].includes(rootBase), `${id}: unknown root anchor`);
    let anchor = dirname(filename);
    if (rootBase === "upstream-tests") {
      requireCondition(basename(anchor) === "python-compat" &&
        basename(dirname(anchor)) === "upstream-tests", `${id}: invalid upstream-tests anchor layout`);
      anchor = dirname(anchor);
      for (const directory of [anchor, dirname(filename)]) {
        const status = lstatSync(directory);
        requireCondition(status.isDirectory() && !status.isSymbolicLink(), `${id}: linked root anchor`);
      }
    }
    const parts = safePath(declaration.root).split("/");
    for (let count = 1; count <= parts.length; count++) {
      const status = lstatSync(join(anchor, ...parts.slice(0, count)));
      requireCondition(status.isDirectory() && !status.isSymbolicLink(), `${id}: linked suite directory`);
    }
    const directory = join(anchor, ...parts);
    const snapshot = snapshotSource(directory);
    const sourceBytes = readFileSync(join(directory, "SOURCE.json"));
    requireCondition(sha256(sourceBytes) === declaration.sourceSha256, `${id}: SOURCE.json digest differs`);
    const source = JSON.parse(sourceBytes);
    const sourceFormat = declaration.sourceFormat ?? "suite-source-v1";
    requireCondition(["suite-source-v1", "micropython-format-2"].includes(sourceFormat),
      `${id}: unsupported source format`);
    if (sourceFormat === "micropython-format-2") {
      requireCondition(rootBase === "upstream-tests" && declaration.root === "micropython",
        `${id}: legacy source requires the closed MicroPython root`);
      const loaded = loadLegacyOutputSuite({ directory, declaration, source, sourceBytes,
        snapshot, oracle: manifest.oracle, safePath, requireCondition });
      suites[id] = loaded;
      provenance.suites[id] = loaded.provenance;
      continue;
    }
    requireCondition(declaration.comparison === undefined && declaration.baseline === undefined &&
      declaration.reviews === undefined && declaration.executionProfile === undefined,
    `${id}: legacy metadata on an assertion source`);
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
    const legacy = suite.legacyOutput;
    requireCondition(entry.runner === "program" && entry.comparison ===
      (legacy ? legacyComparison : "assertion-exit-empty-output") &&
      entry.mode === "python" && entry.disposition === "required", `${entry.id}: unsupported runner/contract`);
    requireCondition(entry.priority === "P1" && Array.isArray(entry.valueTags) &&
      entry.valueTags.length > 0 && entry.valueTags.every((tag) => typeof tag === "string"),
    `${entry.id}: missing priority/value tags`);
    requireCondition(canonical(entry.capabilities) === canonical(
      [legacy ? "filesystem:corpus" : "filesystem:temporary"]) &&
      canonical(entry.targets) === canonical(["node"]), `${entry.id}: unsupported capability or target`);
    requireCondition(Array.isArray(entry.performanceScopes) &&
      entry.performanceScopes.every((scope) => ["source-compile", "warm-throughput"].includes(scope)),
    `${entry.id}: invalid performance scopes`);
    for (const [field, maximum] of [["timeoutMs", 30_000], ["maxOutputBytes", 4 * 1024 * 1024]]) {
      if (legacy && field === "maxOutputBytes") {
        requireCondition(entry[field] === null, `${entry.id}: legacy profile does not enforce an output cap`);
        continue;
      }
      requireCondition(Number.isSafeInteger(entry[field]) && entry[field] > 0 && entry[field] <= maximum,
        `${entry.id}: invalid ${field}`);
    }
    requireCondition(Array.isArray(entry.fixtures), `${entry.id}: fixture closure must be explicit`);
    if (legacy) {
      requireCondition(entry.fixtures.length === 0 && entry.performanceScopes.length === 0 &&
        legacy.candidates.includes(entry.path.slice("basics/".length)) && entry.path.startsWith("basics/"),
      `${entry.id}: legacy case must use the pinned corpus closure`);
      return { ...entry, directory: suite.directory, executionProfile: legacy.executionProfile };
    }
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
  const outputComparisons = {};
  for (const [id, suite] of Object.entries(suites)) {
    if (!suite.legacyOutput) continue;
    const actual = cases.filter(entry => entry.suite === id).map(entry => entry.path).sort();
    const expected = suite.legacyOutput.candidates.map(name => `basics/${name}`);
    requireCondition(canonical(actual) === canonical(expected), `${id}: incomplete or duplicated legacy case inventory`);
    outputComparisons[id] = suite.legacyOutput;
  }
  return Object.keys(outputComparisons).length
    ? { manifest, cases, provenance, outputComparisons } : { manifest, cases, provenance };
}

module.exports = { loadManifest, safePath };
