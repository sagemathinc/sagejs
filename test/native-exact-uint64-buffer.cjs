// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const { compileKernel } = require("../tools/native-kernel/compiler.cjs");
const { generateHostCore } = require("../tools/native-kernel/c-backend.cjs");
const { explainKernel } = require("../tools/native-kernel/introspection.cjs");
const { lowerSource } = require("../tools/native-kernel/ir.cjs");
const { pythonExecutable } = require("../tools/python-executable.cjs");
const {
  removeLoadedNativeCache,
} = require("./helpers/native-cache-cleanup.cjs");

const root = join(__dirname, "..");
const sourcePath = join(root, "bench", "native_exact_uint64_buffer.py");

function operations(body, result = []) {
  for (const operation of body || []) {
    result.push(operation);
    operations(operation.body, result);
    operations(operation.alternative, result);
    operations(operation.condition?.operations, result);
    operations(operation.right?.operations, result);
  }
  return result;
}

test("exact IR retains borrowed UInt64Buffer typing and isolation", async () => {
  const source = readFileSync(sourcePath, "utf8");
  const ir = await lowerSource(source, sourcePath);
  const fn = ir.functions[0];
  const kinds = operations(fn.body).map((operation) => operation.kind);
  assert.deepEqual(fn.params.map((param) => param.type), [
    "IntegerBuffer", "UInt64Buffer", "uint64", "uint64",
  ]);
  assert.ok(kinds.includes("integer.buffer.get"));
  assert.ok(kinds.includes("integer.mod_uint64"));
  assert.ok(kinds.includes("uint64.buffer.get"));
  assert.ok(kinds.includes("uint64.buffer.set"));
  assert.deepEqual(fn.analysis.effects.externalWrites, ["words"]);
  assert.ok(fn.analysis.effects.mayRaise.includes("IndexError"));
  assert.ok(fn.analysis.effects.mayRaise.includes("ZeroDivisionError"));

  const explanation = await explainKernel({ sourcePath });
  assert.equal(explanation.eligible, true);
  assert.equal(explanation.functions[0].sourceTransparent, true);
  assert.equal(
    explanation.functions[0].hostIsolation.normalPathHostCallbacks,
    0,
  );
  assert.equal(
    explanation.functions[0].ir.kinds["integer.mod_uint64"],
    1,
  );
  assert.equal(
    explanation.functions[0].ir.kinds["uint64.buffer.set"],
    2,
  );

  const core = generateHostCore(ir);
  assert.equal(core.audit.isolated, true);
  assert.equal(core.audit.hostCallbacks, 0);
  assert.doesNotMatch(core.source, /\b(?:napi_|node_api|PyObject|Py_|JSValue|v8::)/);
  assert.match(core.source, /sagejs_mpz_mod_uint64/);
  assert.match(core.source, /sagejs_tagged_mod_uint64/);
  assert.match(core.source, /UInt64Buffer index out of range/);
});

test("compiled, JavaScript, tagged, GMP, and CPython paths agree", async () => {
  const cacheRoot = join(
    tmpdir(), `sagejs-native-exact-u64-${process.pid}-${Date.now()}`,
  );
  try {
    const compiled = await compileKernel({ sourcePath, cacheRoot });
    const module = require(compiled.modulePath);
    const fn = module.exact_uint64_buffer_witness;
    assert.equal(fn.nativeAvailable, true);

    let state = 0x6a09e667;
    const random = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state;
    };
    const cases = [];
    for (let sample = 0; sample < 48; sample += 1) {
      const sign = random() & 1 ? 1n : -1n;
      const value = sign * (
        (BigInt(random()) << 160n) +
        (BigInt(random()) << 96n) +
        (BigInt(random()) << 32n) + BigInt(random())
      );
      const modulus = (BigInt(random() & 0x0fffffff) << 31n) +
        BigInt(random() | 1);
      const seed = BigInt(random());
      cases.push({ value, modulus, seed });
    }

    for (const implementation of [
      fn.javascript, fn.tagged, fn.gmp, fn,
    ]) {
      for (const { value, modulus, seed } of cases) {
        const words = implementation === fn
          ? new BigUint64Array([seed, 0n]) : [seed, 0n];
        const expected = BigInt.asUintN(64, seed + (value % modulus + modulus) % modulus);
        assert.equal(implementation([0n, value], words, 1, modulus), expected);
        assert.equal(BigInt(words[0]), expected);
      }
    }

    const python = spawnSync(pythonExecutable(), ["-c", [
      "import sys",
      `sys.path.append(${JSON.stringify(join(root, "src", "lib"))})`,
      `sys.path.append(${JSON.stringify(join(root, "bench"))})`,
      "from native_exact_uint64_buffer import exact_uint64_buffer_witness as f",
      "cases = [(-17, 13, 9), (2**250 + 7, 2**55 + 33, 4)]",
      "for value, modulus, seed in cases:",
      "    words = [seed, 0]",
      "    print(f([0, value], words, 1, modulus), words[0])",
    ].join("\n")], {
      encoding: "utf8",
      env: { ...process.env, PYTHONPATH: "" },
    });
    assert.equal(python.status, 0, python.stderr);
    assert.deepEqual(python.stdout.trim().split(/\r?\n/), [
      "18 18", "1273372977659915 1273372977659915",
    ]);

    for (const implementation of [fn.javascript, fn.tagged, fn.gmp]) {
      assert.throws(
        () => implementation([3n, 4n], [5n], 1, 7),
        /UInt64Buffer index out of range|IntegerBuffer index out of range/,
      );
      assert.throws(
        () => implementation([3n], [5n], 0, 0),
        /division or modulo by zero/,
      );
    }
  } finally {
    removeLoadedNativeCache(cacheRoot);
  }
});
