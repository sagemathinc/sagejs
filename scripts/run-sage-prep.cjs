#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const { join } = require("node:path");

const runner = join(__dirname, "run-sage-tutorial.cjs");
const result = spawnSync(
  process.execPath,
  [runner, "--corpus", "prep", ...process.argv.slice(2)],
  { stdio: "inherit" },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
