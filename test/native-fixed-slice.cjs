// sagejs-test-tier: specialized
"use strict";
const { pythonExecutable } = require("../tools/python-executable.cjs");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { resolve } = require("node:path");
const test = require("node:test");
const { mkdtempSync, readFileSync, writeFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { compileKernel } = require("../tools/native-kernel/compiler.cjs");
const { lowerSource } = require("../tools/native-kernel/ir.cjs");

test("ordinary Sage.js execution uses the current slice fallback", { timeout: 120000 }, t => {
  const source = readFileSync(resolve(__dirname, "../src/lib/sagejs/native.py"), "utf8") + `
with NativeIntegerVector(3, 4096) as vector:
    vector[0:3] = (1, 2, 3)
    vector[0:3] = (vector[2], vector[0], vector[1])
    assert vector[0] == 3 and vector[1] == 1 and vector[2] == 2
    try:
        vector[0:2] = (9,)
    except ValueError:
        pass
    else:
        raise AssertionError("resizing accepted")
    assert vector[0] == 3 and vector[1] == 1
print("sagejs-slice-fallback-ok")
`;
  const directory = mkdtempSync(resolve(tmpdir(), "slice-fallback-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const sourcePath = resolve(directory, "fallback.py");
  writeFileSync(sourcePath, source);
  const result = spawnSync(process.execPath,
    [resolve(__dirname, "../bin/sagejs"), "--python", sourcePath],
    { encoding: "utf8", timeout: 110000 });
  assert.equal(result.status, 0, String(result.error || "") + result.stderr);
  assert.match(result.stdout, /sagejs-slice-fallback-ok/);
});

test("compiled fixed slices snapshot overlapping exact values", async t => {
  const directory = mkdtempSync(resolve(tmpdir(), "native-slice-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const sourcePath = resolve(directory, "slice.py");
  writeFileSync(sourcePath, `
from sagejs.native import native, NativeExactArena, NativeIntegerVector, uint64
def touch(v: NativeIntegerVector) -> int:
    v[0] = 99
    return 17

def bound(v: NativeIntegerVector) -> uint64:
    v[1] = 99
    return 0

@native
def swap(value: int) -> int:
    with NativeExactArena(8192, 1048576) as arena:
        v = arena.integer_vector(3, 0)
        v[0:3] = (value, 2, 3)
        v[0:3] = (v[2], v[0], v[1])
        return v[0] + 10 * v[1] + 100 * v[2]

@native
def side_effects(value: int) -> int:
    with NativeExactArena(8192, 1048576) as arena:
        v = arena.integer_vector(3, 0)
        v[0] = value
        retained = v[0]
        v[0:2] = (retained, touch(v))
        v[bound(v):2] = (v[0], v[1])
        return v[0] * 100 + v[1]

@native
def probe(start: uint64, stop: uint64) -> int:
    with NativeExactArena(8192, 1048576) as arena:
        v = arena.integer_vector(3, 0)
        v[start:stop] = (7, 8)
        return v[0] + v[1] + v[2]

@native
def empty(start: uint64) -> int:
    with NativeExactArena(8192, 1048576) as arena:
        v = arena.integer_vector(3, 0)
        v[start:start] = ()
        return v[0]
`);
  const built = await compileKernel({ sourcePath, functions: ["swap", "probe", "empty", "side_effects"],
    cacheRoot: resolve(directory, "cache") });
  const module = require(built.modulePath);
  const kernel = module.swap;
  for (const backend of ["javascript", "gmp", "fmpz"]) {
    assert.equal(typeof kernel[backend], "function", backend);
    for (const value of [0n, -7n, 1n << 300n]) {
      assert.equal(kernel[backend](value), 203n + 10n * value, backend);
      assert.equal(module.side_effects[backend](value), 100n * value + 17n, backend);
    }
    assert.equal(module.probe[backend](0n, 2n), 15n);
    assert.equal(module.probe[backend](1n, 3n), 15n);
    assert.throws(() => module.probe[backend](2n, 4n), /slice out of range/);
    assert.throws(() => module.probe[backend](2n, 1n), /slice out of range/);
    assert.throws(() => module.probe[backend](0n, 3n), /cannot resize/);
    assert.equal(module.empty[backend](3n), 0n);
    assert.throws(() => module.empty[backend](4n), /slice out of range/);
  }
});

test("unsupported native slice forms fail closed", async () => {
  const prefix = "from sagejs.native import native, NativeIntegerVector, uint64\n@native\ndef f(v: NativeIntegerVector, start: uint64) -> int:\n";
  for (const [statement, message] of [
    ["v[:2] = (1, 2)", /explicit bounds|unsupported AST_Null/],
    ["v[0:2:2] = (1, 2)", /without a step/],
    ["v[0:2] = [1, 2]", /literal tuple/],
    ["v[0:2] += (1, 2)", /contiguous assignment/],
  ]) {
    await assert.rejects(lowerSource(prefix + "    " + statement + "\n    return 0\n",
      "invalid-slice.py", { functions: ["f"] }), message);
  }
});

test("fixed vector slices preserve snapshots and reject resizing before mutation", () => {
  const result = spawnSync(pythonExecutable(), ["-c", String.raw`
import importlib.util
spec = importlib.util.spec_from_file_location("native", ${JSON.stringify(resolve(__dirname, "../src/lib/sagejs/native.py"))})
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
with m.NativeIntegerVector(4, 4096) as v:
    v[0:4] = (1, 2, 3, 4)
    v[0:3] = (v[2], v[0], v[1])
    assert [v[i] for i in range(4)] == [3, 1, 2, 4]
    v[4:4] = ()
    v[1:2] = (1 << 300,)
    assert v[1] == 1 << 300
    before = [v[i] for i in range(4)]
    for index, value, error in [
        (slice(0, 2), (7,), ValueError),
        (slice(-1, 1), (7, 8), IndexError),
        (slice(3, 5), (7, 8), IndexError),
        (slice(2, 1), (), IndexError),
        (slice(0, 4, 2), (7, 8), ValueError),
        (slice(None, 2), (7, 8), ValueError),
        (slice(0, 2), [7, 8], TypeError),
        (slice(0.5, 2.5), (7, 8), TypeError),
    ]:
        try:
            v[index] = value
        except error:
            pass
        else:
            raise AssertionError((index, value))
        assert [v[i] for i in range(4)] == before
    # RHS conversion failure cannot publish an earlier element.
    try:
        v[0:2] = (7, object())
    except TypeError:
        pass
    else:
        raise AssertionError("invalid scalar accepted")
    assert [v[i] for i in range(4)] == before
try:
    v[0:0] = ()
except ValueError:
    pass
else:
    raise AssertionError("closed slice accepted")
print("fixed-slice-fallback-ok")
`], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /fixed-slice-fallback-ok/);
});
