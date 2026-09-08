"use strict";
// Diagnostic preload only: time the existing packed N-API call. No C changes.
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const index = JSON.parse(fs.readFileSync(path.resolve('dist/native-kernels/index.json')));
const identity = index.logicalSources['sagejs/number_fields/cubic_class_number_native.py'];
assert.ok(identity && identity.cacheKey);
const packPath = path.resolve('dist/native-kernels/pack/sagejs_native_kernel_pack.node');
const packHash = crypto.createHash('sha256').update(fs.readFileSync(packPath)).digest('hex');
const originalLoad = Module._load;
const originalWrite = process.stdout.write;
let active = false, installed = false;
const calls = [];
const profilePath = process.env.SAGEJS_DIAGNOSTIC_PHASE_PROFILE;
let inspector;
function inspectorCommand(method, params = {}) {
  let completed = false, result;
  inspector.post(method, params, (error, response) => {
    if (error) throw error;
    completed = true;
    result = response;
  });
  assert.ok(completed, 'phase profiling requires synchronous local inspector responses');
  return result;
}
if (profilePath) {
  const {Session} = require('node:inspector');
  inspector = new Session();
  inspector.connect();
  inspectorCommand('Profiler.enable');
  inspectorCommand('Profiler.setSamplingInterval', {interval: 100});
}
process.stdout.write = function(chunk, ...args) {
  const text = String(chunk);
  if (text.includes('SAGEJS_NATIVE_LEDGER_BEGIN')) {
    if (inspector) inspectorCommand('Profiler.start');
    active = true;
  }
  if (text.includes('SAGEJS_NATIVE_LEDGER_END')) {
    active = false;
    if (inspector) {
      fs.writeFileSync(profilePath, JSON.stringify(inspectorCommand('Profiler.stop').profile));
      inspector.disconnect();
      inspector = null;
    }
  }
  return Reflect.apply(originalWrite, this, [chunk, ...args]);
};
Module._load = function(request, parent, isMain) {
  const result = Reflect.apply(originalLoad, this, [request, parent, isMain]);
  if (!installed && String(request).endsWith('sagejs_native_kernel_pack.node')) {
    const original = result[identity.cacheKey];
    assert.ok(original, 'the selected production kernel must be in this pack');
    const descriptors = Object.getOwnPropertyDescriptors(original);
    let wrapped = 0;
    for (const [name, descriptor] of Object.entries(descriptors)) {
      if (!/^certified_complex_cubic_class_group_v1(?:\$(?:gmp|tagged))?$/.test(name)) continue;
      const callable = descriptor.value;
      assert.equal(typeof callable, 'function');
      descriptor.value = function(...args) {
        if (!active) return Reflect.apply(callable, original, args);
        const start = process.hrtime.bigint();
        try { return Reflect.apply(callable, original, args); }
        finally { calls.push({name, ns: String(process.hrtime.bigint() - start)}); }
      };
      wrapped++;
    }
    assert.equal(wrapped, 3);
    // N-API methods are immutable, so clone descriptors instead of violating
    // Proxy invariants or attempting to overwrite the individual methods.
    result[identity.cacheKey] = Object.defineProperties(Object.create(Object.getPrototypeOf(original)), descriptors);
    installed = true;
  }
  return result;
};
process.on('exit', () => {
  assert.ok(installed && calls.length > 0, 'the native timing hook must have executed');
  console.error('NATIVE_LEDGER=' + JSON.stringify({instrumented: true, cacheKey: identity.cacheKey,
    sourceHash: identity.sourceHash, packHash, calls}));
});
