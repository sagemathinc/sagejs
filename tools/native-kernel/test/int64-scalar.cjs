"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const { generateHostCore } = require("../c-backend.cjs");
const { compileKernel } = require("../compiler.cjs");
const { analyzeExactModule } = require("../exact-analysis.cjs");
const { generateFmpzFunctions } = require("../fmpz-backend.cjs");
const { lowerSource } = require("../ir.cjs");
const { classifyWasmFunction } = require("../wasm-bridge.cjs");

const root = resolve(__dirname, "../../..");
const sagejs = join(root, "bin", "sagejs");
const witnessPath = join(__dirname, "int64_scalar_witness.py");
const witnessSource = readFileSync(witnessPath, "utf8");

function operations(body) {
  const result = [];
  function visit(items) {
    for (const operation of items || []) {
      result.push(operation);
      visit(operation.body);
      visit(operation.alternative);
      visit(operation.condition?.operations);
    }
  }
  visit(body);
  return result;
}

function emittedFunction(source, marker) {
  let start = source.indexOf(marker);
  while (start !== -1 &&
      source.slice(start, source.indexOf("\n", start)).endsWith(";")) {
    start = source.indexOf(marker, start + marker.length);
  }
  assert.notEqual(start, -1, `missing emitted function ${marker}`);
  const stop = source.indexOf("\n}\n", start);
  assert.notEqual(stop, -1, `unterminated emitted function ${marker}`);
  return source.slice(start, stop + 3);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    timeout: 120_000,
    ...options,
    env: { ...process.env, ...options.env },
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}

test("int64 lowers to checked signed-word IR and isolated C", async () => {
  const ir = await lowerSource(witnessSource, witnessPath);
  analyzeExactModule(ir.functions);
  const arithmetic = operations(ir.functions.find(
    (fn) => fn.name === "int64_arithmetic",
  ).body);
  const helper = operations(ir.functions.find(
    (fn) => fn.name === "int64_helper",
  ).body);
  assert.ok(helper.some((op) =>
    op.kind === "int64.binary" && op.operation === "mul"
  ));
  assert.ok(arithmetic.some((op) =>
    op.kind === "int64.binary" && op.operation === "floordiv"
  ));
  assert.ok(arithmetic.some((op) =>
    op.kind === "int64.binary" && op.operation === "mod"
  ));
  const conversion = operations(ir.functions.find(
    (fn) => fn.name === "exact_to_int64",
  ).body);
  assert.ok(conversion.some((op) => op.kind === "int64.from_integer_checked"));
  const exactConversion = ir.functions.find((fn) => fn.name === "int64_to_exact");
  assert.ok(operations(exactConversion.body).some((op) =>
    op.kind === "integer.from_int64"
  ));
  exactConversion.analysis.backend = { kind: "fmpz" };
  const fmpz = generateFmpzFunctions(ir.functions).functions;
  assert.match(fmpz, /fmpz_set_(?:si|signed_uiui)/);
  assert.doesNotMatch(fmpz, /\bmpz_init/);
  assert.ok(operations(ir.functions.find(
    (fn) => fn.name === "int64_range_sum",
  ).body).some((op) => op.kind === "loop.range_int64"));
  const buffer = operations(ir.functions.find(
    (fn) => fn.name === "int64_buffer_roundtrip",
  ).body);
  assert.ok(buffer.some((op) => op.kind === "int64.buffer.get" &&
    op.indexType === "int64"));
  assert.ok(buffer.some((op) => op.kind === "int64.buffer.set" &&
    op.indexType === "int64"));
  assert.equal(buffer.some((op) => op.kind === "integer.from_int64"), false);
  const exactBuffer = operations(ir.functions.find(
    (fn) => fn.name === "int64_buffer_exact",
  ).body);
  assert.ok(exactBuffer.some((op) => op.kind === "int64.buffer.get" &&
    op.valueType === "Integer"));
  const checkedLiteral = operations(ir.functions.find(
    (fn) => fn.name === "checked_int64_literal",
  ).body);
  assert.ok(checkedLiteral.some((op) => op.kind === "int64.constant"));
  assert.equal(checkedLiteral.some((op) => op.kind.startsWith("integer.")), false);
  const checkedLength = operations(ir.functions.find(
    (fn) => fn.name === "checked_int64_length",
  ).body);
  assert.ok(checkedLength.some((op) => op.kind === "int64.from_uint64_checked"));
  assert.equal(checkedLength.some((op) => op.kind === "integer.from_uint64"), false);
  const checkedUnsigned = operations(ir.functions.find(
    (fn) => fn.name === "checked_uint64_int64",
  ).body);
  assert.ok(checkedUnsigned.some((op) => op.kind === "uint64.from_int64_checked"));
  assert.equal(checkedUnsigned.some((op) => op.kind === "integer.from_int64"), false);

  const core = generateHostCore(ir, { moduleIdentity: "0123456789abcdef" });
  assert.equal(core.audit.isolated, true);
  assert.match(core.source, /sagejs_word_mul_int64/);
  assert.match(core.source, /== INT64_MIN && .* == -1/);
  assert.match(core.source, /sagejs_word_fdiv_int64/);
  const packedUpdate = emittedFunction(
    core.source,
    "static int native_int64_buffer_roundtrip(",
  );
  assert.match(packedUpdate, /sagejs_int64_buffer_index/);
  assert.match(packedUpdate, /sagejs_word_add_int64/);
  assert.doesNotMatch(packedUpdate, /\bmpz_/);
  assert.doesNotMatch(core.source, /\b(?:napi_|PyObject|Py_|JSValue|v8::)/);
  for (const fn of ir.functions) {
    assert.equal(classifyWasmFunction(fn, ir).supported, true, fn.name);
  }
});

