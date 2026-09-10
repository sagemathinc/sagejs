// sagejs-test-tier: specialized
// Independent CPython/SymPy HNF and Smith oracle; requires SymPy.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const cp = require("node:child_process");
const path = require("node:path");

test("square HNF substitution preserves Smith invariants and source boundaries", () => {
  const run = cp.spawnSync("python3", ["-c", String.raw`
import ast
import importlib.util
import random
from pathlib import Path
from sympy import Matrix, ZZ
from sympy.matrices.normalforms import hermite_normal_form, smith_normal_form
spec = importlib.util.spec_from_file_location("square", "bench/class-unit-groups/cubic-square-smith.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
source = Path("src/lib/sagejs/number_fields/cubic_class_number_native.py").read_text()
result = module.transform(source)
before, after = ast.parse(source), ast.parse(result)
target = next(n for n in before.body if isinstance(n,ast.FunctionDef) and n.name == "_cubic_finish_full_relation_presentation")
params = [a.arg for a in target.args.args]
count = 0
for call in ast.walk(after):
    if isinstance(call,ast.Call) and isinstance(call.func,ast.Name) and call.func.id == target.name:
        assert call.args[params.index("relation_matrix")].id == "relation_hnf"
        assert call.args[params.index("relation_count")].id == "factor_count"
        call.args[params.index("relation_matrix")].id = "relation_matrix"
        call.args[params.index("relation_count")].id = "relation_count"
        count += 1
assert count == 2 and ast.dump(before) == ast.dump(after)
try:
    module.transform(result)
    raise AssertionError("duplicate transform accepted")
except ValueError as error:
    assert "already transformed" in str(error)

def invariants(a, n):
    d = smith_normal_form(a,domain=ZZ)
    return [abs(int(d[i,i])) for i in range(n)]
rng = random.Random(20260910)
cases = 0
for n in range(1,13):
    for trial in range(20):
        # The diagonal submatrix establishes full column rank independently.
        rows = [[rng.randrange(1,30) if i==j else 0 for j in range(n)] for i in range(n)]
        rows += [[rng.randrange(-20,21) for _ in range(n)] for _ in range(trial%7)]
        rows += [rows[0][:], [0]*n]
        a = Matrix(rows)
        h = hermite_normal_form(a.T).T
        assert h.shape == (n,n)
        assert invariants(a,n) == invariants(h,n)
        cases += 1
for bits in [65,129,257,513]:
    a=Matrix([[1<<bits,0],[0,3**(bits//2)],[1<<bits,3**(bits//2)],[0,0]])
    h=hermite_normal_form(a.T).T
    assert invariants(a,2) == invariants(h,2)
    cases += 1
assert cases == 244
print(cases,"independent Smith comparisons; only two call sites changed")
`], {cwd: path.resolve(__dirname, ".."), encoding: "utf8", timeout: 30000, maxBuffer: 2e6});
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /244 independent Smith comparisons/);
});
