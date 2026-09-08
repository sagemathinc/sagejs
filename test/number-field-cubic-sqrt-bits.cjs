// sagejs-test-tier: specialized
"use strict";
const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, writeFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { compileKernel } = require("../tools/native-kernel/compiler.cjs");

test("actual cubic square-root setup agrees with CPython isqrt", { timeout: 240_000 }, async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-cubic-sqrt-bits-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const production = readFileSync(join(__dirname,
    "../src/lib/sagejs/number_fields/cubic_class_number_native.py"), "utf8");
  const sourcePath = join(directory, "sqrt.py");
  // Compile the actual helpers, plus an arena caller forcing the resident
  // fmpz closure. Do not duplicate the square-root algorithm in the fixture.
  writeFileSync(sourcePath, production + `
@native
def resident_sqrt(value: int) -> int:
    with NativeExactArena(1048576, 3145728) as arena:
        values = arena.integer_vector(1, 0)
        values[0] = _cubic_ceil_sqrt(value)
        return values[0]
`);
  const compiled = await compileKernel({ sourcePath,
    functions: ["_cubic_ceil_sqrt", "_cubic_floor_sqrt", "resident_sqrt"],
    cacheRoot: join(directory, "cache") });
  const module = require(compiled.modulePath);
  assert.equal(module.nativeAvailable, true);
  const values = new Set([-2n, -1n, 0n, 1n, 2n, 3n]);
  for (let i = 2n; i < 80n; i++) {
    for (const delta of [-1n, 0n, 1n]) values.add(i * i + delta);
  }
  for (const bits of [31, 32, 63, 64, 65, 127, 128, 255, 511, 1024, 4096]) {
    for (const root of [1n << BigInt(bits), (1n << BigInt(bits)) + 17n]) {
      for (const delta of [-1n, 0n, 1n]) values.add(root * root + delta);
    }
  }
  const inputs = [...values];
  const python = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
  const oracle = spawnSync(python, ["-c", `
import json, math, sys
result = []
for text in json.load(sys.stdin):
    n = int(text, 16)
    floor = math.isqrt(n) if n >= 0 else -1
    ceil = floor + (floor * floor < n) if n >= 0 else -1
    result.append([str(floor), str(ceil)])
print(json.dumps(result))
`], { encoding: "utf8", input: JSON.stringify(inputs.map(x => x.toString(16))) });
  assert.equal(oracle.status, 0, oracle.stderr);
  const expected = JSON.parse(oracle.stdout);
  for (let i = 0; i < inputs.length; i++) {
    for (const backend of ["javascript", "gmp", "tagged"]) {
      assert.equal(module._cubic_ceil_sqrt[backend](inputs[i]), BigInt(expected[i][1]));
      assert.equal(module._cubic_floor_sqrt[backend](inputs[i]), BigInt(expected[i][0]));
    }
    assert.equal(module.resident_sqrt.fmpz(inputs[i]), BigInt(expected[i][1]));
  }
});
