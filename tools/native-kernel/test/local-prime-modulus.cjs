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
const witnessPath = join(__dirname, "local_prime_modulus_witness.py");
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

function operations(statements, result = []) {
  for (const statement of statements) {
    result.push(statement);
    for (const key of ["body", "thenBody", "elseBody"]) {
      if (Array.isArray(statement[key])) operations(statement[key], result);
    }
  }
  return result;
}

test("packed uint64 values become checked local prime moduli", async () => {
  const ir = await lowerSource(witnessSource, witnessPath);
  assert.deepEqual(ir.callGraph, {
    modular_polynomial_step: [],
    varying_local_modulus_batch: ["modular_polynomial_step"],
  });
  const batch = ir.functions.find((fn) =>
    fn.name === "varying_local_modulus_batch"
  );
  assert.ok(
    batch.locals.some((local) =>
      local.name === "modulus" && local.type === "PrimeModulusValue"
    ),
  );
  const conversion = operations(batch.body).find((operation) =>
    operation.kind === "source.modulus.from_uint64"
  );
  assert.equal(conversion.target, "modulus");

  const core = generateHostCore(ir, { moduleIdentity: "0123456789abcdef" });
  assert.equal(core.audit.isolated, true);
  assert.equal(core.audit.hostCallbacks, 0);
  assert.match(
    core.source,
    /local PrimeFieldModulus must be between 2 and 2\^32 - 1/,
  );
  assert.match(
    core.source,
    /nmod_init\(&sagejs_modulus_nmod, \(ulong\) sagejs_modulus\)/,
  );
  assert.match(core.source, /sagejs_kernel_modular_polynomial_step\(/);
  assert.doesNotMatch(core.source, /\b(?:PyObject|Py_|JSValue|v8::)/);
});

test("varying local moduli agree in CPython, dynamic, and native modes", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-local-modulus-"));
  const cacheRoot = join(temporary, "cache");
  const executable = join(temporary, "local_prime_modulus_witness.py");
  const checks = String.raw`
from sagejs.native import is_compiled, kernel_uint64_buffer, kernel_uint64_zeros

values_data = [2, 3, 4, 5, 6, 7]
moduli_data = [3, 5, 7, 11, 13, 17]
values = kernel_uint64_buffer(varying_local_modulus_batch, values_data)
moduli = kernel_uint64_buffer(varying_local_modulus_batch, moduli_data)
output = kernel_uint64_zeros(varying_local_modulus_batch, len(values_data))
assert varying_local_modulus_batch(output, values, moduli, len(values_data), 19)
actual = [int(value) for value in output]
expected = []
for index in range(len(values_data)):
    expected.append(
        (values_data[index] * values_data[index] + 3) % moduli_data[index]
    )
assert actual == expected
invalid = kernel_uint64_buffer(varying_local_modulus_batch, [1])
assert not varying_local_modulus_batch(output, values, invalid, 1, 19)
print("compiled=" + str(is_compiled(varying_local_modulus_batch)))
print("LOCAL_PRIME_MODULUS_OK:" + ",".join(str(value) for value in actual))
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
    const nativeResult = native.match(/LOCAL_PRIME_MODULUS_OK:[0-9,]+/)[0];
    assert.equal(
      nativeResult,
      dynamic.match(/LOCAL_PRIME_MODULUS_OK:[0-9,]+/)[0],
    );

    const python = process.env.PYTHON ||
      (process.platform === "win32" ? "python" : "python3");
    const cpython = [
      "import sys",
      `sys.path.insert(0, ${JSON.stringify(join(root, "src", "lib"))})`,
      `sys.path.insert(0, ${JSON.stringify(__dirname)})`,
      "from local_prime_modulus_witness import varying_local_modulus_batch",
      "values = [2, 3, 4, 5, 6, 7]",
      "moduli = [3, 5, 7, 11, 13, 17]",
      "output = [0] * len(values)",
      "assert varying_local_modulus_batch(output, values, moduli, len(values), 19)",
      "expected = []",
      "for index in range(len(values)):",
      "    expected.append((values[index] * values[index] + 3) % moduli[index])",
      "assert output == expected",
      "assert not varying_local_modulus_batch(output, values, [1], 1, 19)",
      "print('LOCAL_PRIME_MODULUS_OK:' + ','.join(str(value) for value in output))",
      "",
    ].join("\n");
    assert.equal(run(python, ["-I", "-c", cpython]), nativeResult);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
