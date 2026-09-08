"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

// These are build-vendor.cjs inputs, not the much larger optional upstream test
// checkout. Do not fetch anything here: inspection must work offline and make
// missing prerequisites actionable before starting expensive preparation.
const parserSubmodules = Object.freeze([
  "upstream-tests/tree-sitter-magma",
  "upstream-tests/tree-sitter-matlab",
  "upstream-tests/tree-sitter-wolfram",
]);
const parserFiles = ["grammar.js", "src/parser.c", "src/scanner.c"];
const git = (root, args) => execFileSync("git", args, {
  cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 10000,
}).trim();

function requireRegularPath(root, relative, directory = false) {
  let current = root;
  const parts = relative.split("/");
  for (const [index, part] of parts.entries()) {
    current = path.join(current, part);
    const stat = fs.lstatSync(current);
    const isDirectory = directory || index < parts.length - 1;
    if (stat.isSymbolicLink() || (isDirectory ? !stat.isDirectory() : !stat.isFile())) {
      throw new Error("source must use ordinary files/directories, not links");
    }
  }
}

function inspectSourcePreflight({ root, stages = [] }) {
  const needed = [...new Set(stages.flatMap((stage) => stage.sourceSubmodules || []))].sort();
  const records = [];
  const failures = [];
  const remedies = [];
  const eligibility = [];
  // Reject a known pending release before the earlier numerical-product build.
  // This is only admission: the later verifier must still authenticate actual
  // artifacts, source closure and qualification evidence after preparation.
  if (stages.some((stage) => stage.id === "numerical-eligibility")) {
    const name = "src/lib/sagejs/numerics/optimization/backends/nlopt/release/production-manifest.json";
    const record = { path: name, passed: false, scope: "manifest-state-only" };
    eligibility.push(record);
    try {
      requireRegularPath(root, name);
      const { validateManifestQualificationState } = require("../../src/lib/sagejs/numerics/optimization/backends/nlopt/qualification/contracts.cjs");
      const manifest = JSON.parse(fs.readFileSync(path.join(root, name), "utf8"));
      record.state = validateManifestQualificationState(manifest);
      if (record.state !== "qualified") throw new Error("NLopt is pending source-current qualification");
      record.passed = true;
    } catch {
      record.reason = "NLopt release manifest is missing, invalid, or pending qualification";
      failures.push(`${name}: ${record.reason}`);
      remedies.push("Complete source-current NLopt qualification before canonical release preparation; use --profile preparation only to build inputs for qualification, not to authorize release");
    }
  }
  for (const name of needed) {
    if (!parserSubmodules.includes(name)) throw new Error(`unknown release source prerequisite: ${name}`);
    const record = { path: name, passed: false };
    records.push(record);
    try {
      // A directory at the right path is insufficient: uninitialized modules
      // inherit their parent Git repository when queried with `git -C`.
      const entry = git(root, ["ls-tree", "HEAD", "--", name]);
      const match = /^160000 commit ([0-9a-f]{40})\t/.exec(entry);
      if (!match || entry.slice(entry.indexOf("\t") + 1) !== name) throw new Error("missing pinned Git submodule");
      record.expectedCommit = match[1];
      requireRegularPath(root, name, true);
      const moduleRoot = path.join(root, name);
      // Windows' JS realpath preserves caller casing (and may retain DOS path
      // aliases). Compare native canonical paths, not their input spellings.
      if (fs.realpathSync.native(git(moduleRoot, ["rev-parse", "--show-toplevel"])) !== fs.realpathSync.native(moduleRoot)) {
        throw new Error("submodule is not initialized");
      }
      record.actualCommit = git(moduleRoot, ["rev-parse", "HEAD"]);
      if (record.actualCommit !== record.expectedCommit) throw new Error("submodule differs from pinned commit");
      if (git(moduleRoot, ["status", "--porcelain", "--untracked-files=no"])) throw new Error("submodule has modified tracked source");
      for (const file of parserFiles) requireRegularPath(moduleRoot, file);
      record.passed = true;
    } catch (error) {
      // Do not emit captured Git stderr or environment values into a journal.
      record.reason = error.code ? `source inspection failed (${error.code})` : error.message;
      failures.push(`${name}: ${record.reason}`);
    }
  }
  if (records.some((record) => !record.passed)) remedies.push(`git submodule update --init --recursive -- ${needed.join(" ")}`);
  return { schema: "sagejs.release-source-preflight/v1", passed: failures.length === 0,
    submodules: records, eligibility, failures,
    remedy: remedies.length ? remedies.join("; ") : null };
}

function requireSourcePreflight(options) {
  const report = inspectSourcePreflight(options);
  if (!report.passed) {
    const error = new Error(`release source preflight failed: ${report.failures.join("; ")}. Inspect local changes first. Remedy: ${report.remedy}`);
    error.code = "RELEASE_SOURCE_PREFLIGHT";
    error.sourceReport = report;
    throw error;
  }
  return report;
}

// CI can perform the same cheap manifest-state admission before dependency
// installation or toolchain setup. Do not import the full runner/build graph.
function main(argv = process.argv.slice(2)) {
  if (argv.length !== 1 || argv[0] !== "--numerical-eligibility") {
    console.error("Usage: node scripts/release/source-preflight.cjs --numerical-eligibility");
    return 2;
  }
  const report = inspectSourcePreflight({ root: process.cwd(), stages: [{ id: "numerical-eligibility" }] });
  console.log(JSON.stringify(report, null, 2));
  return report.passed ? 0 : 1;
}
if (require.main === module) process.exitCode = main();

module.exports = { parserSubmodules, inspectSourcePreflight, requireSourcePreflight, main };
