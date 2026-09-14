// sagejs-test-tier: specialized
// sagejs-test-portable: true
"use strict";

const assert = require("node:assert/strict");
const {
  existsSync,
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
const {
  inspectToolchain,
  wasmKernelToolchain,
} = require("../../../packages/wasm-toolchain/scripts/toolchain.cjs");

const root = resolve(__dirname, "../../..");
const sagejs = join(root, "bin", "sagejs");
const witnessPath = join(__dirname, "mixed_exact_float64_witness.py");
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
    env: {
      ...process.env,
      SAGEJS_HYPERELLIPTIC_AUTO_RECEIPT_POLICY: "off",
      ...options.env,
    },
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

test("exact IR explicitly isolates an approximate Float64 sidecar", async () => {
  const ir = await lowerSource(witnessSource, witnessPath);
  const exact = ir.functions.find((fn) =>
    fn.name === "exact_with_float64_sidecar"
  );
  const helper = ir.functions.find((fn) => fn.name === "approximate_score");
  assert.equal(exact.kernelKind, "integer");
  assert.equal(helper.kernelKind, "float64");
  assert.equal(helper.analysis.effects.pure, true);
  assert.deepEqual(exact.dependencies, ["approximate_score"]);
  assert.deepEqual(exact.analysis.effects.externalWrites, ["sidecar"]);
  assert.equal(exact.analysis.effects.pure, false);
  assert.deepEqual(exact.analysis.backend, {
    kind: "gmp",
    reason: "mixed exact and Float64 scheduling requires the exact core",
  });

  const lowered = operations(exact.body);
  assert.ok(lowered.some((operation) =>
    operation.kind === "float64.from_integer_checked"
  ));
  assert.ok(lowered.some((operation) =>
    operation.kind === "float64.buffer.get"
  ));
  assert.equal(
    lowered.filter((operation) => operation.kind === "float64.buffer.set").length,
    2,
  );
  assert.ok(lowered.some((operation) =>
    operation.kind === "native.call" &&
      operation.function === "approximate_score" &&
      operation.returnType === "Float64"
  ));
  assert.ok(lowered.some((operation) =>
    operation.kind === "float64.binary" && operation.operation === "div"
  ));
  assert.ok(lowered.some((operation) =>
    operation.kind === "float64.compare" && operation.operation === "gt"
  ));
  assert.ok(lowered.every((operation) =>
    !(operation.kind === "integer.from_uint64" &&
      operation.source === "approximate")
  ));

  const core = generateHostCore(ir, { moduleIdentity: "1234567890abcdef" });
  assert.equal(core.audit.isolated, true);
  assert.equal(core.audit.hostCallbacks, 0);
  assert.match(core.source, /mpz_cmpabs_d\([^,]+, 9007199254740992\.0\)/);
  assert.match(core.source, /sagejs_kernel_approximate_score/);
  assert.doesNotMatch(core.source, /\b(?:napi_|PyObject|Py_|JSValue|v8::)/);

  assert.deepEqual(classifyWasmFunction(exact, ir), {
    supported: true,
    results: ["Integer"],
  });
  const wasm = generateWasmBridge({
    ir,
    moduleIdentity: "1234567890abcdef",
    functionNames: ["exact_with_float64_sidecar"],
  });
  assert.deepEqual(wasm.functions[0].parameters, [
    { name: "coordinate", type: "Integer" },
    { name: "sidecar", type: "Float64Buffer", mutable: true },
  ]);
  assert.deepEqual(wasm.functions[0].results, ["Integer"]);
  assert.match(wasm.source, /sagejs_float64_buffer sagejs_value_sidecar/);

  await assert.rejects(
    lowerSource(`
from sagejs.native import native

def score(value: float) -> float:
    return value

@native
def implicit_exact_conversion(value: Integer) -> Integer:
    if score(value) > 0.0:
        return value + 1
    return value
`, "implicit_exact_conversion.py"),
    /score argument 1 expects Float64, got Integer/,
  );

  // Borrowed Float64Buffer helpers became supported in IR 42. Their writes
  // remain explicit effects; this must no longer assert the old rejection.
  await assert.doesNotReject(lowerSource(`
from sagejs.native import Float64Buffer, native

def mutating_score(sidecar: Float64Buffer) -> float:
    sidecar[0] = 1.0
    return sidecar[0]

@native
def borrowed_float_helper(value: Integer, sidecar: Float64Buffer) -> Integer:
    if mutating_score(sidecar) > 0.0:
        return value + 1
    return value
`, "borrowed_float_helper.py"));
});

test("mixed exact and Float64 execution agrees across dynamic and native", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-mixed-float64-"));
  const cacheRoot = join(temporary, "cache");
  const executableSource = join(temporary, "mixed_exact_float64_witness.py");
  const checks = String.raw`
import sagejs.runtime as runtime
from sagejs.native import is_compiled, kernel_float64_buffer

compiled = is_compiled(exact_with_float64_sidecar)
selected_backend = exact_with_float64_sidecar.backendFor(
    7,
    [3.0, 0.0, 0.0],
) if compiled else "source"
def checked(coordinate, previous, expected, expected_score):
    sidecar = kernel_float64_buffer(
        exact_with_float64_sidecar,
        [previous, 0.0, 0.0],
    ) if compiled else [previous, 0.0, 0.0]
    result = exact_with_float64_sidecar(coordinate, sidecar)
    assert result == expected
    assert abs(sidecar[1] - expected_score) < 1e-12
    assert abs(sidecar[2] - expected_score / 2.0) < 1e-12


checked(7, 3.0, 8, 21.0)
checked(-4, -4.0, -5, -4.0)
checked(1 << 53, float(1 << 53), (1 << 53) + 1, 1 << 53)
for rejected in ((1 << 53) + 1, -((1 << 53) + 1)):
    rejected_sidecar = kernel_float64_buffer(
        exact_with_float64_sidecar,
        [0.0, 0.0, 0.0],
    ) if compiled else [0.0, 0.0, 0.0]
    try:
        exact_with_float64_sidecar(rejected, rejected_sidecar)
        raise AssertionError("inexact exact-to-binary64 conversion succeeded")
    except OverflowError:
        pass
print("compiled=" + str(compiled))
print("backend=" + selected_backend)
print("MIXED_EXACT_FLOAT64_OK")
`;
  try {
    writeFileSync(executableSource, `${witnessSource}\n${checks}`);
    const compiled = await compileKernel({
      sourcePath: executableSource,
      cacheRoot,
    });
    assert.ok(compiled.addonPath);
    const compiledModule = require(compiled.modulePath);
    const compiledFunction = compiledModule.exact_with_float64_sidecar;
    for (const execute of [compiledModule.truncate_float, compiledModule.truncate_float.javascript]) {
      for (const value of [0, -0, 1.75, -1.75, Number.MIN_VALUE, 2 ** 100, -(2 ** 100), Number.MAX_VALUE]) {
        assert.equal(execute([value]), BigInt(Math.trunc(value)));
      }
      assert.throws(() => execute([NaN]), /cannot convert float NaN to integer/);
      assert.throws(() => execute([Infinity]), /cannot convert float infinity to integer/);
      assert.throws(() => execute([-Infinity]), /cannot convert float infinity to integer/);
    }
    for (const mode of ["native", "javascript"]) {
      const fn = name => mode === "native" ? compiledModule[name] : compiledModule[name].javascript;
      for (const name of ["assignment_order", "augmented_order"]) {
        const value = [3.0];
        assert.equal(fn(name)(value), 3n);
        assert.deepEqual(value, [3.0]);
      }
      const value = [7.0];
      assert.equal(fn("indexed_float")(value, 0n), 3n);
      assert.deepEqual(value, [3.5]);
      for (const index of [-1n, 1n, 1n << 100n]) {
        assert.throws(() => fn("indexed_float")([7.0], index));
      }
    }
    assert.equal(
      compiledFunction.backendFor(7n, new Float64Array([3.0, 0.0, 0.0])),
      "gmp",
    );
    assert.throws(
      () => compiledFunction.tagged(
        7n,
        new Float64Array([3.0, 0.0, 0.0]),
      ),
      /tagged native backend is not available/,
    );
    const native = run(process.execPath, [sagejs, executableSource], {
      env: {
        SAGEJS_NATIVE_CACHE_DIR: cacheRoot,
        SAGEJS_NATIVE_REQUIRED: "1",
      },
    });
    assert.match(native, /compiled=True/);
    assert.match(native, /backend=gmp/);
    assert.match(native, /MIXED_EXACT_FLOAT64_OK/);

    const dynamic = run(process.execPath, [sagejs, executableSource], {
      env: {
        SAGEJS_NATIVE_CACHE_DIR: cacheRoot,
        SAGEJS_NATIVE_DISABLE: "1",
      },
    });
    assert.match(dynamic, /backend=bigint/);
    assert.match(dynamic, /MIXED_EXACT_FLOAT64_OK/);

    const python = process.env.PYTHON ||
      (process.platform === "win32" ? "python" : "python3");
    const cpythonProgram = [
      "import sys",
      `sys.path.insert(0, ${JSON.stringify(join(root, "src", "lib"))})`,
      `sys.path.insert(0, ${JSON.stringify(__dirname)})`,
      "from mixed_exact_float64_witness import exact_with_float64_sidecar",
      "sidecar = [3.0, 0.0, 0.0]",
      "assert exact_with_float64_sidecar(7, sidecar) == 8",
      "assert sidecar == [3.0, 21.0, 10.5]",
      "for value in ((1 << 53) + 1, -((1 << 53) + 1)):",
      "    try:",
      "        exact_with_float64_sidecar(value, [0.0, 0.0, 0.0])",
      "        raise AssertionError('conversion unexpectedly succeeded')",
      "    except OverflowError:",
      "        pass",
      "print('cpython-ok')",
      "",
    ].join("\n");
    assert.equal(run(python, ["-I", "-c", cpythonProgram]), "cpython-ok");
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

const wasmToolchainStatus = inspectToolchain({ root });
const wasmToolchain = wasmToolchainStatus.ready
  ? wasmKernelToolchain({ root })
  : null;

test("mixed exact Float64 sidecars execute in standalone Wasm", {
  skip: wasmToolchain === null
    ? "a WASI clang/sysroot/GMP toolchain is not available"
    : false,
  timeout: 120_000,
}, async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-mixed-float64-wasm-"));
  try {
    const ir = await lowerSource(witnessSource, witnessPath);
    const moduleIdentity = "2468ace013579bdf";
    const core = generateHostCore(ir, { moduleIdentity });
    const bridge = generateWasmBridge({
      ir,
      moduleIdentity,
      functionNames: ["exact_with_float64_sidecar"],
    });
    const corePath = join(temporary, "kernel_core.c");
    const headerPath = join(temporary, "kernel_core.h");
    const bridgePath = join(temporary, "wasm_bridge.c");
    const wasmPath = join(temporary, "mixed_exact_float64.wasm");
    writeFileSync(corePath, core.source);
    writeFileSync(headerPath, core.header);
    writeFileSync(bridgePath, bridge.source);
    const gmpPrefix = wasmToolchain.gmpPrefix;
    const compiled = spawnSync(wasmToolchain.clang, [
      "--target=wasm32-wasip1",
      `--sysroot=${wasmToolchain.sysroot}`,
      "-mexec-model=reactor",
      "-O2",
      `-I${temporary}`,
      ...(existsSync(join(gmpPrefix, "include"))
        ? [`-I${join(gmpPrefix, "include")}`]
        : []),
      corePath,
      bridgePath,
      ...(existsSync(join(gmpPrefix, "lib", "libgmp.a"))
        ? [`-L${join(gmpPrefix, "lib")}`, "-lgmp"]
        : []),
      "-lwasi-emulated-signal",
      "-lm",
      ...bridge.exports.map((name) => `-Wl,--export=${name}`),
      "-Wl,--export-memory",
      "-Wl,--gc-sections",
      "-o",
      wasmPath,
    ], { cwd: root, encoding: "utf8" });
    assert.equal(compiled.status, 0, compiled.stdout + compiled.stderr);

    const { WASI } = require("node:wasi");
    const wasi = new WASI({ version: "preview1", returnOnExit: true });
    const instance = await WebAssembly.instantiate(
      await WebAssembly.compile(readFileSync(wasmPath)),
      { wasi_snapshot_preview1: wasi.wasiImport },
    );
    wasi.initialize(instance);
    const exports = instance.exports;
    const allocate = exports[bridge.runtime.allocate];
    const deallocate = exports[bridge.runtime.deallocate];
    const decimal = new TextEncoder().encode("7\0");
    const decimalAddress = Number(allocate(decimal.length));
    const sidecarAddress = Number(allocate(24));
    new Uint8Array(exports.memory.buffer, decimalAddress, decimal.length)
      .set(decimal);
    new Float64Array(exports.memory.buffer, sidecarAddress, 3)
      .set([3.0, 0.0, 0.0]);

    const status = exports[bridge.functions[0].export](
      decimalAddress,
      sidecarAddress,
      3,
    );
    assert.equal(status, 0);
    assert.equal(exports[bridge.runtime.resultSign](0), 1);
    assert.equal(exports[bridge.runtime.resultLength](0), 1);
    const limbsAddress = Number(exports[bridge.runtime.resultLimbs](0));
    assert.equal(
      new BigUint64Array(exports.memory.buffer, limbsAddress, 1)[0],
      8n,
    );
    assert.deepEqual(
      Array.from(new Float64Array(exports.memory.buffer, sidecarAddress, 3)),
      [3.0, 21.0, 10.5],
    );
    deallocate(sidecarAddress);
    deallocate(decimalAddress);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
