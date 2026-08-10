"use strict";

const {
  PositionEncoding,
  Workspace,
} = require("@astral-sh/ruff-wasm-nodejs");

const RUFF_VERSION = "0.16.0";
const PYTHON_FORMAT_ROOTS = Object.freeze([
  "bench",
  "ffi",
  "scripts",
  "src",
  "test",
]);
const PYTHON_FORMAT_EXCLUDES = Object.freeze([
  "src/baselib/graph_reference_data.py",
  "src/lib/mpmath",
  "test/aes_vectors.py",
  "test/annotations.py",
  "test/baselib.py",
  "test/classes.py",
  "test/decorators.py",
  "test/docstrings.py",
  "test/functions.py",
  "test/generic.py",
  "test/jsage.py",
  "test/lint.py",
  "test/loops.py",
  "test/newlines.py",
  "test/operator_overloading.py",
  "test/regexp.py",
  "test/starargs.py",
  "test/str.py",
]);
const PYTHON_FORMAT_SKIP_DIRECTORIES = Object.freeze([
  ".native",
  ".sagejs-native-kernels",
  "__pycache__",
  "build",
  "dist",
  "node_modules",
]);
const WORKSPACE_OPTIONS = Object.freeze({
  "target-version": "py311",
  "line-length": 88,
  preview: false,
  format: Object.freeze({
    "quote-style": "double",
    "indent-style": "space",
    "skip-magic-trailing-comma": false,
    "line-ending": "lf",
  }),
});

let workspace;

function pythonFormatter() {
  if (Workspace.version() !== RUFF_VERSION) {
    throw new Error(
      `Python formatting requires Ruff ${RUFF_VERSION}, found ` +
        Workspace.version(),
    );
  }
  workspace ??= new Workspace(WORKSPACE_OPTIONS, PositionEncoding.Utf16);
  return workspace;
}

function formatPythonSource(source) {
  return pythonFormatter().format(source);
}

function ruffToml() {
  const excluded = PYTHON_FORMAT_EXCLUDES
    .map((filename) => `  "${filename}",`)
    .join("\n");
  return `# Generated from tools/python-format.cjs; keep both in sync through
# pnpm format:python:check.
target-version = "py311"
line-length = 88
preview = false
extend-exclude = [
  "upstream-tests",
${excluded}
]

[format]
quote-style = "double"
indent-style = "space"
skip-magic-trailing-comma = false
line-ending = "lf"
`;
}

module.exports = {
  PYTHON_FORMAT_EXCLUDES,
  PYTHON_FORMAT_ROOTS,
  PYTHON_FORMAT_SKIP_DIRECTORIES,
  RUFF_VERSION,
  formatPythonSource,
  ruffToml,
};
