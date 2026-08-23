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
const {
  classifyWasmFunction,
  generateWasmBridge,
} = require("../wasm-bridge.cjs");

const root = resolve(__dirname, "../../..");
const sagejs = join(root, "bin", "sagejs");
const witnessPath = join(__dirname, "identifier_hygiene_witness.py");
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

function emittedWrapper(source, name) {
  const marker = `static napi_value ${name}(`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `missing emitted wrapper ${name}`);
  const next = source.indexOf("\n}\n", start);
  assert.notEqual(next, -1, `unterminated emitted wrapper ${name}`);
  return source.slice(start, next + 3);
}

test("generated wrapper identifiers are hygienic", async () => {
  const ir = await lowerSource(witnessSource, witnessPath);
  const artifacts = generateArtifacts(ir, {
    moduleIdentity: "2468ace013579bdf",
  });
  assert.equal(artifacts.hostIsolation.isolated, true);
  assert.equal(artifacts.hostIsolation.hostCallbacks, 0);

  for (const name of ["compiled_record_status", "compiled_record_status_gmp"]) {
    const wrapper = emittedWrapper(artifacts.adapterSource, name);
    assert.match(wrapper, /uint64_t sagejs_wrapper_status;/);
    assert.match(
      wrapper,
      /sagejs_native_status sagejs_wrapper_status_1 = \{0, NULL\};/,
    );
    assert.match(wrapper, /uint64_t sagejs_wrapper_result;/);
    assert.match(wrapper, /int sagejs_wrapper_result_1;/);
  }

  const tuple = emittedWrapper(
    artifacts.adapterSource,
    "compiled_tuple_identifier_witness",
  );
  assert.match(tuple, /napi_value sagejs_wrapper_item_1 = NULL;/);
  assert.match(tuple, /sagejs_wrapper_result_0_1/);

  const exact = emittedWrapper(
    artifacts.adapterSource,
    "compiled_integer_identifier_witness_gmp",
  );
  assert.match(exact, /int sagejs_wrapper_value_initialized_1 = 0;/);
  assert.match(exact, /mpz_t sagejs_wrapper_result;/);
  assert.match(exact, /mpz_t sagejs_wrapper_result_1;/);

  const float64 = emittedWrapper(
    artifacts.adapterSource,
    "compiled_float_identifier_witness",
  );
  assert.match(float64, /double sagejs_float64_result;/);
  assert.match(float64, /double sagejs_float64_result_1 = 0\.0;/);

  for (const fn of ir.functions) {
    assert.equal(classifyWasmFunction(fn).supported, true, fn.name);
  }
  const wasm = generateWasmBridge({
    ir,
    moduleIdentity: "2468ace013579bdf",
    functionNames: [
      "identifier_hygiene_witness",
      "tuple_identifier_witness",
      "integer_identifier_witness",
      "float_identifier_witness",
    ],
  });
  assert.equal(wasm.functions.length, 4);
  assert.match(wasm.source, /sagejs_arg_status/);
  assert.match(wasm.source, /sagejs_arg_float64_result/);
  assert.doesNotMatch(wasm.source, /\b(?:napi_|PyObject|Py_|JSValue|v8::)/);
});

test("adversarial identifiers agree in dynamic, native, and CPython", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-identifier-hygiene-"));
  const cacheRoot = join(temporary, "cache");
  const executable = join(temporary, "identifier_hygiene_witness.py");
  const checks = String.raw`
import sagejs.runtime as runtime
from sagejs.native import is_compiled

compiled = is_compiled(identifier_hygiene_witness)
statuses = runtime.uint64_buffer([0, 0]) if compiled else [0, 0]
modulus = runtime.bigint(101) if compiled else 101
assert identifier_hygiene_witness(statuses, 7, 11, modulus)
assert [int(value) for value in statuses] == [7, 11]
assert tuple_identifier_witness(2, 3, 5) == (True, 10)
assert integer_identifier_witness(13, 17, 19) == 49
print("compiled=" + str(compiled))
print("IDENTIFIER_HYGIENE_OK")
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
    assert.match(native, /IDENTIFIER_HYGIENE_OK/);
    assert.match(dynamic, /IDENTIFIER_HYGIENE_OK/);

    const module = require(compiled.modulePath);
    for (const implementation of [
      module.float_identifier_witness,
      module.float_identifier_witness.javascript,
    ]) {
      assert.equal(implementation(1.25, 2.5), 3.75);
    }

    const python = process.env.PYTHON ||
      (process.platform === "win32" ? "python" : "python3");
    const cpython = [
      "import sys",
      `sys.path.insert(0, ${JSON.stringify(join(root, "src", "lib"))})`,
      `sys.path.insert(0, ${JSON.stringify(__dirname)})`,
      "from identifier_hygiene_witness import *",
      "statuses = [0, 0]",
      "assert identifier_hygiene_witness(statuses, 7, 11, 101)",
      "assert statuses == [7, 11]",
      "assert tuple_identifier_witness(2, 3, 5) == (True, 10)",
      "assert integer_identifier_witness(13, 17, 19) == 49",
      "assert float_identifier_witness(1.25, 2.5) == 3.75",
      "print('cpython-ok')",
      "",
    ].join("\n");
    assert.equal(run(python, ["-I", "-c", cpython]), "cpython-ok");
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
