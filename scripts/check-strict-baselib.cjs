"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  PositionEncoding,
  Workspace,
} = require("@astral-sh/ruff-wasm-nodejs");
const { pythonExecutable } = require("../tools/python-executable.cjs");

const root = join(__dirname, "..");
const pyrightConfigPath = join(root, "pyrightconfig.json");
const pyrightConfig = JSON.parse(readFileSync(pyrightConfigPath, "utf8"));
const files = pyrightConfig.include;

assert.ok(Array.isArray(files) && files.length > 0);
for (const file of files) {
  assert.match(file, /^src\/(?:baselib|lib)\/.+\.py$/);
}

const pythonSyntax = spawnSync(
  pythonExecutable(),
  [
    "-c",
    [
      "import ast, pathlib, sys",
      "for filename in sys.argv[1:]:",
      "    ast.parse(pathlib.Path(filename).read_text(encoding='utf-8'), filename=filename)",
    ].join("\n"),
    ...files,
  ],
  { cwd: root, encoding: "utf8" },
);
if (pythonSyntax.error) throw pythonSyntax.error;
if (pythonSyntax.status !== 0) {
  process.stderr.write(pythonSyntax.stdout);
  process.stderr.write(pythonSyntax.stderr);
  process.exit(pythonSyntax.status);
}

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
let ruffFailures = 0;
for (const file of files) {
  const diagnostics = ruff.check(
    readFileSync(join(root, file), "utf8"),
  );
  for (const diagnostic of diagnostics) {
    ruffFailures += 1;
    const { row, column } = diagnostic.start_location;
    process.stderr.write(
      `${file}:${row}:${column}: ${diagnostic.code} ` +
        `${diagnostic.message}\n`,
    );
  }
}
if (ruffFailures > 0) process.exit(1);

const pyright = spawnSync(
  process.execPath,
  [require.resolve("pyright/index.js"), "--project", pyrightConfigPath],
  { cwd: root, encoding: "utf8" },
);
if (pyright.error) throw pyright.error;
process.stdout.write(pyright.stdout);
process.stderr.write(pyright.stderr);
if (pyright.status !== 0) process.exit(pyright.status);

console.log(
  `Strict Python library passed CPython syntax, Ruff ${Workspace.version()}, ` +
    `and Pyright checks (${files.length} modules).`,
);
