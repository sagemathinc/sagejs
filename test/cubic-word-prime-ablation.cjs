// sagejs-test-tier: specialized
"use strict";
const assert = require("node:assert/strict");
const cp = require("node:child_process");
const path = require("node:path");
const test = require("node:test");

test("word-prime ablation changes only the checked divisor representation", () => {
  const run = cp.spawnSync("python3", ["-c", String.raw`
import ast
import importlib.util
import random
from pathlib import Path

spec = importlib.util.spec_from_file_location("ablation", "bench/class-unit-groups/cubic-word-prime-ablation.py")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
source = Path("src/lib/sagejs/number_fields/cubic_class_number_native.py").read_text()
result = m.transform(source)
before, after = ast.parse(source), ast.parse(result)
target = next(n for n in after.body if isinstance(n, ast.FunctionDef) and n.name == "_cubic_append_smooth_principal_relation")
changes = []
class Undo(ast.NodeTransformer):
    def visit_AnnAssign(self, node):
        if isinstance(node.target, ast.Name) and node.target.id == "rational_prime":
            assert ast.unparse(node.annotation) == "uint64"
            assert ast.unparse(node.value) == "checked_uint64(workspace[group_base])"
            changes.append(node)
            return ast.Assign(targets=[node.target], value=node.value.args[0])
        return node
Undo().visit(target)
assert len(changes) == 1
assert ast.dump(before) == ast.dump(after)
for bad in [result, source.replace("rational_prime = workspace[group_base]", "rational_prime = 7")]:
    try:
        m.transform(bad)
    except ValueError:
        pass
    else:
        raise AssertionError("accepted an unexpected prime load")

# Execute the actual changed valuation loop against unbounded Python integers.
# All other authentication remains outside this narrowly extracted witness.
def loop_function(text):
    helper = next(n for n in ast.parse(text).body if isinstance(n, ast.FunctionDef) and n.name == "_cubic_append_smooth_principal_relation")
    loop = next(n for n in ast.walk(helper) if isinstance(n, ast.While) and ast.unparse(n.test) == "remaining_norm % rational_prime == 0")
    prime_load = next(n for n in ast.walk(helper) if isinstance(n, (ast.Assign, ast.AnnAssign)) and ast.unparse(n).startswith("rational_prime"))
    fn = ast.parse("def valuation(norm, prime):\n    workspace = [prime]\n    group_base = 0\n    remaining_norm = norm\n    rational_valuation = 0\n").body[0]
    fn.body.extend([prime_load, loop, ast.parse("return remaining_norm, rational_valuation").body[0]])
    scope = {"uint64": int, "checked_uint64": checked}
    exec(compile(ast.fix_missing_locations(ast.Module(body=[fn], type_ignores=[])), "valuation", "exec"), scope)
    return scope["valuation"]
def checked(value):
    if not 0 <= value < 2**64:
        raise OverflowError
    return value
reference, candidate = loop_function(source), loop_function(result)
rng = random.Random(20260911)
count = 0
for prime in [2, 3, 5, 31, 2819, 4093, 65521, 2**32-5, 2**64-59]:
    for bits in [1, 31, 63, 64, 127, 256, 1024, 2048]:
        for exponent in [0, 1, 2, 12, 31]:
            norm = (rng.getrandbits(bits) + 1) * prime**exponent
            expected = reference(norm, prime)
            assert candidate(norm, prime) == expected
            remainder, valuation = expected
            assert remainder * prime**valuation == norm
            assert remainder % prime != 0
            count += 1
for prime in [-1, 2**64]:
    try:
        candidate(1, prime)
    except OverflowError:
        pass
    else:
        raise AssertionError("conversion wrapped")
assert count == 360
print("one statement changed; 360 exact valuation cases; checked overflow")
`], { cwd: path.resolve(__dirname, ".."), encoding: "utf8", timeout: 30000, maxBuffer: 2e6 });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.match(run.stdout, /360 exact valuation cases/);
});
