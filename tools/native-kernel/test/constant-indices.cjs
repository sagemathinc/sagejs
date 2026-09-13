// sagejs-test-tier: specialized
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const test = require("node:test");
const { compileKernel } = require("../compiler.cjs");
const { generateHostCore } = require("../c-backend.cjs");
const { evaluateIntegerConstant } = require("../integer-constants.cjs");
const { lowerSource } = require("../ir.cjs");
const { pythonExecutable } = require("../../python-executable.cjs");
const { removeLoadedNativeCache } = require("../../../test/helpers/native-cache-cleanup.cjs");

const root = resolve(__dirname, "../../..");
const source = `
from sagejs.native import NativeExactArena, NativeIntegerVector, native, uint64

OFFSET = 2
QUOTIENT = -3 // 2
REMAINDER = -3 % 2
NEG_QUOTIENT = 3 // -2
NEG_REMAINDER = 3 % -2
BIG = (1 << 300) + 7
BIG_QUOTIENT = BIG // -7
BIG_REMAINDER = BIG % -7
WORD_MAX = (1 << 64) - 1

@native
def constants() -> tuple[int, int, int, int, int, int]:
    return QUOTIENT, REMAINDER, NEG_QUOTIENT, NEG_REMAINDER, BIG_QUOTIENT, BIG_REMAINDER

@native
def next_index(values: NativeIntegerVector) -> int:
    values[0] += 1
    return 3

@native
def indices(length: uint64, seed: int) -> tuple[int, int, int]:
    with NativeExactArena(65536, 65536) as arena:
        values = arena.integer_vector(length, 4096)
        matrix = arena.integer_matrix(2, 3, 4096)
        values[OFFSET + 6] = seed
        values[-3 // 2 + 2] = 0
        values[next_index(values) + 0] = seed + 1
        matrix[REMAINDER, OFFSET * 2 - 2] = values[OFFSET + 6]
        return matrix[3 // 2, -3 % 2 + 1], values[0], values[3]

@native
def vector_indices(length: uint64, seed: int) -> tuple[int, int, int]:
    with NativeExactArena(1048576, 3145728) as arena:
        values = arena.integer_vector(length, 0)
        values[OFFSET + 6] = seed
        values[-3 // 2 + 2] = 0
        values[next_index(values) + 0] = seed + 1
        return values[OFFSET + 6], values[0], values[3]

@native
def local_index(length: uint64, index: int) -> int:
    with NativeExactArena(65536, 65536) as arena:
        values = arena.integer_vector(length, 4096)
        OFFSET = index
        values[OFFSET + 0] = 71
        return values[OFFSET + 0]

@native
def parameter_index(OFFSET: int) -> int:
    with NativeExactArena(65536, 65536) as arena:
        values = arena.integer_vector(4, 4096)
        values[OFFSET + 0] = 91
        return values[OFFSET + 0]

@native
def invalid_negative() -> int:
    with NativeExactArena(65536, 65536) as arena:
        values = arena.integer_vector(4, 4096)
        return values[OFFSET - 3]

@native
def invalid_oversized() -> int:
    with NativeExactArena(65536, 65536) as arena:
        values = arena.integer_vector(4, 4096)
        return values[WORD_MAX + 1]

@native
def invalid_word_max() -> int:
    with NativeExactArena(65536, 65536) as arena:
        values = arena.integer_vector(4, 4096)
        return values[WORD_MAX - 0]

@native
def invalid_zero_divisor() -> int:
    with NativeExactArena(65536, 65536) as arena:
        values = arena.integer_vector(4, 4096)
        return values[OFFSET // 0]

@native
def fmpz_invalid(which: uint64) -> int:
    with NativeExactArena(1048576, 3145728) as arena:
        values = arena.integer_vector(4, 0)
        if which == 0:
            return values[OFFSET - 3]
        if which == 1:
            return values[WORD_MAX + 1]
        if which == 2:
            return values[WORD_MAX - 0]
        return values[OFFSET // 0]

@native
def big_intermediate() -> int:
    with NativeExactArena(1048576, 3145728) as arena:
        values = arena.integer_vector(4, 0)
        values[(BIG * BIG) // BIG - BIG + 2] = 73
        return values[2]
`;

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root, encoding: "utf8", timeout: 120_000,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function operations(items) {
  return (items || []).flatMap((op) => [
    op, ...operations(op.body), ...operations(op.alternative),
    ...operations(op.condition?.operations),
  ]);
}

