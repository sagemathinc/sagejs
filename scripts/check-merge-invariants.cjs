#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const { resolve } = require("node:path");

const { discoverTestManifest } = require("./test-metadata.cjs");

const ROOT = resolve(__dirname, "..");

function run(command, arguments_, label) {
  process.stdout.write(`[merge-check] ${label}\n`);
  const result = spawnSync(command, arguments_, {
    cwd: ROOT,
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if ((result.status ?? 1) !== 0) {
    throw new Error(`${label} failed with exit status ${result.status ?? 1}`);
  }
}

function assertCleanMergeState() {
  const unresolved = spawnSync(
    "git",
    ["diff", "--name-only", "--diff-filter=U"],
    { cwd: ROOT, encoding: "utf8" },
  );
  if (unresolved.error) throw unresolved.error;
  if ((unresolved.status ?? 1) !== 0) {
    throw new Error("could not inspect the Git merge state");
  }
  const filenames = unresolved.stdout.trim();
  if (filenames) {
    throw new Error(`unresolved merge paths:\n${filenames}`);
  }
  run("git", ["diff", "--check"], "working-tree conflict and whitespace scan");
  run("git", ["diff", "--cached", "--check"], "index conflict and whitespace scan");
}

function main(arguments_ = process.argv.slice(2)) {
  if (arguments_.length !== 0) {
    throw new Error("usage: node scripts/check-merge-invariants.cjs");
  }

  assertCleanMergeState();

  const manifest = discoverTestManifest(ROOT);
  process.stdout.write(
    `[merge-check] co-located test metadata: ${manifest.unit.length} unit, ` +
      `${manifest.integration.length} integration, ` +
      `${manifest.specialized.length} specialized\n`,
  );

  const checks = [
    ["check-package-graph.cjs", "logical package graph and source ownership"],
    ["check-native-architecture.cjs", "native source, extension, and kernel policy"],
    ["check-wasm-capabilities.cjs", "WebAssembly capability inventory"],
    ["wasm-workload-dashboard.cjs", "generated WebAssembly workload inventory", ["--verify-generated"]],
  ];
  for (const [script, label, extraArguments = []] of checks) {
    run(process.execPath, [resolve(__dirname, script), ...extraArguments], label);
  }

  process.stdout.write("[merge-check] PASS: merge-owned inventories agree with their sources\n");
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.stack ?? error);
    process.exitCode = 1;
  }
}

module.exports = { assertCleanMergeState, main, run };
