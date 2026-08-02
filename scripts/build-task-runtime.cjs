#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const { join } = require("node:path");

const root = join(__dirname, "..");
const output = join(root, "dist", "compiler", "task-runtime.js");
const result = spawnSync(
  process.execPath,
  [
    join(root, "bin", "sagejs"),
    "compile",
    "--sage",
    "--bare",
    "--keep-docstrings",
    "--output",
    output,
  ],
  {
    cwd: root,
    input: "\n",
    stdio: ["pipe", "inherit", "inherit"],
  },
);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
console.log("Built lightweight multiprocessing task runtime");

