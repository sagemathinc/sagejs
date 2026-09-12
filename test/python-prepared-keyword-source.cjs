// sagejs-test-tier: unit
// sagejs-test-platform: true
"use strict";
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const test = require("node:test");
const { pythonExecutable } = require("../tools/python-executable.cjs");

test("prepared keyword source protocol distinguishes receiver and full-resolution fallback", () => {
  const probe = String.raw`
import ast
import sys
from types import SimpleNamespace as NS
from typing import Any

tree = ast.parse(open(sys.argv[1], encoding="utf8").read())
names = {"ρσ_invoke_prepared_keywords", "_internal_bind_kwargs"}
nodes = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name in names]
assert len(nodes) == 2
missing = object()
class Array(list):
    @property
    def length(self): return len(self)
    def unshift(self, value): self.insert(0, value)
    def __setitem__(self, index, value):
        while len(self) <= index: self.append(missing)
        super().__setitem__(index, value)
def get(target, name): return getattr(target, name, missing)
calls = []
def apply(target, receiver, args):
    calls.append((target, receiver, list(args)))
    return "invoked"
runtime = NS(undefined=missing, reflect=NS(apply=apply,
    construct=lambda constructor, args: Array([missing] * args[0]),
    deleteProperty=lambda value, name: value.pop(name)),
    array=Array, math=NS(max=max), object=NS(keys=lambda value: list(value)))
fallbacks = []
def fallback(receiver, target, args):
    fallbacks.append((receiver, target, args))
    return "resolved"
namespace = {"Any": Any, "runtime": runtime, "_internal_get_member": get,
    "_internal_has_own": lambda value, name: name in value,
    "ρσ_interpolate_kwargs": fallback}
exec(compile(ast.Module(body=nodes, type_ignores=[]), sys.argv[1], "exec"), namespace)
invoke = namespace["ρσ_invoke_prepared_keywords"]
target = NS(__argnames__=Array(["self", "value"]), __kwonly__=Array(),
    __positional_only__=1, __handles_kwarg_interpolation__=True, __varkw__=True)
receiver = object()
packet = {"value": 3, "self": 4}
assert invoke([target, receiver, True], Array([packet])) == "invoked"
assert calls.pop() == (target, missing, [receiver, 3, {"self": 4}])
target.__argnames__ = Array(["value"])
target.__positional_only__ = 0
assert invoke([target, receiver, False], Array([{"value": 7}])) == "invoked"
assert calls.pop() == (target, receiver, [7, {}])
opaque = object()
args = Array([{"value": 8}])
assert invoke([opaque, receiver, False], args) == "invoked"
assert calls.pop() == (opaque, receiver, [{"value": 8}])
assert len(args) == 1
for unresolved in (opaque, target, None):
    args = Array([{"value": 9}])
    assert invoke([unresolved, missing, False], args) == "resolved"
    assert fallbacks.pop() == (missing, unresolved, args)
    assert args == [{"value": 9}]
assert not calls
print("prepared-keyword-source-ok")
`;
  const result = spawnSync(pythonExecutable(), ["-c", probe,
    join(__dirname, "../src/baselib/internal.py")], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stdout.trim(), "prepared-keyword-source-ok");
});
