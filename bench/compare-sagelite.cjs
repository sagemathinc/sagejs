"use strict";

const { spawnSync } = require("node:child_process");
const { join } = require("node:path");

const root = join(__dirname, "..");
const source = join(__dirname, "arithmetic.sage");
const sagejs = join(root, "bin", "sagejs");
const sagelite =
  process.env.SAGELITE_SAGE || "/opt/cocalc-webdev-python/bin/sage";

function run(label, command, args) {
  process.stdout.write(`\n${label}\n${"=".repeat(label.length)}\n`);
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  });
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${label} exited with status ${result.status}`);
  }
}

run("Sage.js", process.execPath, [sagejs, source]);
run("Sagelite", sagelite, [source]);
