// sagejs-test-tier: specialized
"use strict";
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { resolve } = require("node:path");
const test = require("node:test");
const { pythonExecutable } = require("../tools/python-executable.cjs");

test("a certification target does not discard integral information before full rank", () => {
  const result = spawnSync(pythonExecutable(), ["-c", String.raw`
import ast, pathlib, sys
tree = ast.parse(pathlib.Path(sys.argv[1]).read_text())
names = {'_cubic_relation_rank_multiply', '_cubic_modular_admit_relation'}
tree.body = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in names]
assert len(tree.body) == 2
ns = dict(UInt64Buffer=list, FmpzMatrix=dict, uint64=int, checked_uint64=int,
          _CUBIC_MAX_FACTORS=64, _CUBIC_RELATION_RANK_PRIME=27449,
          _CUBIC_MODULAR_ROW_OFFSET=4096, _CUBIC_MODULAR_RANK_OFFSET=4160)
exec(compile(tree, sys.argv[1], 'exec'), ns)
admit = ns['_cubic_modular_admit_relation']
w, rows, elements = [0]*4161, {}, {}
def offer(row, vector, element, target=1):
    rows.update({(row, c): v for c, v in enumerate(vector)})
    elements.update({(row, c): v for c, v in enumerate(element)})
    return admit(w, rows, elements, row, target, 2)

assert offer(0, (2, 0), (1, 0, 0)) and w[4160] == 1
# Dependent modulo 27449, yet this row changes the eventual integral index
# from det(diag(2,1))=2 to det(diag(1,1))=1. The old quota discarded it.
assert offer(1, (1, 0), (2, 0, 0)) and w[4160] == 1
assert offer(2, (0, 1), (3, 0, 0)) and w[4160] == 2
# The collector can stop now; admission retains its post-checkpoint behavior.
assert not offer(3, (1, 1), (4, 0, 0))
# A later checkpoint still admits dependent unit witnesses, not duplicates.
assert offer(3, (1, 1), (4, 0, 0), target=8)
assert not offer(4, (1, 1), (4, 0, 0), target=8)
# A zero valuation row can carry a unit witness. Keep it before full rank,
# without falsely increasing rank. Inputs here are canonical word residues,
# as supplied by the bounded smooth-factorization caller.
w[:] = [0]*4161
rows.clear(); elements.clear()
assert offer(0, (0, 0), (1, 0, 0), target=0)
assert w[4160] == 0
print('rank-pending admission, duplicate, and checkpoint cases passed')
`, resolve(__dirname, "../src/lib/sagejs/number_fields/cubic_class_number_native.py")], {
    encoding: "utf8", timeout: 30_000,
  });
  assert.equal(result.status, 0, `${result.error || ""}\n${result.stdout}\n${result.stderr}`);
});
