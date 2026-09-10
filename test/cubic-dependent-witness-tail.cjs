// sagejs-test-tier: unit
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const cp = require("node:child_process");
const path = require("node:path");

test("compact tail retains redundant witnesses within the existing row bound", () => {
  const run = cp.spawnSync("python3", ["-c", String.raw`
import ast
import importlib.util
from pathlib import Path
spec = importlib.util.spec_from_file_location("tail", "bench/class-unit-groups/cubic-dependent-witness-tail.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
source = Path("src/lib/sagejs/number_fields/cubic_class_number_native.py").read_text()
result = module.transform(source)
before, after = ast.parse(source), ast.parse(result)
original = next(n for n in before.body if isinstance(n, ast.FunctionDef) and n.name == "_cubic_compact_relation_plan")
changed = next(n for n in after.body if isinstance(n, ast.FunctionDef) and n.name == original.name)
scope = {"uint64": int, "FmpzMatrix": object, "_CUBIC_RELATION_REDUNDANCY_TAIL": 6}
exec(compile(ast.Module(body=[changed], type_ignores=[]), "tail", "exec"), scope)
planner = scope[changed.name]
after.body[after.body.index(changed)] = original
assert ast.dump(after) == ast.dump(before)
class Support:
    def __init__(self, mask): self.mask = mask; self.reads = 0
    def __getitem__(self, key):
        i, j = key
        assert j == 0 and 0 <= i < len(self.mask)
        self.reads += 1
        return self.mask[i]
count = 0
for n in range(13):
    for bits in range(1 << n):
        mask = [(bits >> i) & 1 for i in range(n)]
        support = {i for i, value in enumerate(mask) if value}
        redundant = [i for i, value in enumerate(mask) if not value]
        for limit in [0, 1, 2, 6, 64]:
            scope["_CUBIC_RELATION_REDUNDANCY_TAIL"] = limit
            storage = Support(mask)
            start, size = planner(storage, n, len(support))
            selected = support | set(range(start, n))
            expected_tail = redundant[-limit:] if limit else []
            assert selected == support | set(expected_tail)
            assert size == len(selected) <= len(support) + limit
            assert storage.reads <= n and 0 <= start <= n
            assert storage.mask == mask
            count += 1
# The 85-row frontier shape: four early redundant rows, no redundant row
# among the last six. The old positional tail keeps none of these witnesses.
scope["_CUBIC_RELATION_REDUNDANCY_TAIL"] = 6
mask = [0]*4 + [1]*81
assert planner(Support(mask), 85, 81) == (0, 85)
try:
    module.transform(result)
    raise AssertionError("accepted repeat transform")
except ValueError as error:
    assert "already transformed" in str(error)
assert count == 40955
print(count, "support masks and tail budgets; all other AST nodes unchanged")
`], {cwd: path.resolve(__dirname, ".."), encoding: "utf8", timeout: 30000, maxBuffer: 2e6});
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /40955 support masks/);
});
