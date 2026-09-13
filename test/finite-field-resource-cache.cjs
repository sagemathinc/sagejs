// sagejs-test-tier: unit
"use strict";
const assert = require("node:assert/strict");
const {spawnSync} = require("node:child_process");
const {join} = require("node:path");
const test = require("node:test");
const {pythonExecutable} = require("../tools/python-executable.cjs");

test("finite-field resource LRU uses identity and retains bounded spill ordering", () => {
  const source = String.raw`
import ast
from typing import Any
with open(${JSON.stringify(join(__dirname, "../src/baselib/finite_fields.py"))}) as handle:
    tree = ast.parse(handle.read())
names = {"_touch_fq_context_resource", "_touch_fq_element_resource"}
selected = ast.Module(body=[node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name in names], type_ignores=[])
scope = {"Any": Any}
exec(compile(selected, "finite_fields.py", "exec"), scope)
class Storage:
    def __init__(self):
        self.spills = 0
    def __eq__(self, other):
        raise AssertionError("resource ownership must not call equality")
    def _spill(self):
        self.spills += 1
for kind in ("context", "element"):
    cache = []
    scope["_fq_" + kind + "_resource_cache"] = cache
    scope["_FQ_" + kind.upper() + "_RESOURCE_CACHE_LIMIT"] = 3
    touch = scope["_touch_fq_" + kind + "_resource"]
    values = [Storage() for _ in range(5)]
    for value in values[:3]:
        touch(value)
    touch(values[0])
    touch(values[0])
    touch(values[3])
    assert [id(value) for value in cache] == [id(values[i]) for i in (2, 0, 3)]
    assert [value.spills for value in values] == [0, 1, 0, 0, 0]
    touch(values[1])
    assert [id(value) for value in cache] == [id(values[i]) for i in (0, 3, 1)]
    assert [value.spills for value in values] == [0, 1, 1, 0, 0]
print("identity LRU passed")
`;
  const result = spawnSync(pythonExecutable(), ["-c", source], {encoding:"utf8", timeout:10000});
  assert.equal(result.status, 0, result.stderr || String(result.error));
  assert.match(result.stdout, /identity LRU passed/);
});
