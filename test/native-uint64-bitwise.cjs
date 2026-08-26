// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const test = require("node:test");
const { pythonExecutable } = require("../tools/python-executable.cjs");

const createCompiler = require("..");
const {
  generateC,
  generateHostCore,
} = require("../tools/native-kernel/c-backend.cjs");
const {
  compileKernel,
} = require("../tools/native-kernel/compiler.cjs");
const {
  explainKernel,
} = require("../tools/native-kernel/introspection.cjs");
const {
  lowerSource,
} = require("../tools/native-kernel/ir.cjs");
const {
  removeLoadedNativeCache,
} = require("./helpers/native-cache-cleanup.cjs");
const {
  createPythonCompilerFrontend,
} = require("../dist/tools/python/compiler-frontend.js");

const root = resolve(__dirname, "..");
const semantics = {
  representation: "unsigned-64-bit",
  arithmetic: "modulo-2^64",
  bitwise: "unsigned-64-bit",
  rightShift: "logical",
  shiftCounts: "0-through-63",
  invalidShift: "raises-OverflowError",
};

const source = `# sagejs: native-bitwise
from sagejs.native import (
    NativeRecord,
    PrimeFieldModulus,
    UInt64Buffer,
    native,
    uint64,
)


class WordSpan(NativeRecord):
    data: UInt64Buffer
    length: uint64
    modulus: PrimeFieldModulus


@native
def bitand_word(left: uint64, right: uint64) -> uint64:
    return left & right


@native
def bitor_word(left: uint64, right: uint64) -> uint64:
    return left | right


@native
def bitxor_word(left: uint64, right: uint64) -> uint64:
    return left ^ right


@native
def lshift_word(value: uint64, count: uint64) -> uint64:
    return value << count


@native
def rshift_word(value: uint64, count: uint64) -> uint64:
    return value >> count


@native
def augmented_word(
    value: uint64, mask: uint64, count: uint64
) -> uint64:
    word: uint64 = value
    word &= mask
    word |= value
    word ^= mask
    word <<= count
    word >>= count
    return word


@native
def shifted_float(value: uint64, count: uint64) -> float:
    word: uint64 = value
    word >>= count
    return float(word)


@native
def mutate_word(
    span: WordSpan, value: uint64, mask: uint64, count: uint64
) -> uint64:
    span.data[0] &= mask
    span.data[0] |= value
    span.data[0] ^= mask
    span.data[0] <<= count
    span.data[0] >>= count
    return span.data[0]


@native
def mask_word(span: WordSpan, mask: uint64) -> uint64:
    span.data[0] &= mask
    return span.data[0]
`;

function walkOperations(statements, output = []) {
  for (const operation of statements || []) {
    output.push(operation);
    walkOperations(operation.body, output);
    walkOperations(operation.alternative, output);
    walkOperations(operation.condition?.operations, output);
    walkOperations(operation.right?.operations, output);
  }
  return output;
}

function uint64Shift(value, count, left) {
  return left
    ? BigInt.asUintN(64, value << BigInt(count))
    : value >> BigInt(count);
}

function augmentedExpected(value, mask, count) {
  let word = value;
  word &= mask;
  word |= value;
  word ^= mask;
  word = uint64Shift(word, count, true);
  word = uint64Shift(word, count, false);
  return word;
}

function deterministicVectors() {
  const vectors = [
    [0n, (1n << 64n) - 1n, 0],
    [(1n << 64n) - 1n, 1n << 63n, 1],
    [(1n << 64n) - 1n, (1n << 64n) - 1n, 63],
    [1n << 63n, 1n, 63],
  ];
  let state = 0x6a09e667f3bcc909n;
  for (let index = 0; index < 160; index += 1) {
    state = BigInt.asUintN(64, state ^ (state << 13n));
    state = BigInt.asUintN(64, state ^ (state >> 7n));
    state = BigInt.asUintN(64, state ^ (state << 17n));
    const left = state;
    state = BigInt.asUintN(64, state * 6364136223846793005n + 1n);
    vectors.push([left, state, Number(state & 63n)]);
  }
  return vectors;
}

