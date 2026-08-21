"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  RUNTIME_EXPORT_KEYS,
  kernelPackExports,
} = require("../scripts/kernel-pack-exports.cjs");

function compiledKernel(id, suffix) {
  return {
    id,
    runtime: Object.fromEntries(
      RUNTIME_EXPORT_KEYS.map((key) => [key, `${key}_${suffix}`]),
    ),
    functions: [{
      name: "probe",
      status: "compiled-source",
      bridge: { export: `call_${suffix}` },
    }],
  };
}

test("production pack exports include every declared marshalling runtime", () => {
  const exports = kernelPackExports(
    [
      compiledKernel("first-production", "first"),
      compiledKernel("second-production", "second"),
    ],
    ["resource_bridge", "resource_bridge"],
  );

  for (const suffix of ["first", "second"]) {
    assert.ok(exports.includes(`call_${suffix}`));
    for (const key of RUNTIME_EXPORT_KEYS) {
      assert.ok(exports.includes(`${key}_${suffix}`));
    }
  }
  assert.equal(exports.filter((name) => name === "resource_bridge").length, 1);
  assert.deepEqual(exports, [...exports].sort());
});

test("compiled pack kernels fail closed on incomplete runtime contracts", () => {
  const kernel = compiledKernel("broken-production", "broken");
  delete kernel.runtime.allocate;
  assert.throws(
    () => kernelPackExports([kernel]),
    /broken-production lacks runtime export allocate/,
  );
});
