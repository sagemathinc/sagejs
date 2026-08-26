// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const { pythonExecutable } = require("../tools/python-executable.cjs");

const root = join(__dirname, "..");
const cli = join(root, "bin", "sagejs");
const fixture = join(__dirname, "fixtures", "numpy-broad-coverage.py");

function run(command, args) {
  return spawnSync(command, args, { cwd: root, encoding: "utf8" });
}

const sagejs = run(process.execPath, [
  cli,
  "compile",
  "--python",
  "--execute",
  fixture,
]);
assert.equal(sagejs.status, 0, sagejs.stderr);

const python = pythonExecutable();
const available = run(python, ["-c", "import numpy"]);
if (available.status === 0) {
  const cpython = run(python, [fixture]);
  assert.equal(cpython.status, 0, cpython.stderr);
  assert.equal(
    sagejs.stdout,
    cpython.stdout,
    "the broad numpy-ts facade must agree with CPython/NumPy",
  );
} else {
  // `rounded` intentionally normalizes numeric values through `float`, so
  // even the explicitly integral `full` fixture prints floating-point rows.
  assert.ok(sagejs.stdout.includes("[[7.0, 7.0, 7.0], [7.0, 7.0, 7.0]]"));
  assert.ok(sagejs.stdout.includes("[0.6, -0.2]"));
}

const inventory = run(python, [
  "-c",
  [
    "import ast,json,pathlib",
    "tree=ast.parse(pathlib.Path('src/lib/numpy.py').read_text())",
    "root=set(); classes={}",
    "for node in tree.body:",
    " if isinstance(node,(ast.FunctionDef,ast.ClassDef)) and not node.name.startswith('_'): root.add(node.name)",
    " if isinstance(node,ast.ClassDef):",
    "  values=set()",
    "  for item in node.body:",
    "   if isinstance(item,ast.FunctionDef) and not item.name.startswith('_'): values.add(item.name)",
    "   if isinstance(item,ast.Assign):",
    "    values.update(t.id for t in item.targets if isinstance(t,ast.Name) and not t.id.startswith('_'))",
    "  classes[node.name]=len(values)",
    " if isinstance(node,ast.Assign): root.update(t.id for t in node.targets if isinstance(t,ast.Name) and not t.id.startswith('_'))",
    "print(json.dumps({'root':len(root),'ndarray':classes['ndarray'],'random':classes['_Random'],'fft':classes['_FFT'],'linalg':classes['_Linalg']}))",
  ].join("\n"),
]);
assert.equal(inventory.status, 0, inventory.stderr);
const counts = JSON.parse(inventory.stdout);
assert.ok(counts.root >= 225, JSON.stringify(counts));
assert.ok(counts.ndarray >= 39, JSON.stringify(counts));
assert.ok(counts.random >= 45, JSON.stringify(counts));
assert.ok(counts.fft >= 18, JSON.stringify(counts));
assert.ok(counts.linalg >= 23, JSON.stringify(counts));

console.log("Sage.js broad NumPy coverage passed.");
