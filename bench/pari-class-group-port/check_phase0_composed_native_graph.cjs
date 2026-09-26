"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const sourcePath = path.join(__dirname, "phase0_composed_native_graph.py");

function signature(ir, name) {
  const fn = ir.functions.find((entry) => entry.name === name);
  assert(fn, `missing composed dependency ${name}`);
  return Object.fromEntries(fn.params.map((param) => [param.name, param.type]));
}

function exact(values, fn, backend) {
  return backend === "javascript"
    ? values.map(BigInt)
    : fn.createIntegerBuffer(values.length, 64, values.map(BigInt));
}

function floats(values, fn, backend) {
  return backend === "javascript" ? values.slice() : fn.createFloat64Buffer(values);
}

function values(buffer) {
  return Array.isArray(buffer)
    ? buffer
    : buffer.toArray
      ? buffer.toArray()
      : Array.from(buffer);
}

(async () => {
  const built = await compileKernel({ sourcePath });
  const module = require(built.modulePath);

  // These are the actual cross-stage representation boundaries.  In
  // particular, prepared logarithm triples stay exact through lattice
  // reduction and getfu; cleanarchunit is a later binary64 verifier, not the
  // producer of getfu's exact input.
  assert.equal(signature(built.ir, "pari_prepared_famat_cxlog").ga, "IntegerBuffer");
  assert.equal(signature(built.ir, "pari_getfu_real_cubic").clean_logs, "IntegerBuffer");
  assert.equal(signature(built.ir, "pari_getfu_real_cubic").output_logs, "IntegerBuffer");
  assert.equal(signature(built.ir, "pari_getfu_real_cubic").state, "Int64Buffer");
  assert.equal(
    signature(built.ir, "pari_unit_integer_lattice_rank_two").state,
    "IntegerBuffer",
  );
  assert.equal(signature(built.ir, "pari_cleanarchunit_real_cubic").arch, "Float64Buffer");
  assert.equal(signature(built.ir, "pari_cleanarchunit_real_cubic").clean, "Float64Buffer");
  assert.equal(signature(built.ir, "pari_cubic_idealred_candidate").kinds, "IntegerBuffer");
  assert.equal(signature(built.ir, "pari_prepared_famat_cxlog").factor_kinds, "IntegerBuffer");
  assert.equal(signature(built.ir, "pari_class_group_smith_transform").state, "Int64Buffer");
  assert.equal(signature(built.ir, "pari_honesty_retry_ideal").output, "IntegerBuffer");

  const dependencyPaths = built.ir.nativeSourceDependencies.map((entry) => entry.path);
  assert.equal(new Set(dependencyPaths).size, dependencyPaths.length);
  for (const basename of [
    "class_group_smith_transform.py",
    "signed_prime_ideal_reduction.py",
    "nf_cxlog.py",
    "unit_reconstruction_cubic.py",
    "unit_lattice_reduction.py",
    "honesty_branch.py",
  ]) {
    assert(
      dependencyPaths.some((filename) => filename.endsWith(`/${basename}`)),
      `missing source identity for ${basename}`,
    );
  }
  const core = fs.readFileSync(built.coreSourcePath, "utf8");
  assert.doesNotMatch(core, /\b(?:napi_call_function|PyObject_Call|JS_Call|v8::)/);

  // Exercise exact-buffer and binary64 entries from the same generated addon.
  // Their independently qualified mathematical fixtures remain authoritative;
  // this is an ABI/composition regression, not a replacement oracle.
  for (const backend of ["javascript", "gmp", "tagged"]) {
    const product = module.composed_unit_product;
    const u1 = exact([1, 2, 3, 4, 5, 6], product, backend);
    const u2 = exact([1, 0, 0, 1], product, backend);
    const output = exact([0, 0, 0, 0, 0, 0], product, backend);
    assert.equal(product[backend](u1, 3n, u2, output), 0n);
    assert.deepEqual(values(output).map(BigInt), [1n, 2n, 3n, 4n, 5n, 6n]);

    const cleanarch = module.composed_cleanarchunit;
    const arch = floats(
      [1, 0, 0, 0, 0, 0, 1, 0, -1, 0, -1, 0],
      cleanarch,
      backend,
    );
    const clean = floats(Array(12).fill(0), cleanarch, backend);
    const trace = floats(Array(5).fill(0), cleanarch, backend);
    assert.equal(cleanarch[backend](arch, 2n, 1, clean, trace), 0n);
    assert.deepEqual(values(clean), values(arch));
    assert.deepEqual(values(trace), [0, 0, 1, 0, 0]);
  }

  console.log(JSON.stringify({
    functions: built.ir.functions.length,
    dependencies: dependencyPaths.length,
    backends: ["javascript", "gmp", "tagged"],
    boundary: "composed exact-buffer and binary64 Phase-0 suffix graph",
  }));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
