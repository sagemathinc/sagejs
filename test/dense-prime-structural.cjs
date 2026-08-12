#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const {
  mkdtempSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = join(__dirname, "..");

const source = String.raw`
import sagejs.runtime as runtime


def expect_failure(function, message):
    try:
        function()
        raise AssertionError("operation unexpectedly succeeded")
    except Exception as error:
        assert message in str(error), (message, str(error))


def legacy_pack(source, width):
    entries = source._prime_residues()
    packed = []
    for index in range(len(entries)):
        value = int(entries[index])
        for byte_index in range(width):
            packed.append(value % 256)
            value //= 256
    return packed


def legacy_unpack(space, packed, width):
    count = space.nrows() * space.ncols()
    values = []
    for index in range(count):
        offset = index * width
        value = 0
        multiplier = 1
        for byte_index in range(width):
            value += int(packed[offset + byte_index]) * multiplier
            multiplier *= 256
        values.append(value)
    return space._from_uint64_residues(values)


def legacy_format(source):
    text_rows = []
    width = 0
    for row in range(source.nrows()):
        text_row = []
        for column in range(source.ncols()):
            text = str(source[row, column])
            text_row.append(text)
            width = max(width, len(text))
        text_rows.append(text_row)
    lines = []
    for text_row in text_rows:
        lines.append("[" + " ".join(text.rjust(width) for text in text_row) + "]")
    return "\n".join(lines)


def minimum_time(function, repetitions=3):
    answer = 10**100
    for _repeat in range(repetitions):
        start = runtime.wall_time()
        function()
        answer = min(answer, runtime.wall_time() - start)
    return answer


def exact_list(values):
    return [int(value) for value in values]


# Every supported physical width round-trips a rectangular matrix and agrees
# byte-for-byte with the former interpreted implementation.
width_cases = [
    (1, 251, [0, 1, 2, 127, 128, 250]),
    (2, 65521, [0, 1, 255, 256, 65520, 42]),
    (4, 65521, [65520, 256, 1, 0, 40000, 17]),
    (8, 65521, [3, 5, 8, 13, 21, 34]),
]
for width, prime, entries in width_cases:
    source = matrix(GF(prime), 2, 3, entries)
    packed = source._packed_residues(width)
    assert exact_list(packed) == legacy_pack(source, width)
    assert source.parent()._from_packed_residues(packed, width) == source
    assert legacy_unpack(source.parent(), packed, width) == source

# Entry boundaries are little-endian and do not bleed into adjacent entries.
aligned = matrix(GF(65521), 1, 2, [0x1234, 0xABCD])._packed_residues(2)
assert exact_list(aligned) == [0x34, 0x12, 0xCD, 0xAB]

# Packed input is untrusted: it is normalized modulo p after bulk decoding.
normalizing_space = MatrixSpace(GF(97), 1, 1)
normalizing_payload = matrix(GF(257), 1, 1, [255])._packed_residues(2)
assert normalizing_space._from_packed_residues(normalizing_payload, 2)[0, 0] == 61

# Trusted internal transfers retain the canonical BigUint64Array itself.
canonical = runtime.uint64_buffer([1, 2, 3, 4, 5, 6])
canonical_matrix = MatrixSpace(GF(97), 2, 3)._from_canonical_uint64_residues(
    canonical
)
assert runtime.strict_equal(canonical_matrix._prime_residues(), canonical)

# Empty rectangular shapes preserve both serialization and display semantics.
empty_rows = matrix(GF(97), 0, 3, [])
empty_columns = matrix(GF(97), 3, 0, [])
assert empty_rows.str() == "[]"
assert empty_columns.str() == "[]\n[]\n[]"
for empty in [empty_rows, empty_columns]:
    packed = empty._packed_residues(8)
    assert len(packed) == 0
    assert empty.parent()._from_packed_residues(packed, 8) == empty

# Width, length, and overflow failures are checked at the public boundary.
small = matrix(GF(65521), 1, 1, [256])
expect_failure(lambda: small._packed_residues(3), "unsupported packed residue width")
expect_failure(
    lambda: small.parent()._from_packed_residues(small._packed_residues(2), 3),
    "unsupported packed residue width",
)
expect_failure(lambda: small._packed_residues(1), "does not fit")
rectangular = matrix(GF(97), 2, 3, range(6))
short_payload = matrix(GF(97), 1, 5, range(5))._packed_residues(1)
long_payload = matrix(GF(97), 1, 7, range(7))._packed_residues(1)
expect_failure(
    lambda: rectangular.parent()._from_packed_residues(short_payload, 1),
    "does not match dimensions",
)
expect_failure(
    lambda: rectangular.parent()._from_packed_residues(long_payload, 1),
    "does not match dimensions",
)

# The bulk formatter is exactly the former formatter when no subdivision is
# present. Subdivided display deliberately retains the semantic Python path.
display = matrix(GF(65521), 2, 3, [1, 22, 333, 4444, 5, 66])
expected = "[   1   22  333]\n[4444    5   66]"
assert display.str() == expected
assert display.str() == legacy_format(display), (
    display.str(),
    legacy_format(display),
)
display.subdivide(1, 1)
assert display.str() == "[   1|  22  333]\n[--------------]\n[4444|   5   66]"

# Representative 500x500 ratchets protect the structural boundaries from
# returning to Python-level per-entry loops. The relative gates compare the
# exact previous implementation in the same process; absolute gates catch a
# uniformly slow host or accidental extra conversion.
set_random_seed(20260811)
large = random_matrix(GF(65521), 500, 500)
large_payload = large._packed_residues(4)
space = large.parent()
medium = random_matrix(GF(65521), 250, 500)
medium_payload = medium._packed_residues(4)
medium_space = medium.parent()

large._packed_residues(4)
space._from_packed_residues(large_payload, 4)
large.str()
medium._packed_residues(4)
medium_space._from_packed_residues(medium_payload, 4)
medium.str()

pack_seconds = minimum_time(lambda: large._packed_residues(4))
unpack_seconds = minimum_time(
    lambda: space._from_packed_residues(large_payload, 4)
)
format_seconds = minimum_time(lambda: large.str())
legacy_pack_seconds = minimum_time(lambda: legacy_pack(large, 4), 2)
legacy_unpack_seconds = minimum_time(
    lambda: legacy_unpack(space, large_payload, 4), 2
)
legacy_format_seconds = minimum_time(lambda: legacy_format(large), 2)
medium_pack_seconds = minimum_time(lambda: medium._packed_residues(4))
medium_unpack_seconds = minimum_time(
    lambda: medium_space._from_packed_residues(medium_payload, 4)
)
medium_format_seconds = minimum_time(lambda: medium.str())

assert pack_seconds < 0.25, pack_seconds
assert unpack_seconds < 0.25, unpack_seconds
assert format_seconds < 0.25, format_seconds
assert pack_seconds < legacy_pack_seconds * 0.65, (
    pack_seconds,
    legacy_pack_seconds,
)
assert unpack_seconds < legacy_unpack_seconds * 0.75, (
    unpack_seconds,
    legacy_unpack_seconds,
)
assert format_seconds < legacy_format_seconds * 0.65, (
    format_seconds,
    legacy_format_seconds,
)
assert pack_seconds < medium_pack_seconds * 3.5, (
    medium_pack_seconds,
    pack_seconds,
)
# Unpacking allocates and normalizes a fresh BigUint64Array. At these very
# short timings, V8 allocation/GC scheduling makes the ratio noisier than the
# pack and format paths. The absolute and legacy-relative gates above remain
# the decisive regression guards; this bound catches genuinely superlinear
# scaling without failing on a single sub-millisecond allocation sample.
assert unpack_seconds < medium_unpack_seconds * 5.0, (
    medium_unpack_seconds,
    unpack_seconds,
)
assert format_seconds < medium_format_seconds * 3.5, (
    medium_format_seconds,
    format_seconds,
)

print(
    "dense-prime-structural-ok",
    round(pack_seconds * 1000, 3),
    round(unpack_seconds * 1000, 3),
    round(format_seconds * 1000, 3),
    round(legacy_pack_seconds * 1000, 3),
    round(legacy_unpack_seconds * 1000, 3),
    round(legacy_format_seconds * 1000, 3),
)
`;

const temporary = mkdtempSync(join(tmpdir(), "sagejs-dense-prime-structural-"));
try {
  const script = join(temporary, "structural.py");
  writeFileSync(script, source);
  const result = spawnSync(process.execPath, [join(root, "bin", "sagejs"), script], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      SAGEJS_FORBID_MATRIX_NAPI: "1",
      SAGEJS_NATIVE_CACHE_DIR: join(temporary, "native-cache"),
    },
    timeout: 60_000,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /dense-prime-structural-ok/);
  console.log(result.stdout.trim());
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
