// sagejs-test-tier: unit
// sagejs-test-platform: true
"use strict";
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const test = require("node:test");
const { pythonExecutable } = require("../tools/python-executable.cjs");

test("shared error lookup retains live reads, bootstrap fallback and tuple validation", () => {
  // Execute the actual source functions with a traced host boundary. This
  // checks their control flow, not generated runtime linkage or timing.
  const probe = String.raw`
import ast
import sys
from types import SimpleNamespace as NS
from typing import Any

tree = ast.parse(open(sys.argv[1], encoding="utf8").read())
names = {"_internal_error_type", "_internal_is_exception_class", "ρσ_exception_matches"}
nodes = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name in names]
assert len(nodes) == 3
missing = object()
trace = []
global_object = {}
def get(value, name):
    trace.append(name)
    return value.get(name, missing) if isinstance(value, dict) else getattr(value, name, missing)
def base(): pass
def exception(): pass
def replacement(): pass
base.prototype = NS(parent=None)
exception.prototype = NS(parent=base.prototype)
replacement.prototype = NS(parent=base.prototype)
runtime = NS(undefined=missing, global_object=global_object,
    reflect=NS(get=get), jstype=lambda value: "function" if callable(value) else "object",
    object=NS(getPrototypeOf=lambda value: value.parent, isFrozen=lambda value: False),
    array=NS(isArray=lambda value: isinstance(value, list)), tuple_builtin=tuple,
    instance_of=isinstance, error=RuntimeError)
fallback = missing
def builtin(name):
    trace.append("fallback:" + name)
    return fallback
namespace = {"Any": Any, "runtime": runtime, "_internal_get_member": get,
    "_internal_type_is": lambda a, b: a == b, "_internal_builtin": builtin,
    "ρσ_instanceof_one": lambda value, candidate: False}
exec(compile(ast.Module(body=nodes, type_ignores=[]), sys.argv[1], "exec"), namespace)
lookup = namespace["_internal_error_type"]
valid = namespace["_internal_is_exception_class"]
matches = namespace["ρσ_exception_matches"]
assert lookup("Exception") is missing
assert trace == ["__sagejs_baselib_modules__"]
trace.clear()
assert matches(RuntimeError(), exception) is False
assert trace == ["__sagejs_baselib_modules__", "fallback:BaseException", "__sagejs_baselib_modules__"]
global_object["__sagejs_baselib_modules__"] = {}
trace.clear()
assert lookup("Exception") is missing
assert trace == ["__sagejs_baselib_modules__", "sagejs._baselib.errors"]
errors = {"BaseException": base, "Exception": exception}
global_object["__sagejs_baselib_modules__"]["sagejs._baselib.errors"] = errors
trace.clear()
assert valid(base)
assert trace == ["__sagejs_baselib_modules__", "sagejs._baselib.errors", "BaseException"]
trace.clear()
assert matches(RuntimeError(), exception)
assert trace == ["__sagejs_baselib_modules__", "sagejs._baselib.errors", "BaseException",
                 "prototype", "prototype", "__sagejs_baselib_modules__",
                 "sagejs._baselib.errors", "Exception"]
errors["Exception"] = replacement
assert not matches(RuntimeError(), exception)
assert matches(RuntimeError(), replacement)
for invalid in ((replacement, 3), (replacement, (replacement,))):
    try:
        matches(RuntimeError(), invalid)
    except TypeError:
        pass
    else:
        raise AssertionError("a successful earlier member must not hide an invalid tuple member")
trace.clear()
assert not valid(3)
assert trace == []
global_object.clear()
fallback = base
assert valid(base)
print("error-type-lookup-ok")
`;
  const result = spawnSync(pythonExecutable(), ["-c", probe,
    join(__dirname, "../src/baselib/internal.py")], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stdout.trim(), "error-type-lookup-ok");
});
