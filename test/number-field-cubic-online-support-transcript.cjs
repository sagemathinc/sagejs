// sagejs-test-tier: specialized
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { resolve } = require("node:path");
const test = require("node:test");

const root = resolve(__dirname, "..");

function runPython(source, timeout = 240_000) {
  const result = spawnSync(
    process.execPath,
    [resolve(root, "bin/sagejs"), "--python"],
    {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        SAGEJS_HYPERELLIPTIC_AUTO_RECEIPT_POLICY: "off",
        SAGEJS_NATIVE_REQUIRED: "0",
      },
      input: source,
      timeout,
    },
  );
  assert.equal(
    result.status,
    0,
    `${result.error?.message || ""}\n${result.stderr}\n${result.stdout}`,
  );
}

test("online HNF records the exact prefix support transcript", {
  timeout: 300_000,
}, () => {
  runPython(String.raw`
import hashlib
import json

from sagejs.ffi.flint import fmpz_matrix
from sagejs.number_fields.cubic_class_number_native import (
    _cubic_online_relation_lattice_update,
)
from sagejs.number_fields.cubic_class_number_native_runtime import (
    certified_complex_cubic_class_number,
)
from sagejs.number_fields.class_group_matrix import exact_relation_hnf_basis
import sagejs.number_fields.cubic_class_number_native_runtime as cubic_runtime


# This schedule covers a zero row, a rank-deficient non-diagonal pivot, a
# dependent multiple, two independent rank increases, full-rank containment,
# and same-rank index reductions.  Prefix-HNF support deliberately retains an
# earlier row even when a later row would permit a smaller final generating
# subset: the bit means precisely "changed the prefix lattice at this point".
rows = (
    (0, 0, 0),
    (0, 2, 0),
    (0, 4, 0),
    (1, 0, 0),
    (0, 0, 3),
    (1, 2, 3),
    (0, 1, 0),
    (0, 0, 1),
)
basis = fmpz_matrix(3, 3)
source = fmpz_matrix(4, 3)
reduced = fmpz_matrix(4, 3)
support = fmpz_matrix(len(rows), 1)
coordinates = fmpz_matrix(1, 3)
relations = fmpz_matrix(len(rows), 3)
try:
    for row_index, row in enumerate(rows):
        for column_index, value in enumerate(row):
            relations[row_index, column_index] = value
    statuses = []
    for row_index in range(len(rows)):
        statuses.append(
            _cubic_online_relation_lattice_update(
                basis,
                source,
                reduced,
                support,
                coordinates,
                relations,
                row_index,
                3,
            )
        )
    assert tuple(support[index, 0] for index in range(len(rows))) == (
        0,
        1,
        0,
        1,
        1,
        0,
        1,
        1,
    )
    assert tuple(statuses) == (1, 1, 1, 1, 1, 1, 1, 2)
    assert tuple(
        tuple(basis[row, column] for column in range(3)) for row in range(3)
    ) == ((1, 0, 0), (0, 1, 0), (0, 0, 1))
finally:
    relations.close()
    coordinates.close()
    support.close()
    reduced.close()
    source.close()
    basis.close()


# LMFDB 3.1.83062751.1 is the first measured wide-factor-base frontier.  The
# online support history must publish the byte-identical compact transcript
# produced by the predecessor's independent second pass, then survive the
# ordinary exact ideal/HNF/SNF and analytic replay.
R = PolynomialRing(QQ, "x")
x = R.gen()
coefficients = (-22763, -146, -1, 1)
polynomial = R(0)
for exponent, coefficient in enumerate(coefficients):
    polynomial += coefficient * x**exponent
field = NumberField(polynomial, "a")
saved_efforts = cubic_runtime._CUBIC_RELATION_EFFORTS
try:
    cubic_runtime._CUBIC_RELATION_EFFORTS = (5,)
    receipt = certified_complex_cubic_class_number(field)
finally:
    cubic_runtime._CUBIC_RELATION_EFFORTS = saved_efforts
assert receipt is not None
assert receipt.class_number == 15
assert receipt.invariants == (15,)
assert receipt.relation_effort == 5
assert receipt.factor_base_size == 36
assert receipt.relation_count == 42
assert receipt.verify_conditional_grh()
transcript = receipt._ensure_relation_transcript()
encoded = json.dumps(transcript, separators=(",", ":"))
assert len(encoded) == 4405
assert hashlib.sha256(encoded.encode()).hexdigest() == (
    "b1282d038400684fb1c3116fe21e9ecddb7d20513b94a490ed6fd662c123d5e8"
)
relation_rows = transcript[1]
previous_basis = ()
support = []
for row_count in range(1, len(relation_rows) + 1):
    basis = exact_relation_hnf_basis(relation_rows[:row_count], 36)
    if basis != previous_basis:
        support.append(row_count - 1)
    previous_basis = basis
assert support == list(range(38))
assert len(relation_rows) - len(support) == 4


# The exhaustive effort-1 path has already found a small unit before relation
# collection.  It intentionally retains every principal row for later unit
# replay, so the square online HNF must not replace its tall relation HNF.
saved_efforts = cubic_runtime._CUBIC_RELATION_EFFORTS
try:
    cubic_runtime._CUBIC_RELATION_EFFORTS = (1,)
    # LMFDB 3.1.588.1 deterministically takes the small-unit branch.
    small_unit_field = NumberField(x**3 - x**2 + 5 * x + 1, "small_unit")
    small_unit_receipt = certified_complex_cubic_class_number(small_unit_field)
finally:
    cubic_runtime._CUBIC_RELATION_EFFORTS = saved_efforts
assert small_unit_receipt is not None
assert small_unit_receipt.class_number == 3
assert small_unit_receipt.invariants == (3,)
assert small_unit_receipt.relation_effort == 1
assert small_unit_receipt.verify_conditional_grh()
`);
});