test("constant floor and modulo match CPython for signed arbitrary integers", () => {
  class AST_SymbolRef { constructor(name) { this.name = name; } }
  class AST_Binary {
    constructor(operator) {
      this.operator = operator;
      this.left = new AST_SymbolRef("left");
      this.right = new AST_SymbolRef("right");
    }
  }
  const values = [-17n, -7n, -3n, -2n, -1n, 0n, 1n, 2n, 3n, 7n, 17n,
    -(1n << 301n) - 19n, (1n << 301n) + 19n];
  const cases = values.flatMap((left) => values.filter((x) => x !== 0n)
    .flatMap((right) => ["//", "%"].map((operator) =>
      [String(left), String(right), operator])));
  const expected = JSON.parse(run(pythonExecutable(), ["-c", `
import json
cases = json.loads(${JSON.stringify(JSON.stringify(cases))})
print(json.dumps([str(int(a) // int(b) if op == "//" else int(a) % int(b)) for a, b, op in cases]))
`]));
  for (let i = 0; i < cases.length; i++) {
    const [left, right, operator] = cases[i];
    const result = evaluateIntegerConstant(new AST_Binary(operator),
      () => undefined, (name) => BigInt(name === "left" ? left : right));
    assert.equal(String(result), expected[i], cases[i].join(" "));
  }
  for (const operator of ["//", "%"]) {
    assert.equal(evaluateIntegerConstant(new AST_Binary(operator),
      () => undefined, () => 0n), undefined);
  }
  assert.equal(evaluateIntegerConstant(new AST_Binary("+"),
    () => undefined, () => undefined), undefined);
  assert.equal(evaluateIntegerConstant(new AST_Binary("<<"),
    () => undefined, () => -1n), undefined);
  assert.equal(evaluateIntegerConstant(new AST_Binary("<<"),
    () => undefined, () => 65537n), undefined);
});

test("only pure word-sized indices fold, with source provenance and bounds retained", async () => {
  const path = "constant-indices.py";
  const ir = await lowerSource(source, path);
  const body = (name) => operations(ir.functions.find((fn) => fn.name === name).body);
  const indexed = body("indices");
  assert.ok(indexed.some((op) => op.kind === "uint64.constant" && String(op.value) === "8"));
  assert.ok(indexed.some((op) => op.kind === "native.call" && op.function === "next_index"));
  assert.ok(indexed.filter((op) => op.kind === "uint64.constant")
    .every((op) => op.provenance?.file === path));
  const matrices = indexed.filter((op) =>
    op.kind === "integer.matrix.get" || op.kind === "integer.matrix.set");
  assert.ok(matrices.length > 0);
  assert.ok(matrices.every((op) => op.rowType === "uint64" && op.columnType === "uint64"));
  for (const name of ["local_index", "parameter_index", "invalid_negative", "invalid_oversized"]) {
    const accesses = body(name).filter((op) =>
      op.kind === "integer.vector.get" || op.kind === "integer.vector.set");
    assert.ok(accesses.length > 0);
    assert.ok(accesses.every((op) => op.indexType === "Integer"), name);
  }
  assert.ok(body("invalid_word_max").some((op) =>
    op.kind === "integer.vector.get" && op.indexType === "uint64"));
  assert.ok(body("invalid_zero_divisor").some((op) =>
    op.kind === "integer.binary" && op.operation === "floordiv"));
  assert.ok(body("big_intermediate").every((op) => op.kind !== "integer.binary"));
  const core = generateHostCore(ir);
  assert.equal(core.audit.isolated, true);
  assert.equal(core.audit.hostCallbacks, 0);
  assert.match(core.source, /index out of range/);
});

