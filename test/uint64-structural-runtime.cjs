#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

const root = join(__dirname, "..");
const directory = mkdtempSync(join(tmpdir(), "sagejs-uint64-structural-"));

const source = String.raw`
import sagejs.runtime as runtime


def expect_failure(function, fragment):
    try:
        function()
    except Exception as error:
        assert fragment in str(error)
        return
    raise AssertionError("operation unexpectedly succeeded")


def reference_pack(values, width):
    output = []
    for original in values:
        value = int(original)
        for _ in range(width):
            output.append(value % 256)
            value //= 256
    return output


def reference_unpack(values, width):
    output = []
    for offset in range(0, len(values), width):
        value = 0
        multiplier = 1
        for byte in range(width):
            value += int(values[offset + byte]) * multiplier
            multiplier *= 256
        output.append(value)
    return output


def reference_format(values, rows, columns):
    if rows == 0:
        return "[]"
    texts = [str(int(value)) for value in values]
    width = max([len(text) for text in texts], default=0)
    lines = []
    for row in range(rows):
        offset = row * columns
        fields = []
        for column in range(columns):
            fields.append(texts[offset + column].rjust(width))
        lines.append("[" + " ".join(fields) + "]")
    return "\n".join(lines)


def elapsed_per_call(function, repeats):
    started = runtime.wall_time()
    for _ in range(repeats):
        function()
    return (runtime.wall_time() - started) / repeats


def median(values):
    ordered = sorted(values)
    return ordered[len(ordered) // 2]


def paired_times(small_function, large_function, repeats):
    # Warm both paths before timing so JIT and allocation setup do not dominate
    # these intentionally small structural primitives. Batched measurements
    # dilute scheduler pauses, while alternating the order avoids consistently
    # favoring either size under parallel test-tier load.
    for _ in range(3):
        small_function()
        large_function()
    small_times = []
    large_times = []
    for sample in range(7):
        if sample % 2 == 0:
            small_times.append(elapsed_per_call(small_function, repeats))
            large_times.append(elapsed_per_call(large_function, repeats))
        else:
            large_times.append(elapsed_per_call(large_function, repeats))
            small_times.append(elapsed_per_call(small_function, repeats))
    return median(small_times), median(large_times)


# Fixed byte patterns make the endianness contract visible and independent of
# the host CPU's typed-array representation.
edge_values = runtime.uint64_buffer(
    [0, 1, 0x7f, 0x80, 0xff, 0x100, 0x1234, 0x12345678,
     0xffffffffffffffff]
)
edge_bytes = runtime.uint64_pack_le(edge_values, 8)
assert [int(edge_bytes[index]) for index in range(8)] == [0] * 8
assert [int(edge_bytes[index]) for index in range(8, 16)] == [1] + [0] * 7
assert [int(edge_bytes[index]) for index in range(64, 72)] == [255] * 8
assert [int(value) for value in runtime.uint64_unpack_le(
    edge_bytes, 8, len(edge_values)
)] == [int(value) for value in edge_values]

# Differentially compare the previous nested-loop semantics on deterministic
# pseudo-random values at every supported width.
state = 0x9e3779b97f4a7c15
for width in [1, 2, 4, 8]:
    modulus = 2 ** (8 * width)
    values = []
    for _ in range(257):
        state = (
            state * 6364136223846793005 + 1442695040888963407
        ) % (2 ** 64)
        values.append(state % modulus)
    packed_values = runtime.uint64_buffer(values)
    packed_bytes = runtime.uint64_pack_le(packed_values, width)
    bytes_as_list = [int(value) for value in packed_bytes]
    assert bytes_as_list == reference_pack(values, width)
    unpacked = runtime.uint64_unpack_le(packed_bytes, width, len(values))
    assert [int(value) for value in unpacked] == reference_unpack(
        bytes_as_list, width
    )

expect_failure(
    lambda: runtime.uint64_pack_le(runtime.uint64_buffer([256]), 1),
    "does not fit",
)
expect_failure(
    lambda: runtime.uint64_pack_le(runtime.uint64_buffer([1]), 3),
    "width",
)
three_bytes = runtime.uint64_pack_le(runtime.uint64_buffer([1, 2, 3]), 1)
expect_failure(
    lambda: runtime.uint64_unpack_le(three_bytes, 2, 2),
    "does not match",
)
expect_failure(
    lambda: runtime.uint64_unpack_le(three_bytes, 1, 2),
    "does not match",
)
expect_failure(
    lambda: runtime.uint64_unpack_le(runtime.uint64_buffer([1]), 1, 1),
    "Uint8Array",
)

rectangular = runtime.uint64_buffer([1, 22, 333, 4444, 5, 66])
assert runtime.uint64_matrix_format(rectangular, 2, 3) == (
    "[   1   22  333]\n[4444    5   66]"
)
assert runtime.uint64_matrix_format(rectangular, 2, 3) == reference_format(
    rectangular, 2, 3
)
empty = runtime.uint64_buffer(0)
assert runtime.uint64_matrix_format(empty, 0, 9) == "[]"
assert runtime.uint64_matrix_format(empty, 3, 0) == "[]\n[]\n[]"
expect_failure(
    lambda: runtime.uint64_matrix_format(rectangular, 3, 3),
    "does not match",
)

# The old mathematical-source loops were a visible 500x500 cliff. Keep both
# an absolute gate and a scaling gate here, in the structural layer that owns
# the bulk traversal. The larger input is exactly 250,000 entries.
small = runtime.uint64_buffer(range(125000))
large = runtime.uint64_buffer(range(250000))

def pack_small():
    encoded = runtime.uint64_pack_le(small, 4)
    runtime.uint64_unpack_le(encoded, 4, len(small))

def pack_large():
    encoded = runtime.uint64_pack_le(large, 4)
    runtime.uint64_unpack_le(encoded, 4, len(large))

def format_small():
    runtime.uint64_matrix_format(small, 250, 500)

def format_large():
    runtime.uint64_matrix_format(large, 500, 500)

pack_small_seconds, pack_large_seconds = paired_times(
    pack_small, pack_large, 64
)
format_small_seconds, format_large_seconds = paired_times(
    format_small, format_large, 4
)

assert pack_large_seconds < 1.0, pack_large_seconds
assert format_large_seconds < 1.0, format_large_seconds
assert pack_large_seconds < pack_small_seconds * 4.0, (
    pack_small_seconds,
    pack_large_seconds,
)
assert format_large_seconds < format_small_seconds * 4.0, (
    format_small_seconds,
    format_large_seconds,
)

print("UINT64_STRUCTURAL_OK")
print("pack_small_ms=" + str(round(pack_small_seconds * 1000, 3)))
print("pack_500x500_ms=" + str(round(pack_large_seconds * 1000, 3)))
print("format_small_ms=" + str(round(format_small_seconds * 1000, 3)))
print("format_500x500_ms=" + str(round(format_large_seconds * 1000, 3)))
`;

try {
  const script = join(directory, "uint64_structural.py");
  writeFileSync(script, source);
  const result = spawnSync(process.execPath, [join(root, "bin", "sagejs"), script], {
    cwd: root,
    encoding: "utf8",
    timeout: 30_000,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /UINT64_STRUCTURAL_OK/);
  assert.match(result.stdout, /pack_500x500_ms=[0-9.]+/);
  assert.match(result.stdout, /format_500x500_ms=[0-9.]+/);
  process.stdout.write(result.stdout);
} finally {
  rmSync(directory, { recursive: true, force: true });
}
