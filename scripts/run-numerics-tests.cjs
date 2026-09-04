#!/usr/bin/env node
"use strict";

const { availableParallelism } = require("node:os");
const { readFileSync, readdirSync, statSync } = require("node:fs");
const { join, relative, resolve } = require("node:path");
const { spawn } = require("node:child_process");

const root = resolve(__dirname, "..");
const numericsRoot = join(root, "test", "numerics");
const argv = process.argv.slice(2);
const matchIndex = argv.indexOf("--match");
const match = matchIndex === -1 ? "" : String(argv[matchIndex + 1] || "");

function discover(directory) {
  const answer = [];
  for (const name of readdirSync(directory).sort()) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) {
      answer.push(...discover(path));
      continue;
    }
    if (!name.endsWith(".cjs")) continue;
    const source = readFileSync(path, "utf8");
    if (!source.includes("sagejs-test-tier:")) continue;
    answer.push(path);
  }
  return answer;
}

function seconds(milliseconds) {
  if (milliseconds < 10_000) return `${(milliseconds / 1000).toFixed(2)}s`;
  return `${Math.round(milliseconds / 1000)}s`;
}

let files = [join(root, "test", "numerical-root-laboratory.cjs"), ...discover(numericsRoot)];
if (match) {
  files = files.filter((path) => relative(root, path).includes(match));
}
if (files.length === 0) {
  console.error(`No numerical test files matched ${JSON.stringify(match)}.`);
  process.exit(2);
}

const requested = Number.parseInt(process.env.SAGEJS_NUMERICS_TEST_CONCURRENCY || "", 10);
const concurrency = Number.isFinite(requested) && requested > 0
  ? Math.min(requested, files.length)
  : Math.min(2, availableParallelism(), files.length);
const startedAt = Date.now();
const active = new Set();
let next = 0;
let completed = 0;
let failed = false;

console.log(
  `Numerical tests: ${files.length} files, concurrency ${concurrency}` +
    (match ? `, match ${JSON.stringify(match)}` : ""),
);

function terminateActive() {
  for (const child of active) {
    if (!child.killed) child.kill("SIGTERM");
  }
}

function launch(path) {
  const ordinal = next + 1;
  next += 1;
  const label = relative(root, path);
  const fileStartedAt = Date.now();
  console.log(`[${ordinal}/${files.length}] START ${label}`);
  const child = spawn(process.execPath, ["--test", path], {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  });
  active.add(child);
  child.on("error", (error) => {
    console.error(`[${ordinal}/${files.length}] ERROR ${label}: ${error.message}`);
  });
  child.on("exit", (code, signal) => {
    active.delete(child);
    completed += 1;
    const elapsed = Date.now() - fileStartedAt;
    if (code !== 0) {
      if (!failed) {
        failed = true;
        console.error(
          `[${ordinal}/${files.length}] FAIL ${label} after ${seconds(elapsed)}` +
            (signal ? ` (${signal})` : ` (exit ${code})`),
        );
        terminateActive();
      }
      if (active.size === 0) process.exit(code || 1);
      return;
    }
    const totalElapsed = Date.now() - startedAt;
    const remaining = files.length - completed;
    const eta = completed === 0 ? 0 : (totalElapsed / completed) * remaining / concurrency;
    console.log(
      `[${ordinal}/${files.length}] PASS ${label} in ${seconds(elapsed)}; ` +
        `${completed}/${files.length} complete; ETA ${seconds(Math.max(0, eta))}`,
    );
    if (failed) {
      if (active.size === 0) process.exit(1);
      return;
    }
    while (active.size < concurrency && next < files.length) launch(files[next]);
    if (completed === files.length) {
      console.log(`Numerical tests passed in ${seconds(Date.now() - startedAt)}.`);
    }
  });
}

while (active.size < concurrency && next < files.length) launch(files[next]);
