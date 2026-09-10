// sagejs-test-tier: unit
"use strict";
const assert = require("node:assert/strict");
const cp = require("node:child_process");
const path = require("node:path");
const test = require("node:test");
const root = path.resolve(__dirname, "..");

test("research runner binds modular buffer size to explicit runtime policy", () => {
  const {storagePolicy}=require("../bench/class-unit-groups/cubic-broad-native.cjs");
  assert.deepEqual(storagePolicy().native_args,[]);
  assert.equal(storagePolicy().modular_entries,4161);
  assert.equal(storagePolicy(["74","512"]).modular_entries,5551);
  assert.deepEqual(storagePolicy([128,1024]).native_args,[128,1024]);
  for(const args of [[0,257],[513,257],[64,31],[64,4097],[64],[64,257,8],
    ["NaN",257],["1e2",257],[64,"256.5"],["18446744073709551615",257]]) {
    assert.throws(()=>storagePolicy(args));
  }
});

test("dimensioned cubic layout has disjoint regions and rejects oversized policy", () => {
  const run = cp.spawnSync("python3", ["-c", String.raw`
import importlib.util
import sys
import types

spec = importlib.util.spec_from_file_location("layout", "bench/class-unit-groups/cubic-dimensioned-workspace.py")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
class Record:
    def __init__(self, *values):
        assert len(values) == len(type(self).__annotations__)
        for name, value in zip(type(self).__annotations__, values):
            setattr(self, name, value)
native = types.ModuleType("sagejs.native")
native.NativeRecord = Record
sys.modules["sagejs.native"] = native
scope = {"uint64": int}
exec(m.SCHEMA, scope)
exec("def make(factor_capacity, search_limit):\n" + m.INITIALIZE + "    return layout\n", scope)
make = scope["make"]
old = make(64, 257)
assert [old.entries, old.group, old.power, old.hnf, old.maps, old.row, old.norm, old.compound,
        old.modular_row, old.modular_rank, old.modular_entries] == [8192,670,926,7840,7867,7880,7944,7954,4096,4160,4161]
for n in range(1, 513):
    a = make(n, 4096)
    regions = [(0,27), (27,3), (30,10*n), (a.group,4*n), (a.power,108*n),
               (a.hnf,27), (a.maps,13), (a.row,n), (a.norm,10), (a.compound,238)]
    for (start, size), (next_start, _) in zip(regions, regions[1:]):
        assert start + size <= next_start
    assert regions[-1][0] + regions[-1][1] == a.entries
    assert a.modular_row == n*n and a.modular_rank == n*n+n
    assert a.modular_entries == n*n+n+1
    assert a.entries < 2**32 and a.modular_entries < 2**32
assert make(74, 512).modular_entries == 5551
for n in [-1,0,513,2**32,2**64-1,2**256]:
    assert make(n,257) is False
for limit in [-1,0,31,4097,2**64-1]:
    assert make(64,limit) is False
print("512 layouts; all region boundaries disjoint; 64-factor geometry preserved")
`], {cwd: root, encoding: "utf8"});
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /512 layouts/);
});

test("source rewrite forwards layout transitively without changing unrelated bodies", () => {
  const run = cp.spawnSync("python3", ["-c", String.raw`
import ast
import importlib.util
from pathlib import Path
spec = importlib.util.spec_from_file_location("layout", "bench/class-unit-groups/cubic-dimensioned-workspace.py")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
source = Path("src/lib/sagejs/number_fields/cubic_class_number_native.py").read_text()
result, dependent = m.transform(source)
before = {n.name:n for n in ast.parse(source).body if isinstance(n,ast.FunctionDef)}
after = {n.name:n for n in ast.parse(result).body if isinstance(n,ast.FunctionDef)}
assert set(before) == set(after)
for name,node in before.items():
    rewritten = after[name]
    if name not in dependent:
        assert ast.dump(node) == ast.dump(rewritten), name
    elif name != m.ROOT:
        assert rewritten.args.args[0].arg == "layout"
        assert len(rewritten.args.args) == len(node.args.args)+1
    for call in ast.walk(rewritten):
        if isinstance(call,ast.Call) and isinstance(call.func,ast.Name) and call.func.id in dependent:
            assert isinstance(call.args[0],ast.Name) and call.args[0].id == "layout"
            assert len(call.args) == len(after[call.func.id].args.args)
assert [a.arg for a in after[m.ROOT].args.args[-2:]] == ["factor_capacity","search_limit"]
assert not any(isinstance(n,ast.Name) and n.id in m.FIELDS for n in ast.walk(ast.parse(result)))
try:
    m.transform(result)
    raise AssertionError("accepted second rewrite")
except ValueError as e:
    assert "layout" in str(e)
print(len(dependent), "helpers/root forwarded with no unrelated-body changes")
`], {cwd: root, encoding: "utf8"});
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /no unrelated-body changes/);
});
