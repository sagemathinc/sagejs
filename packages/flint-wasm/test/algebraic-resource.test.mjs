import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { createAlgebraicBackend } from "../algebraic.mjs";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const artifact = [
  process.env.SAGEJS_ALGEBRAIC_WASM,
  path.join(packageRoot, "dist", "flint-algebraic.wasm"),
  path.join(packageRoot, "dist", "flint-factor.wasm"),
].filter(Boolean).find((candidate) => fs.existsSync(candidate));

test("real FLINT Wasm algebraic resources preserve exact semantics", async (t) => {
  if (artifact === undefined) {
    t.skip("the production FLINT Wasm artifact has not been built");
    return;
  }
  const module = await WebAssembly.compile(fs.readFileSync(artifact));
  const exportNames = new Set(
    WebAssembly.Module.exports(module).map(({ name }) => name),
  );
  if (!exportNames.has("sagejs_wasm_algebraic_initialize")) {
    t.skip("the integration lane has not linked the algebraic resource core");
    return;
  }

  const { createWasiHost } = await import("../dist/wasi-runtime.mjs");
  const wasi = createWasiHost();
  const instance = await WebAssembly.instantiate(module, {
    wasi_snapshot_preview1: wasi.imports,
  });
  wasi.initialize(instance);
  const algebraic = createAlgebraicBackend(instance);
  const require = createRequire(import.meta.url);
  const native = require("../../flint/index.cjs");

  const two = algebraic.qqbarFromRational(2n, 1n);
  const positiveRoot = algebraic.qqbarPowRational(two, 1n, 2n);
  const fourthRoot = algebraic.qqbarRootOfUnity(1n, 4n);
  assert.equal(algebraic.qqbarToString(fourthRoot, 30), "I");
  assert.deepEqual(
    algebraic.qqbarMinpolyCoefficients(positiveRoot),
    [-2n, 0n, 1n],
  );
  assert.equal(algebraic.qqbarIsReal(positiveRoot), true);
  assert.equal(algebraic.qqbarDegree(positiveRoot), 2);
  const nativeTwo = native.qqbarFromRational(2n, 1n);
  const nativeRoot = native.qqbarPowRational(nativeTwo, 1n, 2n);
  assert.deepEqual(
    algebraic.qqbarMinpolyCoefficients(positiveRoot),
    native.qqbarMinpolyCoefficients(nativeRoot),
  );
  assert.equal(
    algebraic.qqbarToString(positiveRoot, 30),
    native.qqbarToString(nativeRoot, 30),
  );
  const interval = algebraic.qqbarEnclosure(positiveRoot, 80);
  assert.equal(interval.rigorous, true);
  assert.equal(interval.imag.lower, 0n);
  assert.equal(interval.imag.upper, 0n);

  const roots = algebraic.polyExactRoots([-4n, 0n, 4n, 0n, -1n]);
  assert.equal(roots.length, 2);
  assert.deepEqual(roots.map(([, multiplicity]) => multiplicity), [2, 2]);
  assert.equal(
    algebraic.qqbarCompareReal(roots[0][0], roots[1][0]),
    -1,
  );
  const x = native.zzPolyGen();
  const nativeRepeated = native.polyPow(
    native.polySub(native.polyPow(x, 2n), native.zzPolyConstant(2n)),
    2n,
  );
  const nativeRoots = native.polyExactRoots(nativeRepeated);
  assert.deepEqual(
    roots.map(([value, multiplicity]) => [
      algebraic.qqbarToString(value, 30), multiplicity,
    ]),
    nativeRoots.map(([value, multiplicity]) => [
      native.qqbarToString(value, 30), multiplicity,
    ]),
  );

  const restored = algebraic.qqbarDeserialize(
    algebraic.qqbarSerialize(positiveRoot),
  );
  assert.equal(algebraic.qqbarEqual(positiveRoot, restored), true);
  assert.throws(
    () => algebraic.qqbarDeserialize(Uint8Array.from([0, 1, 2, 3])),
    /malformed|rejected/i,
  );

  for (const value of [
    two,
    positiveRoot,
    restored,
    fourthRoot,
    ...roots.map(([root]) => root),
  ]) {
    algebraic.qqbarClose(value);
  }
  assert.equal(algebraic.__sagejs_algebraic_live_count__(), 0);
});
