"use strict";

// Source/provenance adapter for reviewed upstream unittest selections. Execution
// stays in run-pure-python-packages.cjs with its existing wheel and host evidence.
const { lstatSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { dirname, isAbsolute, join } = require("node:path");
const { canonical, executionBytes, sha256, snapshotSource } = require("../tools/python-compat/evidence.cjs");
const { safePath } = require("../tools/python-compat/manifest.cjs");

const digest = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
function requireSuite(condition, message) {
  if (!condition) throw new Error(`upstream package suite: ${message}`);
}

function regularPath(root, relative, directory = false) {
  const parts = safePath(relative).split("/");
  for (let index = 1; index <= parts.length; index++) {
    const status = lstatSync(join(root, ...parts.slice(0, index)));
    requireSuite(!status.isSymbolicLink() &&
      ((index < parts.length || directory) ? status.isDirectory() : status.isFile()),
    `linked, missing or non-regular input ${relative}`);
  }
  return join(root, ...parts);
}

function readText(root, path, expected) {
  requireSuite(digest(expected), `invalid digest for ${path}`);
  const bytes = readFileSync(regularPath(root, path));
  const source = bytes.toString("utf8");
  requireSuite(sha256(bytes) === expected && bytes.equals(Buffer.from(source)), `source drift ${path}`);
  return source;
}

function loadSuiteSelection(root, entry) {
  const declaration = entry.upstreamSuite;
  requireSuite(declaration && typeof declaration === "object", `${entry.name}: missing declaration`);
  const selection = JSON.parse(readText(root, declaration.path, declaration.sha256));
  requireSuite(selection.schema === "sagejs.python-package-suite-selection/v1", "unsupported selection schema");
  requireSuite(["name", "version", "wheel", "sha256"].every((key) => selection.package?.[key] === entry[key]) &&
    canonical(selection.package.dependencies) === "[]", "wheel identity or dependency closure mismatch");
  const selected = selection.selection;
  requireSuite(selected && /^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/.test(selected.module) &&
    /^[A-Za-z_]\w*$/.test(selected.class), "invalid selected test class");
  const prefix = `${selected.module}.${selected.class}.`;
  requireSuite(Array.isArray(selected.testIds) && selected.testIds.length > 0 &&
    selected.testIds.every((id) => typeof id === "string" && id.startsWith(prefix) &&
      /^test_\w+$/.test(id.slice(prefix.length))) &&
    new Set(selected.testIds).size === selected.testIds.length &&
    selected.expectedCount === selected.testIds.length &&
    selected.allMethodsInSelectedClass === true && selected.disposition === "required" &&
    canonical(selected.expectedSkips) === "[]", "invalid selection IDs, counts or skip contract");
  requireSuite(selection.comparison === "unittest-required-count-and-origin" &&
    canonical(selection.runtimeCapabilities) === canonical(["filesystem:temporary"]) &&
    canonical(selection.targets) === canonical(["node"]), "unsupported comparison or host contract");
  requireSuite(selection.timeoutMs === 30000 && selection.maxOutputBytes === 1048576,
    "unsupported resource bounds");
  const source = selection.source;
  requireSuite(source?.manifest === "SOURCE.json", "missing SOURCE.json");
  const directory = regularPath(root, source.root, true);
  const provenance = JSON.parse(readText(directory, source.manifest, source.sha256));
  requireSuite(provenance.schema === "sagejs.python-suite-source/v1" &&
    /^[a-f0-9]{40}$/.test(provenance.revision) &&
    typeof provenance.repository === "string" && provenance.repository.startsWith("https://") &&
    typeof provenance.license === "string" && provenance.license.length > 0 &&
    provenance.version === entry.version && Array.isArray(provenance.files), "missing upstream provenance");
  const inventory = new Map();
  for (const file of provenance.files) {
    safePath(file.path);
    safePath(file.upstreamPath);
    requireSuite(!inventory.has(file.path.toLowerCase()) && digest(file.sha256) &&
      Number.isSafeInteger(file.bytes) && file.bytes > 0, "invalid upstream inventory");
    inventory.set(file.path.toLowerCase(), file);
  }
  requireSuite(inventory.has("license"), "missing license bytes");
  const tree = snapshotSource(directory);
  const actual = tree.files.filter((file) => file.path !== source.manifest);
  requireSuite(actual.length === inventory.size && actual.every((file) => {
    const expected = inventory.get(file.path.toLowerCase());
    return expected && file.path === expected.path && file.bytes === expected.bytes && file.sha256 === expected.sha256;
  }), "upstream inventory drift");
  requireSuite(Array.isArray(selection.fixtures) && selection.fixtures.length > 0,
    "missing fixture closure");
  const destinations = new Set();
  const fixtures = selection.fixtures.map((fixture) => {
    safePath(fixture.path);
    safePath(fixture.destination);
    // This tranche preserves the original import package layout. No flattening,
    // renamed modules, arbitrary data paths, or hidden extra support packages.
    requireSuite(fixture.path === fixture.destination && fixture.path.endsWith(".py") &&
      !destinations.has(fixture.destination.toLowerCase()) && inventory.has(fixture.path.toLowerCase()),
    "invalid fixture destination or duplicate fixture");
    destinations.add(fixture.destination.toLowerCase());
    return { ...fixture, ...inventory.get(fixture.path.toLowerCase()) };
  });
  requireSuite(fixtures.length === actual.length - 1 &&
    fixtures.some((fixture) => fixture.destination === selected.module.replaceAll(".", "/") + ".py") &&
    fixtures.some((fixture) => fixture.destination === selected.module.split(".")[0] + "/__init__.py"),
  "incomplete test package fixture closure");
  const driverSource = readText(root, selection.driver.path, selection.driver.sha256);
  requireSuite(driverSource.endsWith("\n"), "invalid driver source");
  return { root, entry, selection, directory, fixtures, driverSource,
    provenance: { selectionSha256: declaration.sha256, sourceSha256: source.sha256,
      sourceTree: tree, driverSha256: selection.driver.sha256, upstream: provenance } };
}

function selectionUnchanged(suite) {
  try { return canonical(loadSuiteSelection(suite.root, suite.entry).provenance) === canonical(suite.provenance); }
  catch { return false; }
}

function prepareSuiteCase(suite, entry, directory) {
  requireSuite(selectionUnchanged(suite), "selection changed before staging");
  const fixtureDirectory = join(directory, "upstream-suite");
  mkdirSync(fixtureDirectory);
  for (const fixture of suite.fixtures) {
    const destination = join(fixtureDirectory, ...fixture.destination.split("/"));
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, readText(suite.directory, fixture.path, fixture.sha256));
  }
  // The driver itself asserts exact discovery, execution, and all nonpass result
  // buckets. Report the observed count and fixture origins as additional evidence;
  // a successful but truncated/empty suite must not satisfy the outer runner.
  let source = `EXPECTED_TEST_IDS = ${JSON.stringify(suite.selection.selection.testIds)}\n` +
    suite.driverSource + 'print("__SAGEJS_SUITE_COUNT__=" + str(result.testsRun))\n' +
    'print("__SAGEJS_SUITE_IDS__=" + ",".join(result.test_ids))\n';
  let stdout = `__SAGEJS_SUITE_COUNT__=${suite.selection.selection.expectedCount}\n` +
    `__SAGEJS_SUITE_IDS__=${suite.selection.selection.testIds.join(",")}\n`;
  for (const fixture of suite.fixtures) {
    const module = fixture.destination.replace(/\/__init__\.py$/, "").replace(/\.py$/, "").replaceAll("/", ".");
    const prefix = `__SAGEJS_SUITE_FIXTURE__=${module}=`;
    source += `print(${JSON.stringify(prefix)} + __import__(${JSON.stringify(module)}, fromlist=['__file__']).__file__)\n`;
    stdout += prefix + join(fixtureDirectory, ...fixture.destination.split("/")) + "\n";
  }
  return { entry: { ...entry, source, stdout }, fixtureDirectory };
}