test("int64 agrees in native, dynamic, and CPython execution", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-int64-scalar-"));
  const sourcePath = join(temporary, "int64_scalar.py");
  const cacheRoot = join(temporary, "cache");
  const checks = String.raw`
from sagejs.native import int64_buffer, is_compiled

assert int64_arithmetic(-7, 3) == (-5, -3, 2)
assert int64_arithmetic(7, -3) == (11, -3, -2)
assert int64_binary(-7, -3) == (-10, -4, 21)
assert int64_range_sum(-5, 6, 2) == 0
assert exact_to_int64(-(1 << 63)) == -(1 << 63)
assert exact_to_int64((1 << 63) - 1) == (1 << 63) - 1
values = int64_buffer([-7, 11, 23])
assert int64_buffer_roundtrip(values, -2, 5) == 16
assert values[-2] == 16
assert int64_buffer_exact(values, 0) == (1 << 80) - 7
assert checked_int64_literal() == -1
assert checked_int64_length(values) == 3
assert checked_uint64_int64(7) == 7
try:
    checked_uint64_int64(-1)
    raise AssertionError("negative uint64 conversion succeeded")
except OverflowError:
    pass
for rejected in (-(1 << 63) - 1, 1 << 63):
    try:
        exact_to_int64(rejected)
        raise AssertionError("out-of-range int64 conversion succeeded")
    except OverflowError:
        pass
if is_compiled(int64_helper):
    for call in (
        lambda: int64_helper(1 << 63, 1),
        lambda: int64_helper(-(1 << 63) - 1, 1),
        lambda: int64_binary((1 << 63) - 1, 1),
        lambda: int64_binary(-(1 << 63), 1),
        lambda: int64_binary((1 << 62), 2),
        lambda: int64_unary(-(1 << 63)),
        lambda: int64_arithmetic(-(1 << 63), -1),
    ):
        try:
            call()
            raise AssertionError("int64 overflow succeeded")
        except OverflowError:
            pass
print("compiled=" + str(is_compiled(int64_helper)))
print("INT64_SCALAR_OK")
`;
  writeFileSync(sourcePath, `${witnessSource}\n${checks}`);
  try {
    await compileKernel({ sourcePath, cacheRoot });
    const native = run(process.execPath, [sagejs, sourcePath], {
      env: { SAGEJS_NATIVE_CACHE_DIR: cacheRoot, SAGEJS_NATIVE_REQUIRED: "1" },
    });
    const javascript = run(process.execPath, [sagejs, sourcePath], {
      env: {
        SAGEJS_NATIVE_CACHE_DIR: cacheRoot,
        SAGEJS_NATIVE_MODE: "javascript",
      },
    });
    const dynamic = run(process.execPath, [sagejs, sourcePath], {
      env: {
        SAGEJS_NATIVE_CACHE_DIR: join(temporary, "dynamic-cache"),
        SAGEJS_NATIVE_DISABLE: "1",
      },
    });
    assert.match(native, /compiled=True/);
    assert.match(javascript, /compiled=True/);
    assert.match(dynamic, /compiled=False/);
    assert.match(native, /INT64_SCALAR_OK/);
    assert.match(javascript, /INT64_SCALAR_OK/);
    assert.match(dynamic, /INT64_SCALAR_OK/);

    const python = process.env.PYTHON ||
      (process.platform === "win32" ? "python" : "python3");
    const pythonPath = join(root, "src", "lib");
    const result = run(python, ["-I", "-c", [
      "import sys",
      `sys.path.insert(0, ${JSON.stringify(pythonPath)})`,
      `exec(open(${JSON.stringify(sourcePath)}).read())`,
    ].join("\n")]);
    assert.match(result, /INT64_SCALAR_OK/);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