test("a later local binding cannot be folded as a module constant", async () => {
  for (const assignment of ["OFFSET = 1", "OFFSET: int = 1"]) {
    await assert.rejects(lowerSource(`
from sagejs.native import native
OFFSET = 2
@native
def unbound() -> int:
    result = OFFSET + 1
    ${assignment}
    return result
`, "unbound-constant.py"), /unknown native value OFFSET/);
  }
  for (const expression of ["3 // 0", "3 % 0"]) {
    await assert.rejects(lowerSource(`
from sagejs.native import native
VALUE = ${expression}
@native
def invalid() -> int:
    return VALUE
`, "invalid-constant.py"), /unknown native value VALUE/);
  }
});

test("compiled and JavaScript indices agree with the ordinary CPython source", async () => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-constant-indices-"));
  try {
    const sourcePath = join(directory, "witness.py");
    writeFileSync(sourcePath, source);
    const expected = JSON.parse(run(pythonExecutable(), ["-c", `
import importlib.util, json, runpy, sys, types
package = types.ModuleType("sagejs")
package.__path__ = []
sys.modules["sagejs"] = package
spec = importlib.util.spec_from_file_location("sagejs.native", ${JSON.stringify(join(root, "src/lib/sagejs/native.py"))})
module = importlib.util.module_from_spec(spec)
sys.modules["sagejs.native"] = module
spec.loader.exec_module(module)
f = runpy.run_path(${JSON.stringify(sourcePath)})
seed = -(1 << 301) + 19
assert f["indices"](9, seed) == (seed, 1, seed + 1)
assert f["vector_indices"](9, seed) == (seed, 1, seed + 1)
assert f["local_index"](4, 3) == 71
assert f["parameter_index"](3) == 91
assert f["big_intermediate"]() == 73
for which in range(3):
    try:
        f["fmpz_invalid"](which)
    except IndexError:
        pass
    else:
        raise AssertionError(which)
for name in ["invalid_negative", "invalid_oversized", "invalid_word_max"]:
    try:
        f[name]()
    except IndexError:
        pass
    else:
        raise AssertionError(name)
try:
    f["invalid_zero_divisor"]()
except ZeroDivisionError:
    pass
else:
    raise AssertionError("zero divisor")
print(json.dumps([str(x) for x in f["constants"]()]))
`]));
    const compiled = await compileKernel({ sourcePath, cacheRoot: join(directory, "cache") });
    const module = require(compiled.modulePath);
    for (const implementation of [module.constants, module.constants.javascript, module.constants.gmp]) {
      assert.deepEqual(Array.from(implementation(), String), expected);
    }
    for (const backend of ["javascript", "gmp", "fmpz"]) {
      const implementation = module.vector_indices[backend];
      assert.equal(typeof implementation, "function", backend);
      const seed = -(1n << 301n) + 19n;
      assert.deepEqual(Array.from(implementation(9n, seed)), [seed, 1n, seed + 1n], backend);
      assert.throws(() => implementation(8n, seed), /index out of range/, backend);
      const invalid = module.fmpz_invalid[backend];
      assert.equal(typeof invalid, "function", backend);
      for (const which of [0n, 1n, 2n]) {
        assert.throws(() => invalid(which), /index out of range/, backend);
      }
      assert.throws(() => invalid(3n), /zero/, backend);
      assert.equal(module.big_intermediate[backend](), 73n, backend);
    }
    for (const backend of [null, "javascript", "gmp", "fmpz"]) {
      const get = (name) => backend === null ? module[name] : module[name][backend];
      if (!get("indices")) continue;
      const seed = -(1n << 301n) + 19n;
      assert.deepEqual(Array.from(get("indices")(9n, seed)), [seed, 1n, seed + 1n], backend);
      assert.equal(get("local_index")(4n, 3n), 71n, backend);
      assert.equal(get("parameter_index")(3n), 91n, backend);
      assert.throws(() => get("indices")(8n, seed), /index out of range/, backend);
      assert.throws(() => get("local_index")(4n, 4n), /index out of range/, backend);
      assert.throws(() => get("parameter_index")(-1n), /index out of range/, backend);
      for (const name of ["invalid_negative", "invalid_oversized", "invalid_word_max"]) {
        assert.throws(() => get(name)(), /index out of range/, `${backend}: ${name}`);
      }
      assert.throws(() => get("invalid_zero_divisor")(), /zero/, backend);
    }
  } finally {
    removeLoadedNativeCache(directory);
  }
});
