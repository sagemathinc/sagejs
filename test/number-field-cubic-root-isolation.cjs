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

const floorHalf = n => n >= 0n ? n / 2n : -((-n + 1n) / 2n);
const value = (c, t, s) => ((t + c[2] * s) * t + c[1] * s * s) * t + c[0] * s ** 3n;

// Independent, unaccelerated integer bisection. No Newton proposals.
function bisect(c, s) {
  let bound = 1n;
  for (const coefficient of c.slice(0, 3)) {
    const candidate = (coefficient < 0n ? -coefficient : coefficient) + 1n;
    if (candidate > bound) bound = candidate;
  }
  let lower = -bound * s, upper = bound * s;
  if (value(c, lower, s) >= 0n || value(c, upper, s) <= 0n) return [1n, 0n];
  for (let iteration = 0; upper - lower > 1n && iteration < 1024; iteration++) {
    const middle = floorHalf(lower + upper), sign = value(c, middle, s);
    if (sign < 0n) lower = middle;
    else if (sign > 0n) upper = middle;
    else lower = upper = middle;
  }
  return upper - lower > 1n ? [1n, 0n] : [lower, upper];
}

test("shared cubic root isolation agrees with exact bisection across integer backends", {
  timeout: 240_000,
}, async t => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-cubic-roots-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const sourcePath = resolve(__dirname, "../src/lib/sagejs/number_fields/cubic_class_number_native.py");
  const compiled = await compileKernel({ sourcePath, cacheRoot: directory,
    functions: ["_cubic_real_root_interval"] });
  const kernel = require(compiled.modulePath)._cubic_real_root_interval;
  const implementations = [kernel.javascript, kernel.tagged, kernel.gmp, kernel];
  for (const implementation of implementations) assert.equal(typeof implementation, "function");
  const fields = [[-55n, 9n, 0n, 1n], [-63n, -11n, -1n, 1n], [-4n, 3n, -1n, 1n]];
  // Exhaust a small box, including non-monotone cubics with a unique real root.
  for (let c = -4n; c <= 4n; c++) for (let a = -4n; a <= 4n; a++) for (let b = -4n; b <= 4n; b++) {
    if (b*b*a*a - 4n*a*a*a - 4n*b*b*b*c - 27n*c*c + 18n*b*a*c < 0n) fields.push([c,a,b,1n]);
  }
  // Exact integer roots, both signs, including a very unbalanced root bound.
  for (const r of [-10000n, -1n, 0n, 1n, 10000n]) fields.push([-r, 1n, -r, 1n]);
  const cases = [];
  for (const c of fields) {
    const packed = kernel.packIntegerBuffer(c);
    for (const bits of [0n, 16n, 64n, 192n, 512n]) {
      const scale = 1n << bits, expected = bisect(c, scale);
      for (const implementation of implementations) {
        const actual = implementation(packed, scale).map(BigInt);
        assert.deepEqual(actual, expected, `${c}; bits=${bits}`);
        if (actual[1] >= actual[0]) {
          assert.ok(actual[1] - actual[0] <= 1n);
          assert.ok(value(c, actual[0], scale) <= 0n);
          assert.ok(value(c, actual[1], scale) >= 0n);
        }
      }
      cases.push([c.map(String), String(scale), expected.map(String)]);
    }
  }
  for (const scale of [-1n, 0n]) {
    const c = fields[0], expected = [1n, 0n];
    for (const implementation of implementations) assert.deepEqual(implementation(kernel.packIntegerBuffer(c), scale).map(BigInt), expected);
    cases.push([c.map(String), String(scale), expected.map(String)]);
  }
  const python = spawnSync(pythonExecutable(), ["-c", String.raw`
import ast, json, pathlib, sys
module = ast.parse(pathlib.Path(sys.argv[1]).read_text())
names = {'_cubic_scaled_polynomial_value', '_cubic_real_root_interval'}
module.body = [n for n in module.body if isinstance(n, ast.FunctionDef) and n.name in names]
for node in module.body:
    node.decorator_list = []
namespace = {'uint64': int, 'IntegerBuffer': list}
exec(compile(module, sys.argv[1], 'exec'), namespace)
for c, scale, expected in json.load(sys.stdin):
    actual = namespace['_cubic_real_root_interval'](list(map(int, c)), int(scale))
    assert list(actual) == list(map(int, expected)), (c, scale, actual, expected)
`, sourcePath], { input: JSON.stringify(cases), encoding: "utf8", timeout: 60_000 });
  assert.equal(python.status, 0, `${python.error || ""}\n${python.stderr}`);
  t.diagnostic(`${cases.length} exact interval comparisons per backend and CPython`);
});
