#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const { resolve } = require("node:path");

const root = resolve(__dirname, "..");
const reporter = process.env.SAGEJS_TEST_REPORTER || "spec";
const runnerArguments = process.argv.slice(2);
if (runnerArguments[0] === "--") runnerArguments.shift();
const result = spawnSync(
  process.execPath,
  [
    "--test",
    `--test-reporter=${reporter}`,
    ...runnerArguments,
    "test/compiler.test.cjs",
  ],
  {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  },
);

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
