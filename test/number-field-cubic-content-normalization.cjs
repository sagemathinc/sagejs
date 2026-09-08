// sagejs-test-tier: specialized
"use strict";
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { resolve } = require("node:path");
const test = require("node:test");
const { pythonExecutable } = require("../tools/python-executable.cjs");

test("production relation admission normalizes before authentication and publication", () => {
  const result = spawnSync(pythonExecutable(), ["-c", String.raw`
import ast, itertools, math, pathlib, sys
tree = ast.parse(pathlib.Path(sys.argv[1]).read_text())
names = {'_cubic_append_smooth_principal_relation',
         '_cubic_coordinates_are_scalar', '_cubic_extended_gcd'}
tree.body = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in names]
assert len(tree.body) == 3
for function in tree.body:
    function.decorator_list = []
observed = []
norm_result = 0
def norm(workspace, *coordinates):
    observed.append(coordinates)
    return norm_result
ns = dict(NativeIntegerVector=list, UInt64Buffer=list, FmpzMatrix=dict,
          uint64=int, _IDENTITY_OFFSET=0, _cubic_norm_form_value=norm)
exec(compile(tree, sys.argv[1], 'exec'), ns)
append = ns['_cubic_append_smooth_principal_relation']
count = 0
for identity in [(1, 0, 0), (0, 1, 0), (0, 0, -1), (1, 1, 0)]:
    workspace = list(identity)
    for coordinates in itertools.chain(itertools.product(range(-5, 6), repeat=3),
                                      [(2**300, 2**250, 0), (-2**300, 0, 2**250)]):
        scalar = ns['_cubic_coordinates_are_scalar'](workspace, *coordinates)
        divisor = 1 if scalar else math.gcd(*coordinates)
        expected = tuple(c // divisor for c in coordinates)
        rows, elements = {}, {}
        assert append(workspace, [], rows, elements, 2, 8, 3, 0,
                      *coordinates, {}, {}, False, 8) == 2
        assert observed[-1] == expected
        assert not rows and not elements  # Failed authentication publishes nothing.
        count += 1

# A newly discovered primitive unit stores its normalized generator, and
# capacity/admission guards still apply. Norm is stubbed only to select the
# branch: this is a source-boundary test, not an ideal-arithmetic oracle.
norm_result = -1
rows, elements = {}, {}
args = ([1, 0, 0], [], rows, elements, 2, 8, 3, 0, 6, -9, 3, {}, {})
assert append(*args, False, 8) == 3
assert [elements[2, i] for i in range(3)] == [2, -3, 1]
assert [rows[2, i] for i in range(3)] == [0, 0, 0]
ns['_cubic_modular_admit_relation'] = lambda *args: False
assert append(*args, True, 8) == 2
rows.clear(); elements.clear()
assert append([1, 0, 0], [], rows, elements, 8, 8, 3, 0,
              6, -9, 3, {}, {}, False, 8) == 9
assert not rows and not elements
assert count == 5332
print('5332 production coordinate cases and publication guards passed')
`, resolve(__dirname, "../src/lib/sagejs/number_fields/cubic_class_number_native.py")], {
    encoding: "utf8", timeout: 30_000,
  });
  assert.equal(result.status, 0, `${result.error || ""}\n${result.stdout}\n${result.stderr}`);
});
