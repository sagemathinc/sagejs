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

const { generateHostCore } = require("../c-backend.cjs");
const { compileKernel } = require("../compiler.cjs");
const { lowerSource } = require("../ir.cjs");

const root = resolve(__dirname, "../../..");
const sagejs = join(root, "bin", "sagejs");
const witnessPath = join(__dirname, "exact_integer_buffer_witness.py");
const witnessSource = readFileSync(witnessPath, "utf8");

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
  return result.stdout.trim();
}

function emittedFunction(source, marker) {
  let start = source.indexOf(marker);
  while (
    start !== -1 &&
    source.slice(start, source.indexOf("\n", start)).endsWith(";")
  ) {
    start = source.indexOf(marker, start + marker.length);
  }
  assert.notEqual(start, -1, `missing emitted function ${marker}`);
  const next = source.indexOf("\n}\n", start);
  assert.notEqual(next, -1, `unterminated emitted function ${marker}`);
  return source.slice(start, next + 3);
}

test("looped exact helper graphs specialize packed integer loads to GMP", async () => {
  const ir = await lowerSource(witnessSource, witnessPath);
  assert.deepEqual(ir.callGraph, {
    exact_integer_buffer_batch: ["exact_buffer_helper_chain"],
    exact_integer_buffer_inline_batch: [],
    exact_buffer_helper_chain: ["exact_buffer_polynomial_step"],
    exact_buffer_polynomial_step: [],
  });
  const batch = ir.functions.find((fn) =>
    fn.name === "exact_integer_buffer_batch"
  );
  assert.equal(batch.analysis.execution.integerBufferLoads, 2);
  assert.equal(batch.analysis.execution.integerGrowthOperations, 3);
  assert.equal(batch.analysis.execution.nativeCalls, 1);
  assert.equal(batch.analysis.execution.dependencyDepth, 2);
  assert.deepEqual(batch.analysis.backend, {
    kind: "gmp",
    reason:
      "an amortizable exact loop consumes packed arbitrary-precision values",
  });
  const inlineBatch = ir.functions.find((fn) =>
    fn.name === "exact_integer_buffer_inline_batch"
  );
  assert.equal(inlineBatch.analysis.execution.integerBufferLoads, 2);
  assert.equal(inlineBatch.analysis.execution.nativeCalls, 0);
  assert.ok(inlineBatch.analysis.execution.integerGrowthOperations >= 20);
  assert.deepEqual(inlineBatch.analysis.backend, batch.analysis.backend);

  const core = generateHostCore(ir, { moduleIdentity: "fedcba9876543210" });
  assert.equal(core.audit.isolated, true);
  assert.equal(core.audit.hostCallbacks, 0);
  const publicBatch = emittedFunction(
    core.source,
    "int sagejs_kernel_exact_integer_buffer_batch(",
  );
  assert.match(publicBatch, /return native_exact_integer_buffer_batch\(/);
  assert.doesNotMatch(publicBatch, /tagged_exact_integer_buffer_batch/);
  const nativeBatch = emittedFunction(
    core.source,
    "static int native_exact_integer_buffer_batch(",
  );
  assert.match(nativeBatch, /sagejs_integer_buffer_get_mpz\(/);
  assert.match(nativeBatch, /native_exact_buffer_helper_chain\(/);
  assert.doesNotMatch(nativeBatch, /tagged_exact_buffer_helper_chain/);
  const publicInlineBatch = emittedFunction(
    core.source,
    "int sagejs_kernel_exact_integer_buffer_inline_batch(",
  );
  assert.match(publicInlineBatch, /return native_exact_integer_buffer_inline_batch\(/);
  assert.doesNotMatch(publicInlineBatch, /tagged_exact_integer_buffer_inline_batch/);
  const nativeInlineBatch = emittedFunction(
    core.source,
    "static int native_exact_integer_buffer_inline_batch(",
  );
  assert.match(nativeInlineBatch, /sagejs_integer_buffer_get_mpz\(/);
  const helper = emittedFunction(
    core.source,
    "static int native_exact_buffer_helper_chain(",
  );
  assert.match(helper, /native_exact_buffer_polynomial_step\(/);
  assert.doesNotMatch(helper, /tagged_exact_buffer_polynomial_step/);
  assert.doesNotMatch(core.source, /\b(?:napi_|PyObject|Py_|JSValue|v8::)/);
});

test("packed exact helper specialization agrees in every execution mode", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-exact-buffer-"));
  const cacheRoot = join(temporary, "cache");
  const executable = join(temporary, "exact_integer_buffer_witness.py");
  const checks = String.raw`
from sagejs.native import (
    integer_buffer_values,
    is_compiled,
    kernel_integer_buffer,
    kernel_integer_zeros,
)

compiled = is_compiled(exact_integer_buffer_batch)
rows_data = []
for index in range(16):
    rows_data.append((1 << 100) + 97 * index + 11)
    rows_data.append((1 << 71) + 18 * index + 3)
rows = kernel_integer_buffer(exact_integer_buffer_batch, rows_data)
output = kernel_integer_zeros(exact_integer_buffer_batch, 16, 4)
checksum = exact_integer_buffer_batch(output, rows, 16, 6)
values = [int(value) for value in integer_buffer_values(output)]
assert checksum == sum(values)
assert len(values) == 16
for index in range(16):
    modulus = (1 << 71) + 18 * index + 3
    assert 0 <= values[index] < modulus * modulus + 1
inline_output = kernel_integer_zeros(exact_integer_buffer_inline_batch, 16, 4)
inline_checksum = exact_integer_buffer_inline_batch(inline_output, rows, 16)
inline_values = [int(value) for value in integer_buffer_values(inline_output)]
four_round_output = kernel_integer_zeros(exact_integer_buffer_batch, 16, 4)
four_round_checksum = exact_integer_buffer_batch(four_round_output, rows, 16, 4)
assert inline_checksum == four_round_checksum
assert inline_values == [int(value) for value in integer_buffer_values(four_round_output)]
print("compiled=" + str(compiled))
print("EXACT_INTEGER_BUFFER_OK:" + str(checksum))
print("EXACT_INTEGER_BUFFER_INLINE_OK:" + str(inline_checksum))
`;
  try {
    writeFileSync(executable, `${witnessSource}\n${checks}`);
    const compiled = await compileKernel({ sourcePath: executable, cacheRoot });
    assert.ok(compiled.addonPath);
    const native = run(process.execPath, [sagejs, executable], {
      env: {
        SAGEJS_NATIVE_CACHE_DIR: cacheRoot,
        SAGEJS_NATIVE_REQUIRED: "1",
      },
    });
    const dynamic = run(process.execPath, [sagejs, executable], {
      env: {
        SAGEJS_NATIVE_CACHE_DIR: join(temporary, "dynamic-cache"),
        SAGEJS_NATIVE_DISABLE: "1",
      },
    });
    assert.match(native, /compiled=True/);
    assert.match(dynamic, /compiled=False/);
    assert.equal(
      native.match(/EXACT_INTEGER_BUFFER_OK:\d+/)[0],
      dynamic.match(/EXACT_INTEGER_BUFFER_OK:\d+/)[0],
    );
    assert.equal(
      native.match(/EXACT_INTEGER_BUFFER_INLINE_OK:\d+/)[0],
      dynamic.match(/EXACT_INTEGER_BUFFER_INLINE_OK:\d+/)[0],
    );

    const python = process.env.PYTHON ||
      (process.platform === "win32" ? "python" : "python3");
    const cpython = [
      "import sys",
      `sys.path.insert(0, ${JSON.stringify(join(root, "src", "lib"))})`,
      `sys.path.insert(0, ${JSON.stringify(__dirname)})`,
      "from exact_integer_buffer_witness import (",
      "    exact_integer_buffer_batch,",
      "    exact_integer_buffer_inline_batch,",
      ")",
      "rows = []",
      "for index in range(16):",
      "    rows.append((1 << 100) + 97 * index + 11)",
      "    rows.append((1 << 71) + 18 * index + 3)",
      "output = [0] * 16",
      "checksum = exact_integer_buffer_batch(output, rows, 16, 6)",
      "assert checksum == sum(output)",
      "inline_output = [0] * 16",
      "inline_checksum = exact_integer_buffer_inline_batch(inline_output, rows, 16)",
      "four_round_output = [0] * 16",
      "four_round_checksum = exact_integer_buffer_batch(four_round_output, rows, 16, 4)",
      "assert inline_checksum == four_round_checksum",
      "assert inline_output == four_round_output",
      "print('EXACT_INTEGER_BUFFER_OK:' + str(checksum))",
      "print('EXACT_INTEGER_BUFFER_INLINE_OK:' + str(inline_checksum))",
      "",
    ].join("\n");
    assert.equal(
      run(python, ["-I", "-c", cpython]),
      [
        native.match(/EXACT_INTEGER_BUFFER_OK:\d+/)[0],
        native.match(/EXACT_INTEGER_BUFFER_INLINE_OK:\d+/)[0],
      ].join("\n"),
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