function snapshotSuiteCase(suite, directory, programSha256) {
  const snapshot = snapshotSource(directory);
  const expected = [{ path: "case.py", sha256: programSha256 },
    ...suite.fixtures.map((fixture) => ({ path: fixture.destination, sha256: fixture.sha256 }))];
  requireSuite(snapshot.files.length === expected.length && expected.every((file) =>
    snapshot.files.some((actual) => actual.path === file.path && actual.sha256 === file.sha256)),
  "staged fixture or adapter drift");
  requireSuite(selectionUnchanged(suite), "original selection or driver drift");
  return snapshot;
}

function suiteCaseUnchanged(suite, result) {
  if (!result?.sourceUnchanged) return false;
  try { snapshotSuiteCase(suite, result.suite.fixtureDirectory, result.sourceSha256); return true; }
  catch { return false; }
}

function checkSuiteWorkflow(execution, suite, entry, target, fixtureDirectory,
  { failureKind, checkWorkflow, resolvePath }) {
  const failure = failureKind(execution);
  if (failure) return { kind: failure };
  const bytes = executionBytes(execution, "stdout");
  const stdout = bytes.toString("utf8");
  if (!bytes.equals(Buffer.from(stdout)) || bytes.includes(13)) return { kind: "output-mismatch" };
  const lines = stdout.split("\n");
  if (lines.shift() !== `__SAGEJS_SUITE_COUNT__=${suite.selection.selection.expectedCount}`) {
    return { kind: "suite-count-mismatch" };
  }
  if (lines.shift() !== `__SAGEJS_SUITE_IDS__=${suite.selection.selection.testIds.join(",")}`) {
    return { kind: "suite-ids-mismatch" };
  }
  for (const fixture of suite.fixtures) {
    const module = fixture.destination.replace(/\/__init__\.py$/, "").replace(/\.py$/, "").replaceAll("/", ".");
    const prefix = `__SAGEJS_SUITE_FIXTURE__=${module}=`;
    const line = lines.shift();
    if (!line?.startsWith(prefix)) return { kind: "fixture-origin-mismatch" };
    const actual = line.slice(prefix.length);
    try {
      // Named path-identity comparison permits native separators and resolved
      // temporary-directory aliases, without rewriting or discarding raw bytes.
      if (!isAbsolute(actual) || resolvePath(actual) !== resolvePath(join(fixtureDirectory, fixture.destination))) {
        return { kind: "fixture-origin-mismatch" };
      }
    } catch { return { kind: "fixture-origin-mismatch" }; }
  }
  const remainder = lines.join("\n");
  return checkWorkflow({ ...execution, stdout: remainder,
    raw: { ...execution.raw, stdout: Buffer.from(remainder).toString("base64") } },
  { ...entry, stdout: "" }, target, resolvePath);
}

module.exports = { loadSuiteSelection, selectionUnchanged, prepareSuiteCase, snapshotSuiteCase, suiteCaseUnchanged, checkSuiteWorkflow };
