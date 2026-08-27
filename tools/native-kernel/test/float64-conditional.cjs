"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
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
const witnessPath = join(__dirname, "float64_branch_witness.py");
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

test("binary64 comparisons and conditionals preserve inspectable source", async () => {
  const ir = await lowerSource(witnessSource, witnessPath);
  const choose = ir.functions.find((fn) => fn.name === "choose_sqrt_sign");
  const score = ir.functions.find((fn) => fn.name === "comparison_score");
  const unsigned = ir.functions.find((fn) => fn.name === "uint64_branch");
  const batch = ir.functions.find((fn) => fn.name === "scaled_buffer_batch");
  assert.equal(choose.kernelKind, "float64");
  assert.equal(choose.analysis.effects.pure, false);
  assert.deepEqual(choose.analysis.effects.mutates, ["state"]);
  assert.ok(operations(choose.body).some((operation) =>
    operation.kind === "float64.compare" && operation.operation === "lt"
  ));
  assert.ok(operations(choose.body).some((operation) =>
    operation.kind === "float64.negate"
  ));
  assert.ok(operations(choose.body).some((operation) => operation.kind === "if"));

  const scoreOperations = operations(score.body);
  assert.deepEqual(
    [...new Set(scoreOperations
      .filter((operation) => operation.kind === "float64.compare")
      .map((operation) => operation.operation))].sort(),
    ["eq", "ge", "gt", "le", "lt", "ne"],
  );
  assert.ok(scoreOperations.every((operation) =>
    operation.provenance?.file === witnessPath
  ));
  assert.ok(operations(unsigned.body).some((operation) =>
    operation.kind === "uint64.compare" && operation.operation === "gt"
  ));

  const core = generateHostCore(ir, { moduleIdentity: "fedcba9876543210" });
  assert.equal(core.audit.isolated, true);
  assert.equal(core.audit.hostCallbacks, 0);
  assert.match(core.source, /sagejs_kernel_choose_sqrt_sign/);
  assert.match(core.source, /if \(sagejs_sagejs_native_float_tmp_/);
  assert.doesNotMatch(core.source, /\b(?:napi_|PyObject|Py_|JSValue|v8::)/);
  assert.deepEqual(classifyWasmFunction(choose), {
    supported: true,
    results: ["Float64"],
  });
  const wasm = generateWasmBridge({
    ir,
    moduleIdentity: "fedcba9876543210",
    functionNames: [
      "choose_sqrt_sign",
      "comparison_score",
      "scaled_buffer_batch",
    ],
  });
  assert.deepEqual(wasm.functions[0].parameters, [
    { name: "state", type: "Float64Buffer", mutable: true },
    { name: "count", type: "uint64" },
  ]);
  assert.deepEqual(wasm.functions[1].parameters, [
    { name: "left", type: "Float64" },
    { name: "right", type: "Float64" },
  ]);
  assert.deepEqual(wasm.functions[0].results, ["Float64"]);
  assert.deepEqual(wasm.functions[2].parameters, [
    { name: "source", type: "Float64Buffer", mutable: false },
    { name: "output", type: "Float64Buffer", mutable: true },
    { name: "scale", type: "Float64" },
    { name: "count", type: "uint64" },
  ]);
  assert.deepEqual(batch.analysis.effects.mutates, ["output"]);
  assert.equal(
    wasm.runtime.resultFloat64,
    "sagejs_wasm_result_f64_at_m_fedcba9876543210",
  );
  assert.match(wasm.source, /sagejs_float64_buffer sagejs_value_state/);
  assert.match(wasm.source, /double sagejs_arg_left/);
  assert.match(wasm.source, /sagejs_wasm_result_f64_storage/);
});

test("binary64 branches agree in JavaScript, native, and CPython execution", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-float64-branch-"));
  const cacheRoot = join(temporary, "cache");
  const executableSource = join(temporary, "float64_branch_witness.py");
  const checks = String.raw`
from sagejs.native import is_compiled, kernel_float64_buffer

compiled = is_compiled(choose_sqrt_sign)
state = kernel_float64_buffer(
    choose_sqrt_sign,
    [1.0, 0.0, -0.9, 0.1, -0.8, 0.2],
)
value = choose_sqrt_sign(state, 3)
assert abs(value - 0.8) < 1e-14
assert abs(state[2] - 0.9) < 1e-14
assert abs(state[4] - 0.8) < 1e-14
if not compiled:
    assert abs(comparison_score(1.0, 2.0) + 1.25) < 1e-14
    assert abs(comparison_score(2.0, 1.0) - 2.25) < 1e-14
    assert comparison_score(2.0, 2.0) == 0.0
assert uint64_branch(0) == 0.0
assert uint64_branch(3) == 1.0
print("compiled=" + str(compiled))
print("FLOAT64_BRANCH_OK")
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
    assert.match(native, /compiled=True/);
    assert.match(native, /FLOAT64_BRANCH_OK/);

    const compiledModule = require(compiled.modulePath);
    for (const implementation of [
      compiledModule.comparison_score,
      compiledModule.comparison_score.javascript,
    ]) {
      assert.equal(implementation(1, 2), -1.25);
      assert.equal(implementation(2, 1), 2.25);
      assert.equal(implementation(2, 2), 0);
    }
    for (const implementation of [
      compiledModule.scaled_buffer_batch,
      compiledModule.scaled_buffer_batch.javascript,
    ]) {
      const source = new Float64Array([1.5, -2.0, 4.0]);
      const output = new Float64Array(3);
      assert.equal(implementation(source, output, 2, 3), 7);
      assert.deepEqual(Array.from(output), [3, -4, 8]);
    }

    const python = process.env.PYTHON ||
      (process.platform === "win32" ? "python" : "python3");
    const cpythonProgram = [
      "import sys",
      `sys.path.insert(0, ${JSON.stringify(join(root, "src", "lib"))})`,
      `sys.path.insert(0, ${JSON.stringify(__dirname)})`,
      "from float64_branch_witness import choose_sqrt_sign, comparison_score, scaled_buffer_batch, uint64_branch",
      "state = [1.0, 0.0, -0.9, 0.1, -0.8, 0.2]",
      "assert abs(choose_sqrt_sign(state, 3) - 0.8) < 1e-14",
      "assert state[2:] == [0.9, -0.1, 0.8, -0.2]",
      "assert comparison_score(1.0, 2.0) == -1.25",
      "assert comparison_score(2.0, 1.0) == 2.25",
      "assert comparison_score(2.0, 2.0) == 0.0",
      "assert uint64_branch(0) == 0.0 and uint64_branch(3) == 1.0",
      "source, output = [1.5, -2.0, 4.0], [0.0, 0.0, 0.0]",
      "assert scaled_buffer_batch(source, output, 2.0, 3) == 7.0",
      "assert output == [3.0, -4.0, 8.0]",
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
const wasiClang = wasmToolchain?.clang ?? "";
const wasiSysroot = wasmToolchain?.sysroot ?? "";
const wasiGmp = wasmToolchain?.gmpPrefix ?? "";
const wasmToolchainAvailable = wasmToolchain !== null;

function wasmManifest(bytes, bridge) {
  const logicalSource = "sagejs/native/float64_branch_witness.py";
  const identityHash = "float64-wasm-identity";
  const sourceHash = "float64-wasm-source";
  const abiHash = "float64-wasm-abi";
  const coreHash = "float64-wasm-core";
  const oracleIdentity = "float64-wasm-oracle";
  const functions = bridge.functions.map((fn, index) => ({
    name: fn.name,
    declarationHash: `float64-declaration-${index}`,
    status: "compiled-source",
    bridge: fn,
  }));
  return {
    schema: "sagejs.native-wasm-pack/v1",
    packs: [{
      domain: "gmp",
      status: "built",
      asset: "float64.wasm",
      sha256: createHash("sha256").update(bytes).digest("hex"),
      modules: [identityHash],
      identity: { modules: [{
        logicalSource,
        sourceHash,
        abiHash,
        coreHash,
        oracleIdentity,
        identityHash,
        functions: functions.map(({ name }) => name),
      }] },
    }],
    kernels: [{
      id: "float64-bridge-witness-production",
      logicalSource,
      domain: "gmp",
      sourceHash,
      abiHash,
      coreHash,
      oracleIdentity,
      identityHash,
      runtime: bridge.runtime,
      functions,
    }],
  };
}

function wasiHost() {
  const { WASI } = require("node:wasi");
  const wasi = new WASI({ version: "preview1", returnOnExit: true });
  return {
    imports: { wasi_snapshot_preview1: wasi.wasiImport },
    initialize(instance) {
      wasi.initialize(instance);
    },
  };
}

test("Float64 buffers execute in standalone and browser-shaped Wasm loaders", {
  skip: wasmToolchainAvailable
    ? false
    : "a WASI clang/sysroot toolchain is not available",
  timeout: 120_000,
}, async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-float64-wasm-"));
  try {
    const ir = await lowerSource(witnessSource, witnessPath);
    const moduleIdentity = "13579bdf02468ace";
    const core = generateHostCore(ir, { moduleIdentity });
    const bridge = generateWasmBridge({
      ir,
      moduleIdentity,
      functionNames: ["scaled_buffer_batch"],
    });
    const corePath = join(temporary, "kernel_core.c");
    const headerPath = join(temporary, "kernel_core.h");
    const bridgePath = join(temporary, "wasm_bridge.c");
    const wasmPath = join(temporary, "float64.wasm");
    writeFileSync(corePath, core.source);
    writeFileSync(headerPath, core.header);
    writeFileSync(bridgePath, bridge.source);
    const compiled = spawnSync(wasiClang, [
      "--target=wasm32-wasi",
      `--sysroot=${wasiSysroot}`,
      "-mexec-model=reactor",
      "-O2",
      `-I${temporary}`,
      ...(existsSync(join(wasiGmp, "include"))
        ? [`-I${join(wasiGmp, "include")}`]
        : []),
      corePath,
      bridgePath,
      ...(existsSync(join(wasiGmp, "lib", "libgmp.a"))
        ? [`-L${join(wasiGmp, "lib")}`, "-lgmp"]
        : []),
      "-lm",
      ...bridge.exports.map((name) => `-Wl,--export=${name}`),
      "-Wl,--export-memory",
      "-Wl,--gc-sections",
      "-o",
      wasmPath,
    ], { cwd: root, encoding: "utf8" });
    assert.equal(compiled.status, 0, compiled.stdout + compiled.stderr);
    const bytes = readFileSync(wasmPath);

    // Exercise the bridge exports directly as a standalone Wasm ABI.
    const standaloneHost = wasiHost();
    const standalone = await WebAssembly.instantiate(
      await WebAssembly.compile(bytes),
      standaloneHost.imports,
    );
    standaloneHost.initialize(standalone);
    const sourceAddress = Number(standalone.exports[bridge.runtime.allocate](24));
    const outputAddress = Number(standalone.exports[bridge.runtime.allocate](24));
    new Float64Array(standalone.exports.memory.buffer, sourceAddress, 3)
      .set([1.5, -2.0, 4.0]);
    const raw = standalone.exports[bridge.functions[0].export];
    assert.equal(raw(sourceAddress, 3, outputAddress, 3, 2.0, 3n), 0);
    assert.equal(
      standalone.exports[bridge.runtime.resultFloat64](0),
      7.0,
    );
    assert.deepEqual(
      Array.from(new Float64Array(
        standalone.exports.memory.buffer,
        outputAddress,
        3,
      )),
      [3.0, -4.0, 8.0],
    );
    standalone.exports[bridge.runtime.deallocate](outputAddress);
    standalone.exports[bridge.runtime.deallocate](sourceAddress);

    // The ESM loader uses only browser-standard WebAssembly and typed-array
    // APIs; the injected host supplies the platform-specific WASI imports.
    const { instantiateWasmKernelPacks } = await import(
      "../wasm-pack-loader.mjs"
    );
    const manifest = wasmManifest(bytes, bridge);
    const resolver = await instantiateWasmKernelPacks({
      manifest,
      load: async () => bytes,
      host: async () => wasiHost(),
    });
    const batch = resolver.function(
      "sagejs/native/float64_branch_witness.py",
      "scaled_buffer_batch",
    );
    const source = Object.freeze([1.5, -2.0, 4.0]);
    const output = new Float64Array(3);
    assert.equal(batch(source, output, 2.0, 3n), 7.0);
    assert.deepEqual(Array.from(output), [3.0, -4.0, 8.0]);
    assert.throws(
      () => batch({ length: 0x2000_0000 }, output, 2.0, 3n),
      /bounded wasm32 allocation ABI/,
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
