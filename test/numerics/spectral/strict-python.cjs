#!/usr/bin/env node
// sagejs-test-tier: specialized
"use strict";

const assert = require("node:assert/strict");
const { readFileSync, readdirSync } = require("node:fs");
const { join, relative } = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  PositionEncoding,
  Workspace,
} = require("@astral-sh/ruff-wasm-nodejs");
const { pythonExecutable } = require("../../../tools/python-executable.cjs");

const root = join(__dirname, "..", "..", "..");
const sourceDirectory = join(
  root,
  "src",
  "lib",
  "sagejs",
  "numerics",
  "spectral",
);
const files = readdirSync(sourceDirectory)
  .filter((name) => name.endsWith(".py"))
  .sort()
  .map((name) => join(sourceDirectory, name));
const paths = files.map((filename) => relative(root, filename));

const syntax = spawnSync(
  pythonExecutable(),
  [
    "-c",
    [
      "import ast, pathlib, sys",
      "for filename in sys.argv[1:]:",
      "    ast.parse(pathlib.Path(filename).read_text(encoding='utf-8'), filename=filename)",
    ].join("\n"),
    ...paths,
  ],
  { cwd: root, encoding: "utf8" },
);
if (syntax.error) throw syntax.error;
assert.equal(syntax.status, 0, syntax.stderr || syntax.stdout);

const ruff = new Workspace(
  {
    "target-version": "py311",
    lint: {
      select: ["E4", "E7", "E9", "F", "I", "B", "ANN"],
      ignore: ["ANN401"],
    },
  },
  PositionEncoding.Utf16,
);
const failures = [];
for (const [index, filename] of files.entries()) {
  for (const diagnostic of ruff.check(readFileSync(filename, "utf8"))) {
    const { row, column } = diagnostic.start_location;
    failures.push(
      `${paths[index]}:${row}:${column}: ${diagnostic.code} ${diagnostic.message}`,
    );
  }
}
assert.deepEqual(failures, []);

const pyright = spawnSync(
  process.execPath,
  [
    require.resolve("pyright/index.js"),
    "--pythonversion",
    "3.11",
    ...paths,
  ],
  { cwd: root, encoding: "utf8" },
);
if (pyright.error) throw pyright.error;
assert.equal(pyright.status, 0, pyright.stderr || pyright.stdout);

console.log(
  `Strict spectral Python passed CPython syntax, Ruff ${Workspace.version()}, ` +
    `and Pyright checks (${files.length} modules).`,
);
