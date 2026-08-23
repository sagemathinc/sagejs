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
const { classifyWasmFunction } = require("../wasm-bridge.cjs");

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
    supported: false,
    reason: "kernel-kind-float64-bridge-not-generated",
  });
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

    const python = process.env.PYTHON ||
      (process.platform === "win32" ? "python" : "python3");
    const cpythonProgram = [
      "import sys",
      `sys.path.insert(0, ${JSON.stringify(join(root, "src", "lib"))})`,
      `sys.path.insert(0, ${JSON.stringify(__dirname)})`,
      "from float64_branch_witness import choose_sqrt_sign, comparison_score, uint64_branch",
      "state = [1.0, 0.0, -0.9, 0.1, -0.8, 0.2]",
      "assert abs(choose_sqrt_sign(state, 3) - 0.8) < 1e-14",
      "assert state[2:] == [0.9, -0.1, 0.8, -0.2]",
      "assert comparison_score(1.0, 2.0) == -1.25",
      "assert comparison_score(2.0, 1.0) == 2.25",
      "assert comparison_score(2.0, 2.0) == 0.0",
      "assert uint64_branch(0) == 0.0 and uint64_branch(3) == 1.0",
      "print('cpython-ok')",
      "",
    ].join("\n");
    assert.equal(run(python, ["-I", "-c", cpythonProgram]), "cpython-ok");
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
