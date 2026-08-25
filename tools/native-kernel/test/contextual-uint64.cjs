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
const {
  classifyWasmFunction,
  generateWasmBridge,
} = require("../wasm-bridge.cjs");

const root = resolve(__dirname, "../../..");
const sagejs = join(root, "bin", "sagejs");
const witnessPath = join(__dirname, "fixed_span_uint64_witness.py");
const witnessSource = readFileSync(witnessPath, "utf8");

function operations(body) {
  const result = [];
  function visit(items) {
    for (const operation of items || []) {
      result.push(operation);
      visit(operation.body);
      visit(operation.alternative);
      visit(operation.condition?.operations);
      visit(operation.right?.operations);
    }
  }
  visit(body);
  return result;
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
  return result.stdout.trim();
}

test("uint64 literals are contextually typed through fixed-span helpers", async () => {
  const ir = await lowerSource(witnessSource, witnessPath);
  assert.deepEqual(ir.callGraph, {
    fixed_span_uint64_witness: [
      "publish_degree",
      "translate_index",
      "trim_span",
    ],
    publish_degree: [],
    promote_uint64_tuple: [],
    translate_index: [],
    trim_span: [],
  });
  for (const name of ["publish_degree", "translate_index", "trim_span"]) {
    const lowered = ir.functions.find((fn) => fn.name === name);
    assert.equal(lowered.kernelKind, "integer");
    const body = operations(lowered.body);
    assert.ok(body.some((operation) => operation.kind === "uint64.constant"));
    assert.ok(body.every((operation) => operation.kind !== "integer.constant"));
    assert.ok(body.every((operation) => operation.kind !== "integer.from_uint64"));
    assert.ok(body.every((operation) => operation.provenance?.file === witnessPath));
  }

  const trim = operations(
    ir.functions.find((fn) => fn.name === "trim_span").body,
  );
  assert.ok(trim.some((operation) =>
    operation.kind === "uint64.binary" && operation.operation === "sub"
  ));
  assert.ok(trim.some((operation) => operation.kind === "uint64.compare"));
  const publish = operations(
    ir.functions.find((fn) => fn.name === "publish_degree").body,
  );
  assert.ok(publish.some((operation) =>
    operation.kind === "uint64.buffer.set"
  ));
  const promotion = operations(
    ir.functions.find((fn) => fn.name === "promote_uint64_tuple").body,
  );
  assert.ok(promotion.some((operation) =>
    operation.kind === "integer.from_uint64"
  ));
  assert.ok(promotion.some((operation) =>
    operation.kind === "integer.constant"
  ));

  const core = generateHostCore(ir, { moduleIdentity: "0123456789abcdef" });
  assert.equal(core.audit.isolated, true);
  assert.equal(core.audit.hostCallbacks, 0);
  assert.match(
    core.header,
    /typedef sagejs_uint64_buffer sagejs_source_u64_buffer;/,
  );
  assert.match(core.source, /sagejs_kernel_trim_span/);
  assert.doesNotMatch(core.source, /\b(?:napi_|PyObject|Py_|JSValue|v8::)/);

  for (const fn of ir.functions) {
    assert.equal(classifyWasmFunction(fn).supported, true);
  }
  const wasm = generateWasmBridge({
    ir,
    moduleIdentity: "0123456789abcdef",
    functionNames: ["fixed_span_uint64_witness"],
  });
  assert.deepEqual(wasm.functions[0].parameters, [
    { name: "output", type: "UInt64Buffer" },
    { name: "modulus", type: "PrimeModulusValue" },
  ]);
  assert.deepEqual(wasm.functions[0].results, ["bool"]);
  assert.match(wasm.source, /sagejs_wasm_call_m_0123456789abcdef_fixed_span_uint64_witness/);
});

test("fixed-span witness agrees in dynamic, native, and CPython execution", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-contextual-u64-"));
  const cacheRoot = join(temporary, "cache");
  const executableSource = join(temporary, "fixed_span_witness.py");
  const checks = String.raw`
import sagejs.runtime as runtime
from sagejs.native import is_compiled

compiled = is_compiled(fixed_span_uint64_witness)


def checked(values, expected):
    output = runtime.uint64_buffer(values) if compiled else list(values)
    modulus = runtime.bigint(7) if compiled else 7
    accepted = fixed_span_uint64_witness(output, modulus)
    assert accepted == (any(values))
    assert [int(value) for value in output] == expected


checked([2, 3, 0, 0], [1, 3, 0, 0])
checked([5, 0], [0, 0])
checked([1], [0])
checked([0, 0, 0], [0, 0, 0])
print("compiled=" + str(compiled))
assert promote_uint64_tuple(7) == (True, 7)
print("CONTEXTUAL_UINT64_OK")
`;
  try {
    writeFileSync(executableSource, `${witnessSource}\n${checks}`);
    const compiled = await compileKernel({
      sourcePath: executableSource,
      cacheRoot,
    });
    assert.ok(compiled.addonPath);
    const native = run(process.execPath, [sagejs, executableSource], {
      env: {
        SAGEJS_NATIVE_CACHE_DIR: cacheRoot,
        SAGEJS_NATIVE_REQUIRED: "1",
      },
    });
    const dynamic = run(process.execPath, [sagejs, executableSource], {
      env: {
        SAGEJS_NATIVE_CACHE_DIR: cacheRoot,
        SAGEJS_NATIVE_DISABLE: "1",
      },
    });
    assert.match(native, /compiled=True/);
    assert.match(dynamic, /compiled=False/);
    assert.match(native, /CONTEXTUAL_UINT64_OK/);
    assert.match(dynamic, /CONTEXTUAL_UINT64_OK/);

    const python = process.env.PYTHON ||
      (process.platform === "win32" ? "python" : "python3");
    const cpythonProgram = [
      "import sys",
      `sys.path.insert(0, ${JSON.stringify(join(root, "src", "lib"))})`,
      `sys.path.insert(0, ${JSON.stringify(__dirname)})`,
      "from fixed_span_uint64_witness import fixed_span_uint64_witness as witness, promote_uint64_tuple",
      "for values, expected in [",
      "    ([2, 3, 0, 0], [1, 3, 0, 0]),",
      "    ([5, 0], [0, 0]),",
      "    ([1], [0]),",
      "    ([0, 0, 0], [0, 0, 0]),",
      "]:",
      "    output = list(values)",
      "    assert witness(output, 7) == any(values)",
      "    assert output == expected",
      "assert promote_uint64_tuple(7) == (True, 7)",
      "print('cpython-ok')",
      "",
    ].join("\n");
    assert.equal(
      run(python, ["-I", "-c", cpythonProgram]),
      "cpython-ok",
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
