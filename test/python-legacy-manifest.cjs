// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync, symlinkSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");
const { runInThisContext } = require("node:vm");
const { loadManifest } = require("../tools/python-compat/manifest.cjs");
const { sha256, snapshotSource, caseEvidence } = require("../tools/python-compat/evidence.cjs");
const { makeBaselineRecord, applyIntentionalIncompatibilities } = require("../tools/python-compat/output-baseline.cjs");

function fixture(context) {
  const root = mkdtempSync(join(tmpdir(), "sagejs-legacy-manifest-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const directory = join(root, "upstream-tests/micropython");
  const manifestFile = join(root, "upstream-tests/python-compat/manifest.json");
  mkdirSync(join(directory, "basics"), { recursive: true });
  mkdirSync(join(directory, "baselines"));
  mkdirSync(join(root, "upstream-tests/python-compat"));
  const put = (name, value) => writeFileSync(join(directory, name), value);
  const json = (name, value) => put(name, JSON.stringify(value));
  const source = { repository: "https://github.com/micropython/micropython",
    revision: "a".repeat(40), path: "tests/basics", license: "MIT", retrieved: "2026-09-06" };
  json("SOURCE.json", source);
  put("LICENSE", "synthetic license\n");
  put("UPSTREAM-TESTS-README.md", "synthetic readme\n");
  put("basics/pass.py", "print('pass')\n");
  put("basics/review.py", "print('oracle')\n");
  put("basics/excluded.py", "print('excluded')\n");
  put("basics/excluded.py.exp", "excluded\n");
  put("basics/unittest.py", "import unittest\n");
  const digest = name => sha256(readFileSync(join(directory, name)));
  const execution = text => ({ status: 0, signal: null, timedOut: false, error: null,
    stdout: text, stderr: "", output: text });
  const evidence = (name, text) => caseEvidence(digest(`basics/${name}`),
    execution(name === "pass.py" ? "pass\n" : "oracle\n"), execution(text));
  const reference = { implementation: "CPython", version: "3.14.4", majorMinor: "3.14" };
  const reviews = { format: 2, tests: { "review.py": { expectedStatus: "output-mismatch",
    reason: "synthetic explicitly reviewed difference", reference: { implementation: "CPython", version: "3.14.4" },
    evidence: evidence("review.py", "subject\n"), alternateEvidence: [evidence("review.py", "alternate\n")] } } };
  json("INTENTIONAL-INCOMPATIBILITIES.json", reviews);
  const provenance = { sourceMetadataSha256: digest("SOURCE.json"),
    corpus: snapshotSource(join(directory, "basics")), licenseSha256: digest("LICENSE"),
    upstreamReadmeSha256: digest("UPSTREAM-TESTS-README.md"),
    intentionalReviewsSha256: digest("INTENTIONAL-INCOMPATIBILITIES.json") };
  const results = applyIntentionalIncompatibilities([
    {name:"pass.py", status:"pass", evidence:evidence("pass.py", "pass\n")},
    {name:"review.py", status:"output-mismatch", evidence:reviews.tests["review.py"].evidence},
  ], reviews.tests, reference);
  const baseline = makeBaselineRecord(results, reference,
    {expected:["excluded.py"], unittest:["unittest.py"]}, provenance, source);
  json("baselines/3.14.json", baseline);
  const declaration = { rootBase:"upstream-tests", root:"micropython",
    sourceFormat:"micropython-format-2", sourceSha256:digest("SOURCE.json"),
    comparison:"cpython-output-baseline-v2", executionProfile:"micropython-corpus-v1",
    baseline:{path:"baselines/3.14.json", sha256:digest("baselines/3.14.json")},
    reviews:{path:"INTENTIONAL-INCOMPATIBILITIES.json", sha256:digest("INTENTIONAL-INCOMPATIBILITIES.json")} };
  const manifest = {schema:"sagejs.python-compat-manifest/v1",
    oracle:{implementation:"CPython", version:"3.14.4"}, suites:{micropython:declaration},
    cases:["pass.py", "review.py"].map(name => ({
      id:`micropython/basics/${name.slice(0,-3)}`, suite:"micropython", path:`basics/${name}`,
      upstreamPath:`tests/basics/${name}`, sourceSha256:digest(`basics/${name}`),
      runner:"program", comparison:"cpython-output-baseline-v2", mode:"python", disposition:"required",
      priority:"P1", valueTags:["language"], capabilities:["filesystem:corpus"], targets:["node"],
      timeoutMs:5000, maxOutputBytes:null, fixtures:[], performanceScopes:[],
    })) };
  const save = () => writeFileSync(manifestFile, JSON.stringify(manifest));
  save();
  return {root, directory, manifestFile, manifest, baseline, reviews, save, json, put, digest};
}

test("legacy metadata binds exact source, baseline, exclusions and reviewed alternatives", context => {
  const f = fixture(context), loaded = loadManifest(f.manifestFile);
  assert.equal(loaded.cases.length, 2);
  assert.deepEqual(loaded.outputComparisons.micropython.baseline, f.baseline);
  assert.deepEqual(loaded.outputComparisons.micropython.reviews, f.reviews);
  assert.deepEqual(loaded.outputComparisons.micropython.excluded,
    {expected:["excluded.py"], unittest:["unittest.py"]});
  assert.equal(loaded.provenance.suites.micropython.baselineSha256, f.digest("baselines/3.14.json"));
  assert.equal(loaded.cases[0].executionProfile, "micropython-corpus-v1");
});

test("existing assertion manifest retains its original returned shape and contracts", context => {
  const root = mkdtempSync(join(tmpdir(), "sagejs-assertion-manifest-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  cpSync(join(__dirname, "../upstream-tests/python-compat"), root, { recursive: true });
  const filename = join(root, "manifest.json");
  const manifest = JSON.parse(readFileSync(filename));
  delete manifest.suites.micropython;
  manifest.cases = manifest.cases.filter(entry => entry.suite !== "micropython");
  writeFileSync(filename, JSON.stringify(manifest));
  const loaded = loadManifest(filename);
  assert.equal(loaded.cases.length, 28);
  assert.deepEqual(Object.keys(loaded).sort(), ["cases", "manifest", "provenance"]);
  for (const entry of loaded.cases) {
    assert.equal(entry.comparison, "assertion-exit-empty-output");
    assert.deepEqual(entry.capabilities, ["filesystem:temporary"]);
  }
});

test("closed anchor and legacy profiles reject unknown, escaping and mislabelled metadata", context => {
  const f = fixture(context), original = structuredClone(f.manifest);
  for (const mutate of [
    m => {m.suites.micropython.rootBase = "arbitrary";},
    m => {m.suites.micropython.root = "../micropython";},
    m => {m.suites.micropython.sourceFormat = "unknown";},
    m => {m.suites.micropython.executionProfile = "assertion";},
    m => {m.suites.micropython.baseline.path = "../baseline.json";},
    m => {m.cases[0].comparison = "assertion-exit-empty-output";},
    m => {m.cases[0].capabilities = ["filesystem:temporary"];},
    m => {m.cases[0].maxOutputBytes = 1000;},
    m => {m.cases[0].disposition = "expected-failure";},
    m => {m.cases.pop();},
    m => {m.cases.push({...m.cases[0], id:"micropython/duplicate"});},
  ]) {
    f.manifest = structuredClone(original);
    mutate(f.manifest);
    writeFileSync(f.manifestFile, JSON.stringify(f.manifest));
    assert.throws(() => loadManifest(f.manifestFile));
  }
});

test("all pinned inputs including excluded sources fail closed when changed", context => {
  const f = fixture(context);
  for (const name of ["SOURCE.json", "LICENSE", "UPSTREAM-TESTS-README.md",
    "basics/pass.py", "basics/excluded.py.exp", "basics/unittest.py",
    "INTENTIONAL-INCOMPATIBILITIES.json", "baselines/3.14.json"]) {
    const original = readFileSync(join(f.directory, name));
    f.put(name, Buffer.concat([original, Buffer.from("\n")]));
    assert.throws(() => loadManifest(f.manifestFile));
    f.put(name, original);
  }
  f.put("basics/new.py", "print('new')\n");
  assert.throws(() => loadManifest(f.manifestFile), /provenance differs/);
});

test("repinning a malformed baseline does not authorize new outcomes or oracle versions", context => {
  const f = fixture(context);
  for (const mutate of [
    b => {b.reference.version = "3.14.5";},
    b => {b.outcomes["pass.py"] = "timeout";},
    b => {b.selection.excludedExpected = [];},
    b => {b.evidence["pass.py"].subject.outputSha256 = "0".repeat(64);},
    b => {b.rawStatuses["review.py"] = "runtime-error";},
  ]) {
    const baseline = structuredClone(f.baseline);
    mutate(baseline);
    f.json("baselines/3.14.json", baseline);
    f.manifest.suites.micropython.baseline.sha256 = f.digest("baselines/3.14.json");
    f.save();
    assert.throws(() => loadManifest(f.manifestFile));
  }
});

test("linked corpus files are rejected before metadata can qualify", context => {
  const f = fixture(context);
  try {
    symlinkSync(join(f.directory, "LICENSE"), join(f.directory, "basics/linked.py"));
  } catch (error) {
    if (["EPERM", "EACCES", "ENOSYS"].includes(error.code)) {
      context.skip("host does not permit unprivileged symlink creation");
      return;
    }
    throw error;
  }
  assert.throws(() => loadManifest(f.manifestFile), /symlink/);
});

test("upstream-tests anchor requires its closed directory layout", context => {
  const f = fixture(context);
  const misplaced = join(f.root, "manifest.json");
  writeFileSync(misplaced, JSON.stringify(f.manifest));
  assert.throws(() => loadManifest(misplaced), /invalid upstream-tests anchor layout/);
});

test("output contracts cannot reach assertion execution and partial qualification fails before preflight", async context => {
  const f = fixture(context), loaded = loadManifest(f.manifestFile);
  const filename = join(__dirname, "../scripts/run-python-compat.cjs");
  let touched = false;
  const forbidden = () => { touched = true; throw new Error("unexpected preflight/execution"); };
  const injectedRequire = name => {
    if (name.endsWith("/manifest.cjs")) return { loadManifest: () => loaded };
    if (name.endsWith("/assertion-runner.cjs")) return { executeAssertion: forbidden };
    if (name === "./build-receipt.cjs") return { inspectBuildReceipt: forbidden };
    if (name.endsWith("/evidence.cjs")) return require("../tools/python-compat/evidence.cjs");
    return require("node:module").createRequire(filename)(name);
  };
  const module = { exports: {} };
  runInThisContext(`(function(require,module,exports,__dirname){${readFileSync(filename, "utf8").replace(/^#![^\n]*\n/, "")}\n})`, {filename})(
    injectedRequire, module, module.exports, join(__dirname, "../scripts"));
  await assert.rejects(module.exports.runCase(loaded.cases[0], "unused", f.root,
    {execute: forbidden}), /assertion executor cannot run comparison/);
  await assert.rejects(module.exports.main(["--only", loaded.cases[0].id]), /complete suite/);
  assert.equal(touched, false);
});
