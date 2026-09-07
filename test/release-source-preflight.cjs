// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { parserSubmodules, inspectSourcePreflight, requireSourcePreflight } = require("../scripts/release/source-preflight.cjs");
const { plan } = require("../scripts/release/stages.cjs");
const { run } = require("../scripts/release/runner.cjs");
const { readStatus } = require("../scripts/release/status.cjs");
const git = (root, ...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: "pipe" }).trim();
const name = parserSubmodules[0];
const stages = [{ id: "runtime", sourceSubmodules: [name] }];

function fixture(t, initialized = true) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-source-preflight-"));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const root = path.join(parent, "candidate");
  const upstream = path.join(parent, "upstream");
  for (const directory of [root, upstream]) {
    fs.mkdirSync(directory);
    git(directory, "init");
    git(directory, "config", "user.name", "Preflight test");
    git(directory, "config", "user.email", "preflight@example.invalid");
  }
  fs.mkdirSync(path.join(upstream, "src"));
  for (const file of ["grammar.js", "src/parser.c", "src/scanner.c"]) fs.writeFileSync(path.join(upstream, file), "source\n");
  git(upstream, "add", ".");
  git(upstream, "commit", "-m", "parser fixture");
  fs.writeFileSync(path.join(root, ".gitignore"), "build/\n");
  if (initialized) git(root, "-c", "protocol.file.allow=always", "submodule", "add", upstream, name);
  else {
    fs.mkdirSync(path.join(root, name), { recursive: true });
    git(root, "update-index", "--add", "--cacheinfo", `160000,${git(upstream, "rev-parse", "HEAD")},${name}`);
  }
  git(root, "add", ".");
  git(root, "commit", "-m", "candidate fixture");
  return { root, moduleRoot: path.join(root, name), candidate: git(root, "rev-parse", "HEAD") };
}

test("source inspection verifies initialized pins and leaves the checkout untouched", (t) => {
  const { root } = fixture(t);
  const before = git(root, "status", "--porcelain");
  const report = requireSourcePreflight({ root, stages: [...stages, ...stages] });
  assert.equal(report.submodules.length, 1);
  assert.equal(report.submodules[0].actualCommit, report.submodules[0].expectedCommit);
  assert.equal(report.remedy, null);
  assert.equal(git(root, "status", "--porcelain"), before);
});

test("an empty uninitialized module cannot masquerade as the parent repository", (t) => {
  const { root, moduleRoot } = fixture(t, false);
  const before = fs.readdirSync(moduleRoot);
  const report = inspectSourcePreflight({ root, stages });
  assert.equal(report.passed, false);
  assert.match(report.failures[0], /not initialized/);
  assert.match(report.remedy, /^git submodule update --init --recursive -- upstream-tests\/tree-sitter-magma$/);
  assert.deepEqual(fs.readdirSync(moduleRoot), before, "no fetch or initialization occurs");
  assert.throws(() => requireSourcePreflight({ root, stages }), { code: "RELEASE_SOURCE_PREFLIGHT" });
});

test("modified, missing and different-revision parser source fails inspection", (t) => {
  const { root, moduleRoot } = fixture(t);
  const filename = path.join(moduleRoot, "grammar.js");
  fs.writeFileSync(filename, "modified\n");
  assert.match(inspectSourcePreflight({ root, stages }).failures[0], /modified tracked source/);
  fs.unlinkSync(filename);
  assert.equal(inspectSourcePreflight({ root, stages }).passed, false);
  fs.writeFileSync(filename, "replacement\n");
  git(moduleRoot, "-c", "user.name=Preflight test", "-c", "user.email=preflight@example.invalid",
    "commit", "-am", "different revision");
  assert.match(inspectSourcePreflight({ root, stages }).failures[0], /differs from pinned commit/);
});

test("only declared build source prerequisites are checked and unknown paths fail closed", () => {
  assert.equal(inspectSourcePreflight({ root: "/does-not-need-to-exist", stages: [] }).passed, true);
  assert.throws(() => inspectSourcePreflight({ stages: [{ sourceSubmodules: ["../../outside"] }] }), /unknown.*prerequisite/);
  for (const profile of ["preparation", "canonical", "native"]) {
    const selected = plan(profile, undefined, "linux-x64");
    assert.deepEqual([...new Set(selected.flatMap((stage) => stage.sourceSubmodules || []))].sort(), [...parserSubmodules].sort());
  }
  assert.equal(plan("preparation", "numerical-product", "linux-x64")[0].sourceSubmodules, undefined);
  assert.ok(!plan("browser", undefined, "linux-x64").some((stage) => stage.sourceSubmodules));
  // Keep this prerequisite list tied to the actual vendor builder, not all
  // optional upstream test repositories.
  const vendor = fs.readFileSync(path.join(__dirname, "../scripts/build-vendor.cjs"), "utf8");
  const declared = [...vendor.matchAll(/join\(root, "upstream-tests", "(tree-sitter-[^"]+)"\)/g)]
    .map((match) => `upstream-tests/${match[1]}`);
  assert.deepEqual(declared.sort(), [...parserSubmodules].sort());
});

test("runner refuses missing later-stage sources before starting earlier expensive work", async (t) => {
  const context = fixture(t, false);
  const expensive = { id: "expensive", gate: "build", inputs: [], outputs: [], timeoutSeconds: 30,
    commands: [["node", "-e", "require('fs').writeFileSync('build/should-not-exist','bad')"]] };
  await assert.rejects(run({ ...context, preflight: () => ({ passed: true }),
    stages: [expensive, { ...expensive, id: "runtime", sourceSubmodules: [name] }] }), { code: "RELEASE_SOURCE_PREFLIGHT" });
  assert.equal(fs.existsSync(path.join(context.root, "build/should-not-exist")), false);
  const status = readStatus(context.root, context.candidate);
  assert.equal(status.failure.stage, null);
  assert.equal(status.sourcePreflight.passed, false);
  assert.deepEqual(status.stages.map((stage) => stage.state), ["blocked", "blocked"]);
});
