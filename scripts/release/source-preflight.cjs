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
      if (fs.realpathSync(git(moduleRoot, ["rev-parse", "--show-toplevel"])) !== fs.realpathSync(moduleRoot)) {
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
  return { schema: "sagejs.release-source-preflight/v1", passed: failures.length === 0,
    submodules: records, failures,
    remedy: failures.length ? `git submodule update --init --recursive -- ${needed.join(" ")}` : null };
}

function requireSourcePreflight(options) {
  const report = inspectSourcePreflight(options);
  if (!report.passed) {
    const error = new Error(`release source preflight failed: ${report.failures.join("; ")}. Inspect local changes before running: ${report.remedy}`);
    error.code = "RELEASE_SOURCE_PREFLIGHT";
    error.sourceReport = report;
    throw error;
  }
  return report;
}

module.exports = { parserSubmodules, inspectSourcePreflight, requireSourcePreflight };
