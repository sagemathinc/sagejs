"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const { generateArtifacts } = require("../c-backend.cjs");
const { compileKernel } = require("../compiler.cjs");
const { lowerSource } = require("../ir.cjs");

const root = resolve(__dirname, "../../..");
const sagejs = join(root, "bin", "sagejs");
const witnessPath = join(__dirname, "prime_bool_helper_abi_witness.py");
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

test("prime-source bool results use one consistent C ABI", async () => {
  const ir = await lowerSource(witnessSource, witnessPath);
  const helper = ir.functions.find((fn) => fn.name === "normalize_and_test");
  const caller = ir.functions.find((fn) =>
    fn.name === "normalize_nonzero_batch"
  );
  assert.equal(helper.kernelKind, "prime-field-source");
  assert.equal(helper.returnType, "bool");
  assert.deepEqual(helper.analysis.effects.externalWrites, ["values"]);
  assert.equal(caller.kernelKind, "prime-field-source");
  assert.equal(caller.returnType, "bool");
  assert.deepEqual(caller.analysis.effects.externalWrites, ["output", "values"]);

  const artifacts = generateArtifacts(ir, {
    moduleIdentity: "0123456789abcdef",
  });
  assert.equal(artifacts.hostIsolation.isolated, true);
  assert.equal(artifacts.hostIsolation.hostCallbacks, 0);
  assert.match(
    artifacts.coreHeader,
    /sagejs_kernel_normalize_and_test\([^;]*int \*sagejs_native_output,/,
  );
  assert.match(
    artifacts.coreHeader,
    /sagejs_kernel_normalize_nonzero_batch\([^;]*int \*sagejs_native_output,/,
  );
  assert.doesNotMatch(
    artifacts.coreHeader,
    /sagejs_kernel_(?:normalize_and_test|normalize_nonzero_batch)\([^;]*uint64_t \*sagejs_native_output,/,
  );
  assert.match(
    artifacts.coreSource,
    /sagejs_kernel_normalize_and_test\(\s*status, &sagejs_sagejs_native_source_tmp_\d+, sagejs_values, sagejs_index, sagejs_modulus\)/,
  );
  assert.match(
    artifacts.adapterSource,
    /compiled_normalize_nonzero_batch\([\s\S]*?int output = 0;[\s\S]*?sagejs_kernel_normalize_nonzero_batch\(&status, &output,/,
  );
});

test("bool helper mutation agrees in dynamic, native, and CPython", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-prime-bool-helper-"));
  const executable = join(temporary, "prime_bool_helper_abi_witness.py");
  const cacheRoot = join(temporary, "cache");
  const checks = String.raw`
import sagejs.runtime as runtime
from sagejs.native import is_compiled

compiled = is_compiled(normalize_nonzero_batch)
output = runtime.uint64_buffer([0, 0, 0]) if compiled else [0, 0, 0]
values = runtime.uint64_buffer([102, 205, 307]) if compiled else [102, 205, 307]
modulus = runtime.bigint(101) if compiled else 101
assert normalize_nonzero_batch(output, values, 3, modulus)
assert [int(value) for value in output] == [1, 3, 4]
assert [int(value) for value in values] == [1, 3, 4]

rejected_output = runtime.uint64_buffer([9]) if compiled else [9]
rejected_values = runtime.uint64_buffer([202]) if compiled else [202]
assert not normalize_nonzero_batch(rejected_output, rejected_values, 1, modulus)
assert int(rejected_values[0]) == 0
assert int(rejected_output[0]) == 9
print("compiled=" + str(compiled))
print("PRIME_BOOL_HELPER_ABI_OK")
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
        SAGEJS_NATIVE_CACHE_DIR: cacheRoot,
        SAGEJS_NATIVE_DISABLE: "1",
      },
    });
    assert.match(native, /compiled=True/);
    assert.match(dynamic, /compiled=False/);
    assert.match(native, /PRIME_BOOL_HELPER_ABI_OK/);
    assert.match(dynamic, /PRIME_BOOL_HELPER_ABI_OK/);

    const python = process.env.PYTHON ||
      (process.platform === "win32" ? "python" : "python3");
    const cpython = [
      "import sys",
      `sys.path.insert(0, ${JSON.stringify(join(root, "src", "lib"))})`,
      `sys.path.insert(0, ${JSON.stringify(__dirname)})`,
      "from prime_bool_helper_abi_witness import normalize_nonzero_batch",
      "output = [0, 0, 0]",
      "values = [102, 205, 307]",
      "assert normalize_nonzero_batch(output, values, 3, 101)",
      "assert output == [1, 3, 4]",
      "assert values == [1, 3, 4]",
      "print('cpython-ok')",
      "",
    ].join("\n");
    assert.equal(run(python, ["-I", "-c", cpython]), "cpython-ok");
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
