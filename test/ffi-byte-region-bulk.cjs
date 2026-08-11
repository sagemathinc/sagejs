"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const test = require("node:test");

const root = join(__dirname, "..");
const flint = require("../packages/flint");

function close(resource, closer) {
  closer(resource);
  closer(resource);
}

test("generated copied-byte transfers are bulk, checked, and independent", () => {
  const empty = flint.ffiFlintByteRegionCreate(0n);
  const emptyCopy = flint.ffiFlintByteRegionCopyBytes(empty);
  assert.ok(Buffer.isBuffer(emptyCopy));
  assert.equal(emptyCopy.length, 0);
  close(empty, flint.ffiFlintByteRegionClose);

  const region = flint.ffiFlintByteRegionCreate(8n);
  for (let index = 0; index < 8; index += 1) {
    assert.equal(flint.ffiFlintByteRegionSet(
      region, BigInt(index), BigInt(17 + 19 * index),
    ), true);
  }
  const first = flint.ffiFlintByteRegionCopyBytes(region);
  assert.ok(Buffer.isBuffer(first));
  assert.deepEqual([...first], [17, 36, 55, 74, 93, 112, 131, 150]);

  assert.equal(flint.ffiFlintByteRegionSet(region, 0n, 255n), true);
  const second = flint.ffiFlintByteRegionCopyBytes(region);
  assert.equal(first[0], 17, "the host copy must not alias foreign storage");
  assert.equal(second[0], 255);
  close(region, flint.ffiFlintByteRegionClose);
  assert.throws(
    () => flint.ffiFlintByteRegionCopyBytes(region),
    /FFI resource is closed/,
  );

  const matrix = flint.ffiFmpqMatrixCreate(1n, 1n);
  assert.throws(
    () => flint.ffiFlintByteRegionCopyBytes(matrix),
    /expected declared FlintByteRegion resource/,
  );
  close(matrix, flint.ffiFmpqMatrixClose);
});

test("generated Python resources can copy or deterministically consume bytes", () => {
  const source = [
    "from sagejs.ffi.flint import flint_byte_region, flint_byte_region_set",
    "region = flint_byte_region(4)",
    "for index, value in enumerate([0, 1, 127, 255]):",
    "    flint_byte_region_set(region, index, value)",
    "first = region.copy_bytes()",
    "print(list(first), region.closed)",
    "second = region.take_bytes()",
    "print(list(second), region.closed)",
    "try:",
    "    region.copy_bytes()",
    "except ValueError as error:",
    "    print(type(error).__name__, str(error))",
    "",
  ].join("\n");
  const run = spawnSync(
    process.execPath,
    [join(root, "bin", "sagejs"), "--python"],
    { cwd: root, encoding: "utf8", input: source },
  );
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  assert.equal(
    run.stdout.trim(),
    "[0, 1, 127, 255] False\n" +
      "[0, 1, 127, 255] True\n" +
      "ValueError FFI resource is closed",
  );
});

test("bulk transfer preserves a variable-size FLINT serialization", () => {
  const matrix = flint.ffiFmpqMatrixRandbits(80n, 90n, 31n, 17n, 29n);
  const serialized = flint.ffiFmpqMatrixSerialize(matrix);
  const length = Number(flint.ffiFlintByteRegionLength(serialized));
  const bytes = flint.ffiFlintByteRegionCopyBytes(serialized);
  assert.equal(bytes.length, length);
  assert.ok(length > 100_000);
  for (const index of [0, 1, 17, 1024, length - 1]) {
    assert.equal(bytes[index], Number(
      flint.ffiFlintByteRegionGet(serialized, BigInt(index)),
    ));
  }
  close(serialized, flint.ffiFlintByteRegionClose);
  close(matrix, flint.ffiFmpqMatrixClose);
});
