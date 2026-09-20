#!/usr/bin/env node
// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");
const directory = mkdtempSync(join(tmpdir(), "sagejs-compact-presentation-"));

try {
  const script = join(directory, "check.py");
  writeFileSync(
    script,
    String.raw`
import copy

from sagejs.number_fields.class_group_matrix import RelationMatrixError, SparseRelationRow
from sagejs.number_fields.compact_relation_presentation import (
    CompactRelationPresentation,
)


def rejected(payload):
    try:
        CompactRelationPresentation.from_dict(payload)
    except (ArithmeticError, RelationMatrixError):
        return
    raise AssertionError("counterfeit compact presentation was accepted")


cyclic = CompactRelationPresentation(
    1,
    (SparseRelationRow(1, (12,)), SparseRelationRow(1, (18,))),
    (6,),
    ((1,),),
    ((1,),),
    (((0,), 12), ((1,), 18)),
)
assert cyclic.verify()
assert cyclic.rank == 1 and cyclic.free_rank == 0 and cyclic.order == 6
assert cyclic.class_coordinates((17,)) == (5,)
assert cyclic.lift_class_coordinates((8,)) == (2,)
assert cyclic.reduce_ambient((17,)) == (5,)
cyclic_payload = cyclic.to_dict()
assert CompactRelationPresentation.from_dict(cyclic_payload).to_dict() == cyclic_payload
assert [
    minor["absolute_determinant"]
    for minor in cyclic_payload["index_certificate"]["minors"]
] == ["12", "18"]
for left in range(-4, 5):
    for right in range(-4, 5):
        assert cyclic.class_coordinates((12 * left + 18 * right,)) == (0,)

for unsupported in (
    lambda: cyclic.smith_coordinates((1,)),
    lambda: cyclic.relation_combination(0),
    lambda: cyclic.dependency_combination(0),
):
    try:
        unsupported()
    except RelationMatrixError:
        pass
    else:
        raise AssertionError("compact presentation manufactured a dense witness")

noncyclic = CompactRelationPresentation(
    2,
    (
        SparseRelationRow(2, (2, 0)),
        SparseRelationRow(2, (0, 2)),
        SparseRelationRow(2, (4, 0)),
    ),
    (2, 2),
    ((1, 0), (0, 1)),
    ((1, 0), (0, 1)),
    (((0, 1), 4),),
)
assert noncyclic.verify()
assert noncyclic.class_coordinates((7, -3)) == (1, 1)
assert noncyclic.class_coordinates(noncyclic.lift_class_coordinates((5, 6))) == (
    1,
    0,
)
assert CompactRelationPresentation.from_dict(noncyclic.to_dict()).verify()

# Every component of the compact proof is independently replayed.
changed_relation = copy.deepcopy(cyclic_payload)
changed_relation["rows"][0]["entries"] = [[0, 5]]
rejected(changed_relation)

changed_map = copy.deepcopy(cyclic_payload)
changed_map["class_map_rows"][0][0] = 2
rejected(changed_map)

changed_generator = copy.deepcopy(cyclic_payload)
changed_generator["generator_transforms"][0][0] = 2
rejected(changed_generator)

changed_determinant = copy.deepcopy(cyclic_payload)
changed_determinant["index_certificate"]["minors"][0][
    "absolute_determinant"
] = "24"
rejected(changed_determinant)

noncanonical_determinant = copy.deepcopy(cyclic_payload)
noncanonical_determinant["index_certificate"]["minors"][0][
    "absolute_determinant"
] = "06"
rejected(noncanonical_determinant)

unknown_field = copy.deepcopy(cyclic_payload)
unknown_field["trusted"] = True
rejected(unknown_field)

# A genuine selected minor can still be an insufficient index certificate.
# Rows 1 and 2 below have determinant 8, but the asserted group has order 4.
insufficient_gcd = copy.deepcopy(noncyclic.to_dict())
insufficient_gcd["index_certificate"]["minors"][0] = {
    "row_indices": [1, 2],
    "absolute_determinant": "8",
}
rejected(insufficient_gcd)

# Coefficients, invariant factors, determinants, and coordinate arithmetic are
# exact beyond machine-word and JavaScript-safe integer ranges.
huge = 2**100 + 267
large = CompactRelationPresentation(
    1,
    (SparseRelationRow(1, (huge,)),),
    (huge,),
    ((1,),),
    ((1,),),
    (((0,), huge),),
)
assert large.verify()
assert large.order == huge
assert large.class_coordinates((huge * huge + 41,)) == (41,)
large_payload = large.to_dict()
assert large_payload["index_certificate"]["minors"][0][
    "absolute_determinant"
] == str(huge)
assert CompactRelationPresentation.from_dict(large_payload).verify()

print("compact relation presentation tests passed")
`,
  );
  const result = spawnSync(
    process.execPath,
    [join(root, "bin", "sagejs"), "--python", script],
    { cwd: root, encoding: "utf8", timeout: 60_000 },
  );
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /compact relation presentation tests passed/);
} finally {
  rmSync(directory, { recursive: true, force: true });
}

console.log("compact relation presentation integration test passed");
