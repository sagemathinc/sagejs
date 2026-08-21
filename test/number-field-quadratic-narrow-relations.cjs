"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const root = join(__dirname, "..");
const fixture = JSON.parse(
  readFileSync(
    join(
      __dirname,
      "fixtures",
      "number-field-quadratic-narrow-relations.json",
    ),
    "utf8",
  ),
);

function runSage(source) {
  const executable =
    process.platform === "win32"
      ? process.execPath
      : join(root, "bin", "sagejs");
  const arguments_ =
    process.platform === "win32"
      ? [join(root, "bin", "sagejs-source.cjs"), "--python", "-"]
      : ["--python", "-"];
  const result = spawnSync(executable, arguments_, {
    cwd: root,
    encoding: "utf8",
    input: source,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

test("narrow quadratic oracle fixture records independent exact CAS results", () => {
  assert.equal(
    fixture.schema,
    "sagejs.number-fields/quadratic-narrow-relations-oracle-v1",
  );
  assert.match(fixture.oracles.sage_pari.command, /narrow_class_group/);
  assert.match(fixture.oracles.magma.command, /NarrowClassGroup/);
  assert.deepEqual(
    fixture.cases.find((entry) => entry.discriminant === 60)
      .narrow_invariants,
    [2, 2],
  );
  assert.deepEqual(
    fixture.cases.find((entry) => entry.discriminant === 321)
      .narrow_invariants,
    [6],
  );
});

test("augmented Smith presentation preserves narrow extension data", () => {
  const output = runSage(String.raw`
from sagejs.number_fields.class_group_matrix import extract_relation_presentation

# Both examples have ordinary quotient C2 and narrow order four.  The parity
# on the authenticated principal relation is what distinguishes the extension.
c4 = extract_relation_presentation(((2, 1), (0, 2)), 2, require_full_rank=True)
c2x2 = extract_relation_presentation(((2, 0), (0, 2)), 2, require_full_rank=True)
unit_collapse = extract_relation_presentation(
    ((2, 1), (0, 2), (0, 1)), 2, require_full_rank=True
)
assert c4.invariants == (4,)
assert c2x2.invariants == (2, 2)
assert unit_collapse.invariants == (2,)
assert c4.verify() and c2x2.verify() and unit_collapse.verify()
print("narrow-extension-snf-ok")
`);
  assert.equal(output, "narrow-extension-snf-ok");
});

test("bounded relation adapter does not enumerate classes during construction", () => {
  const output = runSage(String.raw`
from sagejs.number_fields.class_group_matrix import extract_relation_presentation
from sagejs.number_fields.quadratic_narrow_relations import (
    NarrowRelationResourceLimit,
    narrow_class_group_from_result,
)

class DummyUnitGroup:
    complete = True

class DummyResult:
    field = None
    _unit = None
    proof_status = "exact-unconditional"
    complete = True
    conditional_factor_base = ()
    conditional_relation_records = ()
    conditional_presentation_evidence = None
    saturation_record = None
    def __init__(self, field, unit):
        self.field = field
        self._unit = unit
    def units(self):
        return (self._unit,)
    def unit_group(self):
        return DummyUnitGroup()

x = polygen(QQ, "x")
quadratic_field = NumberField(x*x - 3, "a")
dummy_result = DummyResult(quadratic_field, quadratic_field.gen() + 2)
dummy_result.conditional_presentation_evidence = extract_relation_presentation(
    (), 0, require_full_rank=True
)
group = narrow_class_group_from_result(
    dummy_result, max_list_size=1
)
assert group.invariants() == (2,)
assert group.order() == 2
assert group.certificate().presentation.verify()
try:
    group.list()
    raise AssertionError("the explicit list cap was ignored")
except NarrowRelationResourceLimit:
    pass

plan = quadratic_field.quadratic_class_group_plan("buchmann-hecke", narrow=True)
assert plan.backend == "buchmann-hecke-narrow"
assert not plan.materializes_all_reduced_forms
print("narrow-relation-adapter-ok")
`);
  assert.equal(output, "narrow-relation-adapter-ok");
});
