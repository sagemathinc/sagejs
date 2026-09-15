// sagejs-test-tier: unit
// sagejs-test-platform: true
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const test = require("node:test");
const { pythonExecutable } = require("../tools/python-executable.cjs");

test("cold type-marker installer preserves fresh, enumerable-omitting descriptors", () => {
  // Execute the actual CPython-parseable helper, then apply its descriptors to
  // real host objects. Full compiler/bootstrap linkage is a separate gate.
  const probe = String.raw`
import ast
import json
import sys
from types import SimpleNamespace
from typing import Any

tree = ast.parse(open(sys.argv[1], encoding="utf8").read())
helper = next(node for node in tree.body
              if isinstance(node, ast.FunctionDef)
              and node.name == "_builtins_set_python_type")
calls = []
runtime = SimpleNamespace(object=SimpleNamespace(
    defineProperty=lambda target, name, descriptor:
        calls.append((target, name, descriptor))))
namespace = {"runtime": runtime, "Any": Any}
exec(compile(ast.Module(body=[helper], type_ignores=[]), sys.argv[1], "exec"), namespace)
install = namespace[helper.name]
install("first", "old")
install("second", "new")
assert calls[0][2] is not calls[1][2]
assert calls == [
    ("first", "__python_type__", {"value": "old", "writable": True, "configurable": True}),
    ("second", "__python_type__", {"value": "new", "writable": True, "configurable": True}),
]
sites = [node for node in ast.walk(tree) if isinstance(node, ast.Call)
         and isinstance(node.func, ast.Name) and node.func.id == helper.name]
assert len(sites) == 6
assert all(len(site.args) == 2 and not site.keywords
           and all(isinstance(arg, ast.Name) for arg in site.args)
           for site in sites)
print(json.dumps([entry[2] for entry in calls]))
`;
  const result = spawnSync(pythonExecutable(), ["-c", probe,
    join(__dirname, "../src/baselib/builtins.py")], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const [initial, replacement] = JSON.parse(result.stdout);
  const fresh = {};
  Object.defineProperty(fresh, "__python_type__", initial);
  assert.deepEqual(Object.getOwnPropertyDescriptor(fresh, "__python_type__"), {
    value: "old", writable: true, configurable: true, enumerable: false,
  });
  const existing = { __python_type__: "previous" };
  Object.defineProperty(existing, "__python_type__", replacement);
  assert.deepEqual(Object.getOwnPropertyDescriptor(existing, "__python_type__"), {
    value: "new", writable: true, configurable: true, enumerable: true,
  });
  const accessor = {};
  Object.defineProperty(accessor, "__python_type__", {
    get() { throw new Error("replacement must not read the previous marker"); },
    configurable: true, enumerable: true,
  });
  Object.defineProperty(accessor, "__python_type__", replacement);
  assert.deepEqual(Object.getOwnPropertyDescriptor(accessor, "__python_type__"), {
    value: "new", writable: true, configurable: true, enumerable: true,
  });
  const locked = {};
  Object.defineProperty(locked, "__python_type__", { value: "locked" });
  assert.throws(() => Object.defineProperty(locked, "__python_type__", replacement), TypeError);
  assert.equal(locked.__python_type__, "locked");
});
