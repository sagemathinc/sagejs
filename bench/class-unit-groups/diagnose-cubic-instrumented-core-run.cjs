"use strict";
// Counter/clock diagnostics only. Never use this as an uninstrumented timing.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const crypto = require("node:crypto");
const [instrumentedPath, originalPath, polynomialJSON, ...extra] = process.argv.slice(2);
assert(instrumentedPath && originalPath && polynomialJSON && !extra.length);
const coefficients = JSON.parse(polynomialJSON);
assert(Array.isArray(coefficients) && coefficients.length === 4);
assert(coefficients.every(x => typeof x === "string" && /^-?(0|[1-9][0-9]*)$/.test(x)));
const provenance = JSON.parse(fs.readFileSync(path.join(path.dirname(instrumentedPath), "DIAGNOSTIC-ONLY.json")));
const hash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
assert.equal(provenance.production_eligible, false);
assert.equal(hash(path.join(path.dirname(originalPath), "kernel_core.c")), provenance.original_core_sha256);
assert.equal(hash(path.join(path.dirname(instrumentedPath), "kernel_core.c")), provenance.instrumented_core_sha256);
function prepare(modulePath) {
  const module = require(path.resolve(modulePath));
  assert.equal(module.nativeAvailable, true);
  const k = module.certified_complex_cubic_class_group_v1;
  const out = k.createIntegerBuffer(64, 256), input = k.packIntegerBuffer(coefficients.map(BigInt));
  const scratch = [k.createUInt64Buffer(4161), ...[512,4,9,16,16,144,48,109,1,1,1].map(n => k.createIntegerBuffer(n,64))];
  return () => ({ accepted: k(out,input,...scratch,0,5,1048576,3145728), output: out.toArray().map(String) });
}
const reference = prepare(originalPath)();
assert.equal(reference.accepted, true, "profile requires fixed-effort acceptance");
const run = prepare(instrumentedPath);
for (let i = 0; i < 1100; i++) assert.deepEqual(run(), reference);
console.log(JSON.stringify({ diagnostic_only: true, controlled_timing: false,
  instrumentation_overhead_included: true, calls: 1100, coefficients, provenance,
  driver_sha256: hash(__filename), artifacts: [instrumentedPath, originalPath].map(modulePath => ({
    module_sha256: hash(modulePath),
    addon_sha256: hash(path.join(path.dirname(modulePath), 'build/Release/sagejs_native_kernel.node')),
  })),
  uninstrumented_output_parity: true, reference }));
