#!/usr/bin/env node
// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const test = require("node:test");

const root = resolve(__dirname, "..");
const serialization = require("../dist/tools/serialization.js");

function runSage(source) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-prime-sagepack-"));
  const filename = join(directory, "exercise.py");
  try {
    writeFileSync(filename, source);
    const result = spawnSync(resolve(root, "bin/sagejs"), [filename], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    return result.stdout.trim();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("dense prime SagePack bytes are canonical, safe, and independently owned", () => {
  const output = runSage(String.raw`
from sagejs_serialization import dumps, loads
import sagejs.runtime as runtime


def expect_failure(function, message):
    try:
        function()
    except ValueError as error:
        assert message in str(error), (message, str(error))
        return
    raise AssertionError("malformed SagePack unexpectedly loaded")


def expect_type_failure(function, message):
    try:
        function()
    except TypeError as error:
        assert message in str(error), (message, str(error))
        return
    raise AssertionError("invalid storage unexpectedly succeeded")


def js_array(values):
    result = runtime.reflect.construct(runtime.array, [])
    push = runtime.reflect.get(result, "push")
    for value in values:
        runtime.reflect.apply(push, result, [value])
    return result


# Exercise storage layouts that are easy to mishandle in a bulk typed-array
# implementation: an offset source view, unaligned input bytes, shared memory,
# and detached ordinary ArrayBuffers.
wide = runtime.uint64_buffer([0x1234, 0xABCD, 0xFFFF])
wide_carrier = runtime.uint64_buffer([91, 0x1234, 0xABCD, 0xFFFF, 92])
wide_subarray = runtime.reflect.apply(
    runtime.reflect.get(wide_carrier, "subarray"), wide_carrier, [1, 4]
)
assert list(runtime.uint64_pack_le(wide_subarray, 2)) == list(
    runtime.uint64_pack_le(wide, 2)
)

packed = runtime.uint64_pack_le(wide, 2)
uint8_array = runtime.reflect.get(runtime.global_object, "Uint8Array")
byte_carrier = runtime.reflect.construct(uint8_array, [len(packed) + 2])
runtime.reflect.apply(
    runtime.reflect.get(byte_carrier, "set"), byte_carrier, [packed, 1]
)
unaligned = runtime.reflect.apply(
    runtime.reflect.get(byte_carrier, "subarray"),
    byte_carrier,
    [1, len(packed) + 1],
)
assert [int(value) for value in runtime.uint64_unpack_le(
    unaligned, 2, len(wide)
)] == [int(value) for value in wide]

shared_array_buffer = runtime.reflect.get(
    runtime.global_object, "SharedArrayBuffer"
)
big_uint64_array = runtime.reflect.get(
    runtime.global_object, "BigUint64Array"
)
if shared_array_buffer is not runtime.undefined:
    shared = runtime.reflect.construct(shared_array_buffer, [24])
    shared_values = runtime.reflect.construct(big_uint64_array, [shared])
    runtime.reflect.apply(
        runtime.reflect.get(shared_values, "set"), shared_values, [wide]
    )
    assert list(runtime.uint64_pack_le(shared_values, 2)) == list(packed)

structured_clone = runtime.reflect.get(runtime.global_object, "structuredClone")
array_buffer = runtime.reflect.get(runtime.global_object, "ArrayBuffer")
if structured_clone is not runtime.undefined:
    detached_buffer = runtime.reflect.construct(array_buffer, [8])
    detached_values = runtime.reflect.construct(big_uint64_array, [detached_buffer])
    options = runtime.object.create(None)
    runtime.reflect.set(options, "transfer", js_array([detached_buffer]))
    runtime.reflect.apply(
        structured_clone, runtime.undefined, [detached_buffer, options]
    )
    expect_type_failure(
        lambda: runtime.uint64_pack_le(detached_values, 8), "detached"
    )
    detached_byte_buffer = runtime.reflect.construct(array_buffer, [2])
    detached_bytes = runtime.reflect.construct(uint8_array, [detached_byte_buffer])
    byte_options = runtime.object.create(None)
    runtime.reflect.set(
        byte_options, "transfer", js_array([detached_byte_buffer])
    )
    runtime.reflect.apply(
        structured_clone,
        runtime.undefined,
        [detached_byte_buffer, byte_options],
    )
    expect_type_failure(
        lambda: runtime.uint64_unpack_le(detached_bytes, 2, 1),
        "detached",
    )


cases = [
    (GF(97), [0, 1, 96, 42, 17, 88]),
    (GF(65521), [0, 1, 65520, 256, 4097, 17]),
    (GF(65537), [0, 1, 65536, 0x1234, 0xABCD, 17]),
    (
        GF(2305843009213693951),
        [0, 1, 2305843009213693950, 0x123456789ABC, 17, 99],
    ),
]
for field, entries in cases:
    source = matrix(field, 2, 3, entries)
    source.list = lambda: 1 / 0
    payload = dumps(source)
    restored = loads(payload)
    assert restored == source
    old = source[0, 0]
    restored[0, 0] = restored[0, 0] + 1
    assert source[0, 0] == old

golden = dumps(matrix(GF(97), 2, 3, [0, 1, 96, 42, 17, 88]))
print(golden.hex())

malformed = bytearray(dumps(matrix(GF(97), 2, 2, [1, 2, 3, 4])))
malformed[-1] = 255
expect_failure(
    lambda: loads(bytes(malformed)),
    "compact matrix residue is outside its field",
)

noncanonical_width = bytearray(
    dumps(matrix(GF(97), 2, 2, [1, 2, 3, 4]))
)
marker = b'"entryWidth",1'
position = bytes(noncanonical_width).find(marker)
assert position >= 0
noncanonical_width[position + len(marker) - 1] = ord("2")
expect_failure(
    lambda: loads(bytes(noncanonical_width)),
    "compact matrix residue width is noncanonical",
)

word_prime = 2305843009213693951
malformed_word = bytearray(
    dumps(matrix(GF(word_prime), 1, 1, [word_prime - 1]))
)
for byte_index in range(8):
    malformed_word[-8 + byte_index] = (word_prime >> (8 * byte_index)) & 255
expect_failure(
    lambda: loads(bytes(malformed_word)),
    "compact matrix residue is outside its field",
)

noncanonical_word_width = bytearray(
    dumps(matrix(GF(word_prime), 1, 1, [word_prime - 1]))
)
word_marker = b'"entryWidth",8'
word_position = bytes(noncanonical_word_width).find(word_marker)
assert word_position >= 0
noncanonical_word_width[word_position + len(word_marker) - 1] = ord("4")
expect_failure(
    lambda: loads(bytes(noncanonical_word_width)),
    "compact matrix residue width is noncanonical",
)
`);
  const digest = crypto
    .createHash("sha256")
    .update(Buffer.from(output, "hex"))
    .digest("hex");
  assert.equal(digest, "782ecb8c6d0b23dec4738e0a0656ce1df7a5d2bf5095ec85bc5d72d70ed617d2");
});

test("custom codecs may still claim ordinary plain objects", () => {
  const unregister = serialization.registerCodec({
    type: "test.plain-object",
    version: 1,
    test: (value) => value?.plainCodec === true,
    encode: (value, context) => context.encode(value.value),
    decode: (payload, context) => ({
      plainCodec: true,
      value: context.decode(payload),
    }),
  });
  try {
    const restored = serialization.unpack(
      serialization.pack({ plainCodec: true, value: 2026n }),
    );
    assert.deepEqual(restored, { plainCodec: true, value: 2026n });
  } finally {
    unregister();
  }
});

test("dense prime SagePack warm paths retain bulk performance", () => {
  const fields = runSage(String.raw`
import sagejs.runtime as runtime
from sagejs_serialization import dumps, loads


def median(function):
    values = []
    result = None
    for _sample in range(7):
        started = runtime.wall_time()
        result = function()
        values.append(1000 * (runtime.wall_time() - started))
    values.sort()
    return values[len(values) // 2], result


set_random_seed(20260812)
source = random_matrix(GF(97), 500)
source.list = lambda: 1 / 0
residues = source._prime_residues()
pack_time, packed = median(lambda: runtime.uint64_pack_le(residues, 1))
unpack_time, unpacked = median(
    lambda: runtime.uint64_unpack_le(packed, 1, 500 * 500)
)
serialize_time, payload = median(lambda: dumps(source))
deserialize_time, restored = median(lambda: loads(payload))
assert restored == source
assert len(unpacked) == 500 * 500
print(pack_time, unpack_time, serialize_time, deserialize_time)
`)
    .split(/\s+/)
    .map(Number);
  assert.equal(fields.length, 4);
  const [pack, unpack, serialize, deserialize] = fields;
  assert.ok(pack < 5, `uint64 pack took ${pack.toFixed(2)} ms`);
  assert.ok(unpack < 5, `uint64 unpack took ${unpack.toFixed(2)} ms`);
  // The source.list trap above is the structural proof that these paths stay
  // bulk. Keep a generous catastrophe budget here: single-digit millisecond
  // cutoffs are not portable across CI hosts, and macOS can cross a V8
  // allocation/GC boundary even in the median of seven warm samples.
  assert.ok(serialize < 25, `SagePack serialization took ${serialize.toFixed(2)} ms`);
  assert.ok(deserialize < 25, `SagePack deserialization took ${deserialize.toFixed(2)} ms`);
});
