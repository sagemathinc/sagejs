#!/usr/bin/env node
// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");
const helperPath = join(
  root,
  "src/lib/sagejs/polynomial_algorithms/exact_coefficient_bytes_contract.py",
);
const helperSource = readFileSync(helperPath, "utf8");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    timeout: 180_000,
    ...options,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

function runFile(command, args, source, suffix) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-exact-byte-region-"));
  const filename = join(directory, `witness.${suffix}`);
  try {
    writeFileSync(filename, source);
    return run(command, [...args, filename]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const commonWitness = String.raw`
def expect_invalid(source, rational, offset=0, length=None):
    sentinel = [(123, 456)]
    answer = sentinel
    try:
        answer = decode_exact_polynomial_region(source, rational, offset, length)
    except (TypeError, ValueError, OverflowError):
        pass
    else:
        raise AssertionError("malformed exact polynomial region was accepted")
    assert answer is sentinel


zero_z = encode_integer_polynomial_region([])
assert zero_z == encode_integer_polynomial_region([0, 0, 0])
assert len(zero_z) == 16
assert decode_exact_polynomial_region(zero_z, False) == ()

integer_values = [0, 1, -1, 255, 256, -(2**8192) + 17, 2**16384 + 3]
integer_region = encode_integer_polynomial_region(integer_values + [0, 0])
assert decode_exact_polynomial_region(integer_region, False) == tuple(integer_values)
wrapped_integer = b"prefix" + integer_region + b"suffix"
assert decode_exact_polynomial_region(
    wrapped_integer, False, 6, len(integer_region)
) == tuple(integer_values)
expect_invalid(wrapped_integer, False)
expect_invalid(wrapped_integer, False, 6, len(integer_region) + 1)

rational_input = [(2, -4), (0, 7), (6, 8), (-(2**8192), 17), (0, -99)]
rational_expected = ((-1, 2), (0, 1), (3, 4), (-(2**8192), 17))
rational_region = encode_rational_polynomial_region(rational_input)
assert decode_exact_polynomial_region(rational_region, True) == rational_expected
wrapped_rational = b"xx" + rational_region + b"yy"
assert decode_exact_polynomial_region(
    wrapped_rational, True, 2, len(rational_region)
) == rational_expected
assert canonical_rational_parts(0, -17) == (0, 1)
assert canonical_rational_parts(12, -18) == (-2, 3)

try:
    canonical_rational_parts(1, 0)
except ZeroDivisionError:
    pass
else:
    raise AssertionError("zero rational denominator was accepted")

# Envelope validation: magic, version, reserved bytes, truncation, range, and
# a count which does not fit FLINT's signed length.
for position, replacement in [(0, 0), (4, 2), (5, 1)]:
    damaged = bytearray(integer_region)
    damaged[position] = replacement
    expect_invalid(damaged, False)
expect_invalid(integer_region[:15], False)
expect_invalid(integer_region, False, -1, len(integer_region))
expect_invalid(integer_region, False, 0, len(integer_region) + 1)
expect_invalid(integer_region, False, True, len(integer_region))
huge_count = bytearray(zero_z)
for byte in range(8):
    huge_count[8 + byte] = 255
expect_invalid(huge_count, False)
try:
    decode_exact_polynomial_region(huge_count, False, 0, None, 2**31 - 1)
except OverflowError:
    pass
else:
    raise AssertionError("target coefficient-count limit was not enforced")

# Signed magnitudes are little-endian, minimal, and have no negative zero.
negative_zero = bytearray(zero_z)
negative_zero[8] = 1
negative_zero.extend([0, 0, 0, 128])
expect_invalid(negative_zero, False)

nonminimal = bytearray(zero_z)
nonminimal[8] = 1
nonminimal.extend([2, 0, 0, 0, 1, 0])
expect_invalid(nonminimal, False)

truncated = bytearray(zero_z)
truncated[8] = 1
truncated.extend([2, 0, 0, 0, 1])
expect_invalid(truncated, False)

trailing_zero = encode_integer_polynomial_region([1])
trailing_zero = bytearray(trailing_zero)
trailing_zero[8] = 2
trailing_zero.extend([0, 0, 0, 0])
expect_invalid(trailing_zero, False)

# Serialized rational input is validated rather than silently normalized.
def raw_rational(top, bottom):
    output = bytearray(SJPQ_MAGIC)
    output.extend([1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0])
    _encode_signed_magnitude(output, top)
    _encode_signed_magnitude(output, bottom)
    return output

for invalid_pair in [(1, 0), (1, -2), (2, 4), (0, 2)]:
    expect_invalid(raw_rational(invalid_pair[0], invalid_pair[1]), True)

print("exact-byte-region-common-ok")
`;

const python = process.env.PYTHON ||
  (process.platform === "win32" ? "python" : "python3");
assert.equal(
  run(python, ["-I", "-c", `${helperSource}\n${commonWitness}`]),
  "exact-byte-region-common-ok",
);

const sagejsWitness = String.raw`
${commonWitness}

# Existing Node resource egress already makes the required native-to-host copy.
# It must remain byte-for-byte identical to the storage-neutral contract.
RZ = PolynomialRing(ZZ, "x")
z_values = [0, -1, 2**137 + 3, -(2**521) + 5]
z = RZ(z_values)
assert list(z._packed_exact_polynomial()) == list(
    encode_integer_polynomial_region(z_values)
)

RQ = PolynomialRing(QQ, "y")
q_values = [QQ(-2) / 4, QQ(0), QQ(5) / 7, QQ(-(2**257)) / 19]
q_parts = [(value.numerator(), value.denominator()) for value in q_values]
q = RQ(q_values)
assert list(q._packed_exact_polynomial()) == list(
    encode_rational_polynomial_region(q_parts)
)

# The existing generated ingress resource performs one checked host-to-native
# copy and remains reusable.  The polynomial-from-region primitive deliberately
# does not exist in this preparation lane.
from sagejs.ffi.flint import FlintByteRegion
region = FlintByteRegion.from_bytes(z._packed_exact_polynomial())
try:
    assert list(region.copy_bytes()) == list(z._packed_exact_polynomial())
    assert list(region.copy_bytes()) == list(z._packed_exact_polynomial())
finally:
    region.close()

print("exact-byte-region-sagejs-ok")
`;

const sagejs = process.env.SAGEJS_TEST_BINARY || join(root, "bin", "sagejs");
assert.equal(
  runFile(process.execPath, [sagejs, "--python"], `${helperSource}\n${sagejsWitness}`, "py"),
  "exact-byte-region-common-ok\nexact-byte-region-sagejs-ok",
);

// An external SageMath executable is optional in CI.  Set SAGEJS_SAGE_ORACLE
// to make this differential witness mandatory and record it in task receipts.
const sage = process.env.SAGEJS_SAGE_ORACLE;
if (sage) {
  assert.ok(existsSync(sage), `Sage oracle does not exist: ${sage}`);
  const sageWitness = String.raw`
${commonWitness}
from sage.all import PolynomialRing, QQ, ZZ
RZ = PolynomialRing(ZZ, "x")
values = [ZZ(0), ZZ(-1), ZZ(2)**137 + 3, -(ZZ(2)**521) + 5]
z = RZ(values)
assert list(decode_exact_polynomial_region(
    encode_integer_polynomial_region(values), False
)) == z.list()

RQ = PolynomialRing(QQ, "y")
values = [QQ(-2) / 4, QQ(0), QQ(5) / 7, QQ(-(ZZ(2)**257)) / 19]
parts = [(ZZ(value.numerator()), ZZ(value.denominator())) for value in values]
q = RQ(values)
decoded = decode_exact_polynomial_region(
    encode_rational_polynomial_region(parts), True
)
assert [QQ(top) / bottom for top, bottom in decoded] == q.list()
print("exact-byte-region-sage-oracle-ok")
`;
  assert.match(
    runFile(sage, ["--python"], `${helperSource}\n${sageWitness}`, "py"),
    /exact-byte-region-common-ok\nexact-byte-region-sage-oracle-ok$/,
  );
}

console.log("exact polynomial byte-region contract passed");
