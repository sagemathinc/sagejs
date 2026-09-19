// sagejs-test-tier: unit
// sagejs-test-portable: true
// sagejs-test-smoke: true
// sagejs-test-platform: true
"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

// Exercise the compiler's actual dependency hash without changing shared files
// or requiring native toolchains. Only allocator reads are substituted; every
// other generator is read from this checkout, with an unchanged declaration set.
function fingerprintHarness() {
  const directory = path.resolve(__dirname, "../tools/native-kernel");
  const filename = path.join(directory, "compiler.cjs");
  const allocator = path.join(directory, "gmp-checkpoint-allocator.cjs");
  const source = fs.readFileSync(filename, "utf8");
  const start = source.indexOf("function backendFingerprint() {");
  const end = source.indexOf("function toolchainFingerprint() {", start);
  assert.ok(start >= 0 && end > start, "locate the actual fingerprint function");
  const original = fs.readFileSync(allocator);
  let contents = original;
  const fingerprint = vm.runInNewContext(
    source.slice(start, end) + "\nbackendFingerprint",
    {
      sha256: (value) => createHash("sha256").update(value).digest("hex"),
      readFileSync: (input) => {
        if (input !== allocator) return fs.readFileSync(input);
        if (contents === null) throw new Error("allocator unavailable");
        return contents;
      },
      join: path.join,
      __dirname: directory,
      __filename: filename,
      root: path.resolve(__dirname, ".."),
      declarationFiles: () => [],
      // The header is fixed in this dependency experiment.
      header: filename,
    },
  );
  return { fingerprint, original, replace: (value) => { contents = value; } };
}

test("embedded allocator bytes invalidate the native backend fingerprint", () => {
  const harness = fingerprintHarness();
  const before = harness.fingerprint();
  assert.match(before, /^[a-f0-9]{64}$/);
  assert.equal(harness.fingerprint(), before, "unchanged inputs stay stable");
  const changed = Buffer.from(harness.original);
  changed[changed.length - 1] ^= 1;
  harness.replace(changed);
  assert.notEqual(harness.fingerprint(), before, "same-size allocator edit is hashed");
  harness.replace(harness.original);
  assert.equal(harness.fingerprint(), before, "restoring bytes restores identity");
});

test("missing allocator bytes fail fingerprinting closed", () => {
  const harness = fingerprintHarness();
  harness.replace(null);
  assert.throws(() => harness.fingerprint(), /allocator unavailable/);
});
