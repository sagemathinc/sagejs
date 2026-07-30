#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const { availableParallelism } = require("node:os");
const { resolve } = require("node:path");

const root = resolve(__dirname, "..");
const manifest = require("../test/node-test-manifest.cjs");
const [tier = "all", ...rawRunnerArguments] = process.argv.slice(2);
const runnerArguments = [...rawRunnerArguments];
if (runnerArguments[0] === "--") runnerArguments.shift();
const files = manifest[tier];

if (!files) {
  console.error(
    `usage: node scripts/run-test-tier.cjs ` +
      `<${Object.keys(manifest).join("|")}> [node:test options]`,
  );
  process.exitCode = 2;
} else {
  let namePattern;
  for (let index = 0; index < runnerArguments.length; index += 1) {
    const argument = runnerArguments[index];
    if (argument.startsWith("--test-name-pattern=")) {
      namePattern = argument.slice("--test-name-pattern=".length);
    } else if (argument === "--test-name-pattern") {
      namePattern = runnerArguments[index + 1];
    }
  }
  const selectedFiles = namePattern
    ? files.filter((filename) => new RegExp(namePattern).test(filename))
    : files;
  if (selectedFiles.length === 0) {
    console.error(`no ${tier} test file matches ${namePattern}`);
    process.exitCode = 1;
    return;
  }
  const hostConcurrency =
    typeof availableParallelism === "function" ? availableParallelism() : 4;
  const concurrency = Math.max(
    1,
    Math.min(tier === "integration" ? 2 : 4, hostConcurrency),
  );
  const reporter = process.env.SAGEJS_TEST_REPORTER || "spec";
  const result = spawnSync(
    process.execPath,
    [
      "--test",
      `--test-concurrency=${concurrency}`,
      `--test-reporter=${reporter}`,
      ...runnerArguments,
      ...selectedFiles,
    ],
    {
      cwd: root,
      env: process.env,
      stdio: "inherit",
    },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
