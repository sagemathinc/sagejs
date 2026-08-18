#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const { resolve } = require("node:path");

const { runPnpm } = require("./pnpm-invocation.cjs");

const root = resolve(__dirname, "..");
// `test:sea` is the authoritative release gate because its build includes the
// optional FLINT backend required by the substantive arithmetic assertions.
// `prepack` generates the graph but cannot reliably run this suite when a
// source-package checkout intentionally lacks optional native addons.
if (process.argv.includes("--prepare")) {
  // The generator deletes both cache directories before compiling.  This is
  // intentionally regeneration, not validation of whatever ignored output a
  // previous checkout happened to leave behind.
  runPnpm(["python:precompile:run"], { stdio: "inherit" });
}

const { hasPrecompiledTaskModule } = require("../dist/tools/resources.js");
const workerModule = "sagejs.number_fields.local_parallel_worker";
if (!hasPrecompiledTaskModule(workerModule)) {
  throw new Error(
    `fresh validated multiprocessing graph is unavailable for ${workerModule}`,
  );
}

const result = spawnSync(
  process.execPath,
  ["--test", "test/number-field-maximal-order-parallel-worker.cjs"],
  { cwd: root, env: process.env, stdio: "inherit" },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
