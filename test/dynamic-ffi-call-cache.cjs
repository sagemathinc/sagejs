"use strict";

const assert = require("node:assert/strict");
const {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = resolve(__dirname, "..");
const declarationHash = "0".repeat(64);

function runProgram(source, environment = {}) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-dynamic-ffi-cache-"));
  try {
    const firstBackend = join(directory, "first.cjs");
    const secondBackend = join(directory, "second.cjs");
    const program = join(directory, "program.py");
    writeFileSync(firstBackend, [
      '"use strict";',
      "let gets = 0;",
      "let calls = 0;",
      'Object.defineProperty(module.exports, "direct", {',
      "  get() {",
      "    gets += 1;",
      "    return function(value) {",
      "      calls += 1;",
      "      if (value === 98n) return 98;",
      '      if (value === 99n) throw new Error("backend failure");',
      "      return value;",
      "    };",
      "  },",
      "});",
      "module.exports.stats = () => [gets, calls];",
      'module.exports.bufferLength = () => true;',
      'module.exports.replacementRequire = () => require("./second.cjs");',
      "",
    ].join("\n"));
    writeFileSync(secondBackend, [
      '"use strict";',
      "let gets = 0;",
      'Object.defineProperty(module.exports, "direct", {',
      "  get() {",
      "    gets += 1;",
      "    return (value) => value + 100n;",
      "  },",
      "});",
      "module.exports.stats = () => [gets];",
      "",
    ].join("\n"));
    writeFileSync(program, source({ firstBackend, declarationHash }));
    return spawnSync(
      process.execPath,
      [join(root, "bin", "sagejs"), "--python", program],
      {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, ...environment },
      },
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("dynamic FFI caches invariant resolution but checks every call", () => {
  const result = runProgram(({ firstBackend, declarationHash: hash }) => [
    "import sagejs.runtime as runtime",
    `backend_path = ${JSON.stringify(firstBackend)}`,
    `identity = ${JSON.stringify(`test@${hash}:direct`)}`,
    "def call(value):",
    "    return runtime.ffi_call(",
    "        identity, backend_path, 'direct', [value], ['uint64'],",
    "        'uint64', ['direct', [], None], 'ValueError', 'failed', [],",
    "    )",
    "print(call(2), call(3))",
    "backend = runtime.require_module(backend_path)",
    "stats = runtime.reflect.get(backend, 'stats')",
    "print(runtime.reflect.apply(stats, runtime.undefined, []))",
    "try:",
    "    call(-1)",
    "except TypeError as error:",
    "    print(str(error))",
    "try:",
    "    call(98)",
    "except TypeError as error:",
    "    print(str(error))",
    "try:",
    "    call(99)",
    "except ValueError as error:",
    "    print(str(error))",
    "original = runtime.reflect.get(",
    "    runtime.global_object, '__sagejs_runtime_require__'",
    ")",
    "replacement = runtime.reflect.get(backend, 'replacementRequire')",
    "runtime.reflect.set(",
    "    runtime.global_object, '__sagejs_runtime_require__', replacement",
    ")",
    "print(call(4))",
    "runtime.reflect.set(",
    "    runtime.global_object, '__sagejs_runtime_require__', original",
    ")",
    "",
  ].join("\n"));
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(
    result.stdout.trim(),
    "2 3\n[1, 2]\ninvalid dynamic FFI argument for uint64\n" +
      `FFI declaration test@${declarationHash}:direct returned invalid uint64\n` +
      "backend failure\n104",
  );
});

test("cached dynamic FFI plans retain packed constraints and ownership", () => {
  const result = runProgram(({ firstBackend, declarationHash: hash }) => [
    "import sagejs.runtime as runtime",
    "from sagejs.ffi.flint import (",
    "    fmpq_matrix, fmpq_matrix_entry_numerator, fmpq_matrix_set_entry,",
    "    nmod_mat_inv,",
    ")",
    `backend_path = ${JSON.stringify(firstBackend)}`,
    `identity = ${JSON.stringify(`test@${hash}:buffer_length`)}`,
    "def checked_buffer(values, length):",
    "    return runtime.ffi_call(",
    "        identity, backend_path, 'bufferLength', [values, length],",
    "        ['UInt64Buffer', 'uint64'], 'bool', ['direct', [], None],",
    "        None, None,",
    "        [['buffer_length', 'values', ['length'], ['values', 'length']]],",
    "    )",
    "values = runtime.uint64_buffer([1, 2])",
    "print(checked_buffer(values, 2), checked_buffer(values, 2))",
    "try:",
    "    checked_buffer(values, 3)",
    "except ValueError as error:",
    "    print(str(error))",
    "invertible = runtime.uint64_buffer([1, 2, 3, 4])",
    "inverse = runtime.uint64_buffer(4)",
    "print(nmod_mat_inv(inverse, invertible, 2, 5), list(inverse))",
    "unchanged = runtime.uint64_buffer([9, 9, 9, 9])",
    "singular = runtime.uint64_buffer([1, 2, 2, 4])",
    "try:",
    "    nmod_mat_inv(unchanged, singular, 2, 5)",
    "except ValueError as error:",
    "    print(str(error), list(unchanged))",
    "matrix = fmpq_matrix(1, 1)",
    "fmpq_matrix_set_entry(matrix, 0, 0, 17, 19)",
    "print(fmpq_matrix_entry_numerator(matrix, 0, 0))",
    "matrix.close()",
    "try:",
    "    fmpq_matrix_entry_numerator(matrix, 0, 0)",
    "except ValueError as error:",
    "    print(str(error))",
    "",
  ].join("\n"));
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(
    result.stdout.trim(),
    "True True\npacked buffer length does not match its declared dimensions\n" +
      "True [3, 1, 4, 2]\nmatrix is singular [9, 9, 9, 9]\n" +
      "17\nFFI resource is closed",
  );
});

test("the bootstrap exposes one inspectable dynamic call-plan cache", () => {
  const source = readFileSync(
    join(root, "src", "baselib", "sagejs_bootstrap.py"),
    "utf8",
  );
  assert.match(source, /__sagejs_ffi_call_plans__/);
  assert.match(source, /plan\.runtimeRequire !== runtime_require/);
  assert.match(source, /plan\.constraintPlans/);
  assert.match(source, /plan\.exceptionClass/);
});
