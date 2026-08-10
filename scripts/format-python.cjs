#!/usr/bin/env node
"use strict";

const {
  existsSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} = require("node:fs");
const { join, relative, sep } = require("node:path");
const {
  PYTHON_FORMAT_EXCLUDES,
  PYTHON_FORMAT_ROOTS,
  PYTHON_FORMAT_SKIP_DIRECTORIES,
  RUFF_VERSION,
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

const excluded = new Set(PYTHON_FORMAT_EXCLUDES);
const skippedDirectories = new Set(PYTHON_FORMAT_SKIP_DIRECTORIES);

function repositoryPath(filename) {
  return relative(root, filename).split(sep).join("/");
}

function discover(directory, files) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const filename = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (
        !skippedDirectories.has(entry.name) &&
        !excluded.has(repositoryPath(filename))
      ) {
        discover(filename, files);
      }
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".py")) continue;
    const path = repositoryPath(filename);
    if (!excluded.has(path)) files.push([path, filename]);
  }
}

const files = [];
for (const directory of PYTHON_FORMAT_ROOTS) {
  const path = join(root, directory);
  if (existsSync(path)) discover(path, files);
}
files.sort(([left], [right]) => left.localeCompare(right));

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