async function parseSage(text) {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "sage");
  try {
    return frontend.parse(text, { filename: "operators.py", jsage: true });
  } finally {
    frontend.close();
  }
}

function runDynamicSource(text) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-uint64-dynamic-"));
  try {
    const sourcePath = join(directory, "uint64_dynamic.py");
    writeFileSync(sourcePath, text);
    const result = spawnSync(
      process.execPath,
      [join(root, "bin", "sagejs"), sourcePath],
      {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          SAGEJS_NATIVE_MODE: "dynamic",
          SAGEJS_NATIVE_AUTOLOAD: "0",
        },
      },
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
    return result.stdout.trim().split("\n");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("native-bitwise marker preserves CPython xor without changing Sage power", async () => {
  const ordinary = await parseSage("value = 2 ^ 3\nvalue ^= 2\n");
  assert.equal(ordinary.body[0].body.right.operator, "**");
  assert.equal(ordinary.body[0].body.right.native_operator, false);
  assert.equal(ordinary.body[1].body.operator, "**=");
  assert.equal(ordinary.body[1].body.native_operator, false);

  const opted = await parseSage(
    "# sagejs: native-bitwise\nvalue = left ^ right\nleft ^= right\n",
  );
  assert.equal(opted.body[0].body.right.operator, "^");
  assert.equal(opted.body[0].body.right.native_operator, true);
  assert.equal(opted.body[0].body.right.inferred_type, "uint64");
  assert.equal(opted.body[1].body.operator, "^=");
  assert.equal(opted.body[1].body.native_operator, true);
  assert.equal(opted.body[1].body.inferred_type, "uint64");

  const documented = await parseSage(
    '"""This docstring documents the following literal marker.\n' +
      "# sagejs: native-bitwise\n" +
      'It must not opt this module into bounded shifts.\n"""\n' +
      "value = 1 << 64\n",
  );
  const documentedAssignment = documented.body.at(-1);
  assert.equal(documentedAssignment.body.right.operator, "<<");
  assert.equal(documentedAssignment.body.right.native_operator, false);
});

test("native-bitwise dynamic source uses checked full uint64 semantics", () => {
  const program = `# sagejs: native-bitwise
from sagejs.native import UInt64Buffer, native, uint64


@native
def bitand_word(left: uint64, right: uint64) -> uint64:
    return left & right


@native
def bitor_word(left: uint64, right: uint64) -> uint64:
    return left | right


@native
def bitxor_word(left: uint64, right: uint64) -> uint64:
    return left ^ right


@native
def lshift_word(value: uint64, count: uint64) -> uint64:
    return value << count


@native
def rshift_word(value: uint64, count: uint64) -> uint64:
    return value >> count


@native
def augmented_word(
    value: uint64, mask: uint64, count: uint64
) -> uint64:
    word: uint64 = value
    word &= mask
    word |= value
    word ^= mask
    word <<= count
    word >>= count
    return word


@native
def mutate_buffer(
    data: UInt64Buffer, value: uint64, mask: uint64, count: uint64
) -> uint64:
    data[0] &= mask
    data[0] |= value
    data[0] ^= mask
    data[0] <<= count
    data[0] >>= count
    return data[0]


import sagejs.runtime as runtime
from sagejs.native import is_compiled

print(is_compiled(bitxor_word))
print(bitxor_word(7, runtime.bigint("1099511627776")))
print(bitor_word(runtime.bigint("1099511627776"), 3))
print(bitand_word(runtime.bigint("18446744073709551615"), 2**63))
print(lshift_word(1, 40))
print(lshift_word(2**63, 1))
print(rshift_word(runtime.bigint("18446744073709551615"), 63))
print(augmented_word(2**40 + 7, runtime.bigint("1099511627779"), 5))
words = [2**40 + 7]
print(mutate_buffer(words, 2**40 + 7, runtime.bigint("1099511627779"), 5))
print(words[0])
for operation in (lshift_word, rshift_word):
    try:
        operation(1, 64)
    except OverflowError as error:
        print(str(error))
try:
    lshift_word(1, -1)
except OverflowError as error:
    print(str(error))
try:
    bitand_word(2**64, 1)
except OverflowError as error:
    print(str(error))
`;
  assert.deepEqual(runDynamicSource(program), [
    "False",
    "1099511627783",
    "1099511627779",
    "9223372036854775808",
    "1099511627776",
    "0",
    "1",
    String(augmentedExpected((1n << 40n) + 7n, (1n << 40n) + 3n, 5)),
    String(augmentedExpected((1n << 40n) + 7n, (1n << 40n) + 3n, 5)),
    String(augmentedExpected((1n << 40n) + 7n, (1n << 40n) + 3n, 5)),
    "uint64 shift count must be between 0 and 63",
    "uint64 shift count must be between 0 and 63",
    "uint64 operand is outside uint64",
    "uint64 operand is outside uint64",
  ]);
});

test("uint64 bitwise IR is canonical, typed, and inspectable", async () => {
  const ir = await lowerSource(source, "uint64-bitwise.py");
  assert.equal(ir.version, 23);
  const operations = ir.functions.flatMap((fn) => walkOperations(fn.body));
  assert.deepEqual(
    new Set(operations
      .filter((operation) =>
        operation.kind === "uint64.binary" ||
        operation.kind === "source.uint64.binary"
      )
      .map((operation) => operation.operation)),
    new Set(["bitand", "bitor", "bitxor", "lshift", "rshift"]),
  );
  for (const fn of ir.functions) {
    assert.deepEqual(fn.analysis.uint64, semantics, fn.name);
  }

  const core = generateHostCore(ir).source;
  const adapter = generateC(ir);
  assert.match(core, /uint64 shift count must be between 0 and 63/);
  assert.match(core, /\s&\s/);
  assert.match(core, /\s\|\s/);
  assert.match(core, /\s\^\s/);
  assert.match(core, /\s<<\s/);
  assert.match(core, /\s>>\s/);
  assert.match(adapter, /#ifdef _WIN32/);
  assert.match(adapter, /napi_create_double\(env, 0\.0, &delay_load_warmup\)/);

  await assert.rejects(
    lowerSource(
      "# sagejs: native-bitwise\n" +
        "from sagejs.native import native\n" +
        "@native\n" +
        "def rejected(left: Integer, right: Integer) -> Integer:\n" +
        "    return left & right\n",
      "integer-bitwise.py",
    ),
    /uint64 operator & requires uint64 operands/,
  );
});

test("uint64 native, JavaScript, and CPython paths agree", async () => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-uint64-bitwise-"));
  try {
    const sourcePath = join(directory, "uint64_bitwise.py");
    writeFileSync(sourcePath, source);
    const compiled = await compileKernel({
      sourcePath,
      cacheRoot: join(directory, "cache"),
    });
    const kernel = require(compiled.modulePath);
    const backends = [
      (fn, args) => fn(...args),
      (fn, args) => fn.javascript(...args),
      (fn, args) => fn.tagged(...args),
      (fn, args) => fn.gmp(...args),
    ];

    for (const [left, right, count] of deterministicVectors()) {
      const checks = [
        [kernel.bitand_word, [left, right], left & right],
        [kernel.bitor_word, [left, right], left | right],
        [kernel.bitxor_word, [left, right], left ^ right],
        [kernel.lshift_word, [left, count], uint64Shift(left, count, true)],
        [kernel.rshift_word, [left, count], uint64Shift(left, count, false)],
        [
          kernel.augmented_word,
          [left, right, count],
          augmentedExpected(left, right, count),
        ],
      ];
      for (const [fn, args, expected] of checks) {
        for (const invoke of backends) assert.equal(invoke(fn, args), expected);
      }
    }

    assert.equal(
      kernel.bitxor_word(7, 1n << 40n),
      (1n << 40n) ^ 7n,
    );
    assert.equal(
      kernel.bitxor_word.javascript(7, 1n << 40n),
      (1n << 40n) ^ 7n,
    );
    for (const invalid of [-1, 1.5, 1n << 64n]) {
      assert.throws(
        () => kernel.bitand_word.javascript(invalid, 1),
        /exact integer|outside uint64/,
      );
    }

    for (const fn of [kernel.lshift_word, kernel.rshift_word]) {
      for (const count of [64, 65n, (1n << 64n) - 1n]) {
        assert.throws(
          () => fn(1n, count),
          /uint64 shift count must be between 0 and 63/,
        );
        assert.throws(
          () => fn.javascript(1n, count),
          /uint64 shift count must be between 0 and 63/,
        );
      }
      assert.throws(() => fn(1n, -1), /outside uint64/);
    }

    assert.equal(kernel.shifted_float(1024n, 5), 32);
    assert.equal(kernel.shifted_float.javascript(1024n, 5), 32);
    assert.throws(
      () => kernel.shifted_float(1n, 64),
      /uint64 shift count must be between 0 and 63/,
    );
    assert.throws(
      () => kernel.shifted_float.javascript(1n, 64),
      /uint64 shift count must be between 0 and 63/,
    );
    assert.throws(
      () => kernel.shifted_float.javascript(1n, -1),
      /outside uint64/,
    );

    const words = new BigUint64Array([3n]);
    const span = { data: words, length: 1n, modulus: 97n };
    let expected = 3n;
    expected &= 6n;
    expected |= 5n;
    expected ^= 6n;
    expected = uint64Shift(expected, 4, true);
    expected = uint64Shift(expected, 4, false);
    assert.equal(kernel.mutate_word(span, 5n, 6n, 4n), expected);
    assert.equal(words[0], expected);
    assert.throws(
      () => kernel.mutate_word(span, 5n, 6n, 64n),
      /uint64 shift count must be between 0 and 63/,
    );

    for (const value of [1n << 63n, (1n << 64n) - 1n]) {
      const retained = new BigUint64Array([value]);
      const retainedSpan = { data: retained, length: 1n, modulus: 97n };
      assert.equal(kernel.mask_word(retainedSpan, (1n << 64n) - 1n), value);
      assert.equal(retained[0], value);
    }

    const explanation = await explainKernel({ sourcePath });
    assert.equal(explanation.eligible, true);
    assert.equal(explanation.version, 23);
    for (const fn of explanation.functions) {
      assert.deepEqual(fn.analysis.uint64, semantics, fn.name);
    }
    assert.ok(
      explanation.functions.some((fn) =>
        fn.ir.kinds["uint64.binary"] > 0 ||
        fn.ir.kinds["source.uint64.binary"] > 0
      ),
    );

    const pythonProgram = `
import importlib.util
import json
import sys

sys.path.insert(0, sys.argv[1])
spec = importlib.util.spec_from_file_location("uint64_bitwise", sys.argv[2])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
vectors = [(0, 0, 0), (1, 3, 1), (2**32 - 1, 0xA5A5, 7)]
print(json.dumps([
    [
        str(module.bitand_word(a, b)),
        str(module.bitor_word(a, b)),
        str(module.bitxor_word(a, b)),
        str(module.lshift_word(a, count)),
        str(module.rshift_word(a, count)),
        str(module.augmented_word(a, b, count)),
    ]
    for a, b, count in vectors
]))
`;
    const python = spawnSync(
      pythonExecutable(),
      [
        "-I",
        "-c",
        pythonProgram,
        join(root, "src", "lib"),
        sourcePath,
      ],
      {
        cwd: root,
        encoding: "utf8",
      },
    );
    assert.equal(python.status, 0, python.stderr);
    const cpython = JSON.parse(python.stdout).map((row) => row.map(BigInt));
    const vectors = [
      [0n, 0n, 0],
      [1n, 3n, 1],
      [(1n << 32n) - 1n, 0xa5a5n, 7],
    ];
    const native = vectors.map(([a, b, count]) => [
      kernel.bitand_word(a, b),
      kernel.bitor_word(a, b),
      kernel.bitxor_word(a, b),
      kernel.lshift_word(a, count),
      kernel.rshift_word(a, count),
      kernel.augmented_word(a, b, count),
    ]);
    assert.deepEqual(native, cpython);
  } finally {
    removeLoadedNativeCache(directory);
  }
});
