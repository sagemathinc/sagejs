// sagejs-test-tier: specialized
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const test = require("node:test");

const { generateHostCore } = require("../tools/native-kernel/c-backend.cjs");
const { compileKernel } = require("../tools/native-kernel/compiler.cjs");
const { lowerSource } = require("../tools/native-kernel/ir.cjs");

const sourcePath = resolve(
  __dirname,
  "../src/lib/sagejs/kernels/quaternion/brandt_rank4.py",
);
const diagonalGram = [
  2n, 0n, 0n, 0n,
  0n, 2n, 0n, 0n,
  0n, 0n, 2n, 0n,
  0n, 0n, 0n, 2n,
];

function runThetaNative(fn) {
  const output = fn.createUInt64Buffer(4);
  assert.equal(
    fn(
      output,
      fn.packIntegerBuffer(diagonalGram),
      fn.createUInt64Buffer([2n, 2n, 2n, 2n]),
      1n,
      2n,
      4n,
      65536n,
    ),
    true,
  );
  return Array.from(output);
}

function runVectorsNative(fn, capacity = 8) {
  const output = fn.createIntegerBuffer(4 * capacity, 4);
  const metadata = fn.createUInt64Buffer(1);
  const ok = fn(
    output,
    metadata,
    fn.packIntegerBuffer(diagonalGram),
    fn.createUInt64Buffer([1n, 1n, 1n, 1n]),
    1n,
    2n,
    65536n,
  );
  return { ok, count: Array.from(metadata)[0], values: output.toArray() };
}

test("Brandt rank-four kernels have isolated exact workspace IR", async () => {
  const source = readFileSync(sourcePath, "utf8");
  const ir = await lowerSource(source, sourcePath);
  assert.deepEqual(
    ir.functions.map((fn) => fn.name),
    ["brandt_rank4_theta_counts", "brandt_rank4_vectors_of_norm"],
  );
  for (const fn of ir.functions) {
    assert.equal(fn.analysis.backend.kind, "gmp");
    assert.equal(fn.analysis.execution.liveExactScopes, 1);
    assert.equal(fn.analysis.execution.nativeCalls, 0);
    assert.deepEqual(fn.analysis.effects.calls, []);
    assert.equal(fn.analysis.effects.threadSafe, true);
    assert.equal(fn.analysis.liveExactWorkspace.scopes[0].cleanup, "all-exit-idempotent");
  }
  const core = generateHostCore(ir);
  assert.equal(core.audit.isolated, true);
  assert.match(core.source, /mpz_addmul/);
  assert.match(core.source, /sagejs_native_integer_vector_clear/);
  assert.doesNotMatch(core.source, /\b(?:napi_|node_api|PyObject|Py_|JSValue|v8::)/);
});

test("Brandt rank-four native and JavaScript kernels agree exactly", async () => {
  const cacheRoot = mkdtempSync(join(tmpdir(), "sagejs-brandt-rank4-"));
  try {
    const compiled = await compileKernel({ sourcePath, cacheRoot });
    const module = require(compiled.modulePath);
    const theta = module.brandt_rank4_theta_counts;
    const vectors = module.brandt_rank4_vectors_of_norm;

    assert.deepEqual(runThetaNative(theta), [1n, 8n, 24n, 32n]);
    const dynamicTheta = Array(4).fill(0n);
    assert.equal(
      theta.javascript(
        dynamicTheta,
        diagonalGram,
        [2n, 2n, 2n, 2n],
        1n,
        2n,
        4n,
        65536n,
      ),
      true,
    );
    assert.deepEqual(dynamicTheta, [1n, 8n, 24n, 32n]);

    const native = runVectorsNative(vectors);
    assert.equal(native.ok, true);
    assert.equal(native.count, 8n);
    const dynamicOutput = Array(32).fill(0n);
    const dynamicMetadata = [0n];
    assert.equal(
      vectors.javascript(
        dynamicOutput,
        dynamicMetadata,
        diagonalGram,
        [1n, 1n, 1n, 1n],
        1n,
        2n,
        65536n,
      ),
      true,
    );
    assert.deepEqual(dynamicMetadata, [8n]);
    assert.deepEqual(native.values, dynamicOutput);

    const bounded = runVectorsNative(vectors, 7);
    assert.equal(bounded.ok, false);
    assert.equal(bounded.count, 0n);
    assert.throws(
      () => theta(
        theta.createUInt64Buffer(4),
        theta.packIntegerBuffer(diagonalGram),
        theta.createUInt64Buffer([2n, 2n, 2n, 2n]),
        1n,
        2n,
        4n,
        1n,
      ),
      /memory limit exceeded/,
    );
  } finally {
    rmSync(cacheRoot, { recursive: true, force: true });
  }
});
