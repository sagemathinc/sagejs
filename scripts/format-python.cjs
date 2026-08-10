#!/usr/bin/env node
"use strict";

const {
  readFileSync,
  writeFileSync,
} = require("node:fs");
const { join } = require("node:path");
const {
  RUFF_VERSION,
  discoverPythonFiles,
  formatPythonSource,
  ruffToml,
} = require("../tools/python-format.cjs");

const root = join(__dirname, "..");
const check = process.argv.length === 3 && process.argv[2] === "--check";
if (process.argv.length !== (check ? 3 : 2)) {
  throw new Error("usage: node scripts/format-python.cjs [--check]");
}

const configured = readFileSync(join(root, "ruff.toml"), "utf8");
if (configured !== ruffToml()) {
  throw new Error(
    "ruff.toml does not match the canonical tools/python-format.cjs policy",
  );
}

const files = discoverPythonFiles(root);

const changed = [];
for (const [path, filename] of files) {
  const source = readFileSync(filename, "utf8");
  let formatted;
  try {
    formatted = formatPythonSource(source);
  } catch (error) {
    error.message = `${path}: ${error.message}`;
    throw error;
  }
  if (formatted === source) continue;
  changed.push(path);
  if (!check) writeFileSync(filename, formatted);
}

if (check && changed.length > 0) {
  process.stderr.write(
    `Ruff ${RUFF_VERSION} would reformat ${changed.length} file(s):\n` +
      changed.map((path) => `  ${path}\n`).join(""),
  );
  process.exit(1);
}

console.log(
  check
    ? `Ruff ${RUFF_VERSION} formatting is current (${files.length} files).`
    : `Ruff ${RUFF_VERSION} formatted ${changed.length} of ${files.length} files.`,
);
