// sagejs-test-tier: specialized
"use strict";
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { resolve } = require("node:path");
const test = require("node:test");
const { pythonExecutable } = require("../tools/python-executable.cjs");

test("unit proposal retries preserve certification and exact fallback boundaries", () => {
  // Execute the actual ordinary Python coordinator, injecting only its
  // mathematical callees. This tests otherwise rare failure transitions;
  // the full native/public tests separately exercise real arithmetic.
  const result = spawnSync(pythonExecutable(), ["-c", String.raw`
import ast, pathlib, sys
tree = ast.parse(pathlib.Path(sys.argv[1]).read_text())
tree.body = [n for n in tree.body if isinstance(n, ast.FunctionDef) and
             n.name == '_cubic_materialize_dependency_unit']
assert len(tree.body) == 1
ns = dict(NativeIntegerVector=list, IntegerBuffer=list, FmpzMatrix=dict,
          uint64=int, _CUBIC_ANALYTIC_PRECISION=64)
exec(compile(tree, sys.argv[1], 'exec'), ns)
materialize = ns['_cubic_materialize_dependency_unit']
scale = 1 << 64
good = (1, 7, 8, 9)
bad = (2, 70, 80, 90)
failure = (False, 0, 0, 0, 0, 0)

def run(proposals, regulators=(), *, exponents=(), analytic=scale,
        dependency=scale*4, quotient_ok=True, norm=1, exception=None):
    calls, checks, products = [], [], []
    scratch, coordinates, output = [], {}, [0]*64
    proposal_iterator, regulator_iterator = iter(proposals), iter(regulators)
    def propose(*args):
        assert args[0] is scratch
        calls.append(args[-2:])
        if exception is not None:
            raise exception
        return next(proposal_iterator)
    def regulator(*args):
        checks.append(args[-2:])
        assert args[-2:] == (analytic, 64), 'certificate precision changed'
        return next(regulator_iterator)
    def quotient(*args):
        assert args[0] is scratch and args[1] is coordinates
        products.append('quotient')
        coordinates.update({(4, 0): 7, (4, 1): 8, (4, 2): 9})
        return quotient_ok
    def multiply(*args):
        products.append('multiply')
        return True
    ns.update(_cubic_reconstruct_archimedean_unit_at_scale=propose,
              _cubic_regulator_bounds=regulator,
              _cubic_matrix_exact_quotient_coordinates=quotient,
              _cubic_matrix_power_coordinates=multiply,
              _cubic_matrix_multiply_coordinates=multiply,
              _cubic_norm_form_value=lambda *args: norm)
    answer = materialize(scratch, [-55, 9, 0, 1], 1, 1, 0, 0, 1, 0, 1,
                         {}, {(0, i): e for i, e in enumerate(exponents)},
                         len(exponents), 40, 44, analytic, dependency,
                         {}, {}, {}, coordinates, 1, 0, 0, 99, 98, 97, output)
    return answer, calls, checks, products, output

answer, calls, checks, products, _ = run([good], [(10, 11)])
assert answer == (True, 7, 8, 9, 10, 11)
assert calls == [(scale, scale*4)] and len(checks) == 1 and not products

# Norm rejection and numerical inability both retry in the same scratch.
for rejected in [bad, (10, 0, 0, 0), (19, 0, 0, 0)]:
    answer, calls, checks, products, _ = run([rejected, good], [(10, 11)])
    assert answer == (True, 7, 8, 9, 10, 11)
    assert calls == [(scale, scale*4), (scale**3, scale*4)]
    assert len(checks) == 1 and not products

# A norm-one low-precision proposal still cannot bypass a regulator check.
for rejected_interval in [(0, 0), (11, 10), (1, 2), (20, 21)]:
    answer, calls, checks, products, _ = run([good, good], [rejected_interval, (10, 11)])
    assert answer == (True, 7, 8, 9, 10, 11)
    assert len(calls) == len(checks) == 2 and not products
    answer, calls, checks, products, out = run([good, good], [(1, 2), rejected_interval])
    assert answer == failure and out[59] == 44 and not products

# Preserve max(s**3, dependency_scale) in the second proposal.
answer, calls, _, products, _ = run([bad, bad], dependency=scale**4)
assert calls == [(scale, scale**4), (scale**4, scale**4)]
assert answer == (True, 7, 8, 9, 0, 1) and products == ['quotient']

# Both proposals rejected: the old bounded exact-product path remains.
answer, calls, checks, products, _ = run([bad, bad], exponents=[1, -1])
assert answer == (True, 7, 8, 9, 10, 11)
assert len(calls) == 2 and not checks and products[-1] == 'quotient'
for extra in [dict(exponents=[4097]), dict(exponents=[4096]*5),
              dict(quotient_ok=False), dict(norm=2), dict(norm=0)]:
    assert run([bad, bad], **extra)[0] == failure
assert run([bad, bad], norm=-1)[0][0] is True

for analytic, dependency in [(0, 4), (-1, 4), (4, 3), (4, 6)]:
    answer, calls, checks, products, _ = run([], analytic=analytic, dependency=dependency)
    assert answer == failure and not calls and not checks and not products

# Resource failure is not a request for more numerical precision.
try:
    run([], exception=MemoryError('arena exhausted'))
except MemoryError:
    pass
else:
    raise AssertionError('resource failure was swallowed')
print('proposal retry, fatal rejection, exact fallback, and resource cases passed')
`, resolve(__dirname, "../src/lib/sagejs/number_fields/cubic_class_number_native.py")], {
    encoding: "utf8", timeout: 30_000,
  });
  assert.equal(result.status, 0, `${result.error || ""}\n${result.stdout}\n${result.stderr}`);
});
