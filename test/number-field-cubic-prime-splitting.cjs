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

// Independent exhaustive root enumeration, including Hasse multiplicities.
// Every integer expression is below 3*65535^3 < 2^53, so Number is exact here.
function rootsByEnumeration(constant, linear, quadratic, prime) {
  let distinct = 0;
  let multiplicity = 0;
  for (let root = 0; root < prime; root++) {
    if ((((root + quadratic) * root + linear) * root + constant) % prime) continue;
    distinct++;
    if ((3 * root * root + 2 * quadratic * root + linear) % prime) multiplicity++;
    else multiplicity += (3 * root + quadratic) % prime ? 2 : 3;
  }
  return [distinct, multiplicity];
}

test("Discriminant and Frobenius cubic splitting agree with exhaustive roots and multiplicities", {
  timeout: 180_000,
}, async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-cubic-splitting-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const sourcePath = resolve(__dirname,
    "../src/lib/sagejs/kernels/polynomial/cubic_splitting.py");
  const compiled = await compileKernel({
    sourcePath,
    cacheRoot: directory,
  });
  const kernel = require(compiled.modulePath).cubic_root_multiplicity_counts;
  const implementations = [kernel.javascript, kernel.tagged, kernel.gmp, kernel];
  for (const implementation of implementations) assert.equal(typeof implementation, "function");
  let cases = 0;
  const pythonCases = [];
  function check(constant, linear, quadratic, prime) {
    const expected = rootsByEnumeration(constant, linear, quadratic, prime);
    pythonCases.push([[constant, linear, quadratic, prime], expected]);
    for (const implementation of implementations) {
      assert.deepEqual(implementation(constant, linear, quadratic, prime).map(Number),
        expected, JSON.stringify({ constant, linear, quadratic, prime }));
    }
    cases++;
  }
  for (const prime of [2, 3, 5, 7, 11, 13, 17, 19, 23, 31]) {
    for (let constant = 0; constant < prime; constant++) {
      for (let linear = 0; linear < prime; linear++) {
        for (let quadratic = 0; quadratic < prime; quadratic++) {
          check(constant, linear, quadratic, prime);
        }
      }
    }
  }
  let state = 0x43b5a97;
  function next(prime) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state % prime;
  }
  for (const prime of [17, 31, 101, 997, 1493, 65521]) {
    for (let sample = 0; sample < 100; sample++) check(next(prime), next(prime), next(prime), prime);
    for (const root of [0, 1, prime - 1]) {
      const modulo = value => ((value % prime) + prime) % prime;
      check(modulo(-(root ** 3)), modulo(3 * root ** 2), modulo(-3 * root), prime);
      const other = (root + 1) % prime;
      check(modulo(-root * root * other), modulo(root * root + 2 * root * other),
        modulo(-2 * root - other), prime);
    }
  }
  for (const implementation of implementations) {
    for (const args of [[0, 0, 0, 0], [0, 0, 0, 1], [0, 0, 0, 65536],
      [3, 0, 0, 3], [0, 3, 0, 3], [0, 0, 3, 3]]) {
      assert.deepEqual(implementation(...args).map(Number), [4, 4]);
    }
  }
  const python = spawnSync(pythonExecutable(), ["-c", String.raw`
import ast, json, pathlib, sys
module = ast.parse(pathlib.Path(sys.argv[1]).read_text())
module.body = [node for node in module.body if not isinstance(node, ast.ImportFrom)]
namespace = {"native": lambda function: function, "uint64": int}
exec(compile(module, sys.argv[1], "exec"), namespace)
for arguments, expected in json.load(sys.stdin):
    actual = namespace["cubic_root_multiplicity_counts"](*arguments)
    assert list(actual) == expected, (arguments, actual, expected)

# Check the algorithmic shortcut, not just its answer: nonsquare discriminants
# must not enter polynomial powering, while the other regimes retain it.
multiply = namespace["_multiply_mod_cubic"]
calls = 0
def counted_multiply(*arguments):
    global calls
    calls += 1
    return multiply(*arguments)
namespace["_multiply_mod_cubic"] = counted_multiply
for arguments in [(1, 0, 0, 5), (1, 1, 0, 3)]:
    calls = 0
    assert namespace["cubic_root_multiplicity_counts"](*arguments) == (1, 1)
    assert calls == 0, (arguments, calls)
for arguments, expected in [((0, 0, 0, 5), (1, 3)),
                            ((0, 4, 0, 5), (3, 3)),
                            ((1, 1, 0, 2), (0, 0))]:
    calls = 0
    assert namespace["cubic_root_multiplicity_counts"](*arguments) == expected
    assert calls > 0, arguments
`, sourcePath], { input: JSON.stringify(pythonCases), encoding: "utf8", timeout: 30_000 });
  assert.equal(python.status, 0, `${python.error || ""}\n${python.stderr}`);
  t.diagnostic(`${cases} exact splitting/multiplicity comparisons per backend`);
});
