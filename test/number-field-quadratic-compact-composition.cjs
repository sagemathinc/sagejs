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
      "number-field-quadratic-compact-composition.json",
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

test("compact quadratic fixture records independent exact CAS oracles", () => {
  assert.equal(
    fixture.schema,
    "sagejs.number-fields/quadratic-compact-composition-oracle-v1",
  );
  assert.match(fixture.oracles.sage_pari.composition_command, /is_equivalent/);
  assert.match(fixture.oracles.magma.command, /NarrowClassGroup/);
  assert.ok(
    fixture.composition_cases.every(
      (entry) => entry.sage_properly_equivalent,
    ),
  );
  assert.ok(BigInt(fixture.bigint_nudupl.discriminant) > 2n ** 128n);
});

test("NUCOMP and NUDUPL agree with the exact lattice oracle", () => {
  const cases = JSON.stringify(fixture.composition_cases);
  const output = runSage(String.raw`
from sagejs.number_fields.quadratic_class_units import (
    QuadraticForm,
    compose_quadratic_forms,
    compose_quadratic_forms_lattice,
)

for expected in ${cases}:
    left = QuadraticForm(*expected["left"])
    right = QuadraticForm(*expected["right"])
    result, trace = compose_quadratic_forms(left, right, with_trace=True)
    lattice = compose_quadratic_forms_lattice(
        left, right, expected["discriminant"], 1000000
    )
    assert result == lattice
    assert result.coefficients() == tuple(expected["canonical_result"])
    assert trace.squaring == (expected["kind"] == "nudupl")
    assert trace.partial_euclid_steps == expected["partial_euclid_steps"]
    assert trace.terminal_remainder == expected["terminal_remainder"]
    assert trace.classical_leading_product == expected["classical_leading_product"]
    assert trace.raw_leading == expected["raw_leading"]
    assert trace.raw_leading < trace.classical_leading_product
    assert trace.verify_bound()
print("compact-composition-ok")
`);
  assert.equal(output, "compact-composition-ok");
});

test("NUDUPL uses exact bigint storage beyond signed machine words", () => {
  const expected = JSON.stringify(fixture.bigint_nudupl);
  const output = runSage(String.raw`
from sagejs.number_fields.quadratic_class_units import QuadraticForm, _nudupl_raw

expected = ${expected}
form = QuadraticForm(*[int(value) for value in expected["form"]])
raw, trace = _nudupl_raw(form, int(expected["discriminant"]))
assert raw.coefficients() == tuple(int(value) for value in expected["raw_result"])
assert raw.discriminant() == int(expected["discriminant"])
assert raw.is_primitive()
assert trace.cutoff == int(expected["cutoff"])
assert trace.partial_euclid_steps == expected["partial_euclid_steps"]
assert trace.terminal_remainder == expected["terminal_remainder"]
assert trace.exact_integer_storage
print("compact-bigint-ok")
`);
  assert.equal(output, "compact-bigint-ok");
});

test("invariant factors use streamed forms and bounded BSGS", () => {
  const cases = JSON.stringify(fixture.class_groups);
  const output = runSage(String.raw`
from sagejs.number_fields.quadratic_class_units import (
    real_quadratic_class_group,
    real_quadratic_class_invariants,
)

for expected in ${cases}:
    D = expected["discriminant"]
    for narrow, key in ((False, "ordinary"), (True, "narrow")):
        structure = real_quadratic_class_invariants(D, narrow=narrow)
        assert structure.invariants() == tuple(expected[key])
        assert not structure.materializes_all_classes
        assert not structure.certificate.materializes_all_classes
        assert structure.certificate.largest_bsgs_table <= 4
        assert structure.certificate.forms_scanned <= structure.order()

# C2 x C2 genuinely exercises subgroup membership.  Construction, invariant
# factors, generators, and certificate replay leave the full class table lazy.
group = real_quadratic_class_group(60, narrow=True)
assert group.invariants() == (2, 2)
assert group.order() == 4
assert group._representatives is None
assert not group.materializes_all_classes
assert not group.plan.materializes_all_reduced_forms
assert group.verify()
assert group._representatives is None
assert len(group.list()) == 4
assert group._representatives is not None

try:
    real_quadratic_class_invariants(60, narrow=True, max_bsgs_table=1)
    raise AssertionError("the explicit BSGS cap was ignored")
except ValueError as error:
    assert "max_bsgs_table" in str(error)
print("streaming-invariants-ok")
`);
  assert.equal(output, "streaming-invariants-ok");
});
