// sagejs-test-tier: specialized
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const test = require("node:test");
const { compileKernel } = require("../tools/native-kernel/compiler.cjs");
const { pythonExecutable } = require("../tools/python-executable.cjs");

// The previous, deliberately uncompressed 80-term integer enclosure.
function originalBounds(denominator, scale) {
  if (denominator <= 1n || scale <= 0n) return [1n, 0n];
  let lower = 0n, upper = 0n, power = denominator;
  for (let index = 0n; index < 80n; index++) {
    const term = (2n * index + 1n) * power;
    const floor = scale / term;
    const ceiling = (scale + term - 1n) / term;
    if (index % 2n === 0n) { lower += floor; upper += ceiling; }
    else { lower -= ceiling; upper -= floor; }
    power *= denominator * denominator;
  }
  const remainder = 161n * power;
  return [lower, upper + (scale + remainder - 1n) / remainder];
}

test("compressed arctangent tails preserve every endpoint of the 80-term oracle", {
  timeout: 180_000,
}, async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-cubic-arctan-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const sourcePath = resolve(__dirname,
    "../src/lib/sagejs/number_fields/cubic_class_number_native.py");
  const compiled = await compileKernel({ sourcePath, cacheRoot: directory,
    functions: ["_cubic_arctan_reciprocal_bounds"] });
  const kernel = require(compiled.modulePath)._cubic_arctan_reciprocal_bounds;
  const implementations = [kernel.javascript, kernel.tagged, kernel.gmp, kernel];
  for (const implementation of implementations) assert.equal(typeof implementation, "function");
  const cases = [];
  function check(denominator, scale) {
    const expected = originalBounds(denominator, scale);
    for (const implementation of implementations) {
      assert.deepEqual(implementation(denominator, scale).map(BigInt), expected,
        `denominator=${denominator}, scale=${scale}`);
    }
    cases.push([[String(denominator), String(scale)], expected.map(String)]);
  }
  for (const denominator of [2n, 3n, 5n, 7n, 239n, 257n, (1n << 64n) + 1n]) {
    for (const bits of [0n, 1n, 16n, 63n, 64n, 65n, 128n, 256n, 512n, 1000n, 4096n]) {
      const scale = 1n << bits;
      for (const offset of [-1n, 0n, 1n]) check(denominator, scale + offset);
    }
    // Both parities, equality versus strict inequality, and the last term.
    for (const index of [0n, 1n, 2n, 7n, 16n, 39n, 78n, 79n, 80n]) {
      const term = (2n * index + 1n) * denominator ** (2n * index + 1n);
      for (const offset of [-1n, 0n, 1n]) check(denominator, term + offset);
    }
  }
  for (const denominator of [-3n, 0n, 1n, 2n]) {
    for (const scale of [-1n, 0n, 1n]) check(denominator, scale);
  }
  const python = spawnSync(pythonExecutable(), ["-c", String.raw`
import ast, json, pathlib, sys
module = ast.parse(pathlib.Path(sys.argv[1]).read_text())
names = {'_cubic_arctan_reciprocal_bounds', '_cubic_dyadic_ceiling_quotient'}
module.body = [node for node in module.body
               if isinstance(node, ast.FunctionDef) and node.name in names]
for node in module.body:
    node.decorator_list = []
namespace = {'uint64': int}
exec(compile(module, sys.argv[1], 'exec'), namespace)
for arguments, expected in json.load(sys.stdin):
    actual = namespace['_cubic_arctan_reciprocal_bounds'](*map(int, arguments))
    assert list(actual) == list(map(int, expected)), (arguments, actual, expected)
`, sourcePath], { input: JSON.stringify(cases), encoding: "utf8", timeout: 30_000 });
  assert.equal(python.status, 0, `${python.error || ""}\n${python.stderr}`);
  t.diagnostic(`${cases.length} exact endpoint comparisons per backend and CPython`);
});

test("generator search computes constants once and binds them to every probe", () => {
  const sourcePath = resolve(__dirname,
    "../src/lib/sagejs/number_fields/cubic_class_number_native.py");
  const python = spawnSync(pythonExecutable(), ["-c", String.raw`
import ast, pathlib, sys
module = ast.parse(pathlib.Path(sys.argv[1]).read_text())
node = next(node for node in module.body if isinstance(node, ast.FunctionDef)
            and node.name == '_cubic_grh_generator_bound')
namespace = {}
exec('from __future__ import annotations\n' + ast.unparse(node), namespace)
search = namespace[node.name]
for cap in range(1, 70):
    for threshold in range(2, cap + 3):
        calls = []
        def constants(*args):
            calls.append('constants')
            return True, 17, -29
        def certify(*args):
            assert args[-2:] == (17, -29)
            assert calls and calls[0] == 'constants'
            calls.append(args[9])
            return args[9] >= threshold
        namespace['_cubic_grh_generator_constants'] = constants
        namespace['_cubic_grh_generator_bound_is_certified'] = certify
        result = search(*([None] * 7), 1, 1, 0, 0, 12716, cap, 2**64, 64)
        expected = cap if cap <= 2 else threshold if threshold <= cap else 0
        assert result == expected, (cap, threshold, result, expected)
        assert calls.count('constants') == (0 if cap <= 2 else 1)
def invalid(*args):
    return False, 0, 0
def forbidden(*args):
    raise AssertionError('a failed constant enclosure must not authorize a probe')
namespace['_cubic_grh_generator_constants'] = invalid
namespace['_cubic_grh_generator_bound_is_certified'] = forbidden
assert search(*([None] * 7), 1, 1, 0, 0, 12716, 32, 2**64, 64) == 0
`, sourcePath], { encoding: "utf8", timeout: 30_000 });
  assert.equal(python.status, 0, `${python.error || ""}\n${python.stderr}`);
});
