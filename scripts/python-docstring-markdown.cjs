#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const { discoverPythonFiles } = require("../tools/python-format.cjs");
const { pythonExecutable } = require("../tools/python-executable.cjs");

const root = join(__dirname, "..");
const mode = process.argv[2];
if (process.argv.length !== 3 || !["--check", "--fix"].includes(mode)) {
  throw new Error(
    "usage: node scripts/python-docstring-markdown.cjs (--check|--fix)",
  );
}

const files = discoverPythonFiles(root).map(([path]) => path);
const result = spawnSync(
  pythonExecutable(),
  [join(__dirname, "python-docstring-markdown.py"), mode],
  {
    cwd: root,
    encoding: "utf8",
    input: JSON.stringify(files),
  },
);
if (result.error) throw result.error;
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
if (result.status !== 0) process.exit(result.status);
