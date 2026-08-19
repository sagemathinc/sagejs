"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");

const root = join(__dirname, "..");
const combineSource = process.env.SAGEJS_GLOBAL_ARITHMETIC_COMBINED === "1";
const sagejs = combineSource
  ? join(root, "build", "sea", process.platform === "win32" ? "sagejs.exe" : "sagejs")
  : join(root, "bin", "sagejs");

function combinedSource(source) {
  const directory = join(root, "src", "lib", "sagejs", "number_fields");
  const embeddings = readFileSync(join(directory, "embeddings.py"), "utf8");
  const units = readFileSync(join(directory, "units.py"), "utf8")
    .replace("from __future__ import annotations\n", "")
    .replace(/from sagejs\.number_fields\.embeddings import \([\s\S]*?\)\n\n/, "");
  const classGroups = readFileSync(join(directory, "class_groups.py"), "utf8")
    .replace("from __future__ import annotations\n", "")
    .replace(/from sagejs\.number_fields\.embeddings import \([\s\S]*?\)\n/, "")
    .replace("from sagejs.number_fields.units import UnitSubgroupResult\n", "");
  const body = source
    .replace(/from sagejs\.number_fields\.embeddings import[^\n]*\n/, "")
    .replace(/from sagejs\.number_fields\.units import[^\n]*\n/, "")
    .replace(/from sagejs\.number_fields\.class_groups import[^\n]*\n/, "");
  return `${embeddings}\n${units}\n${classGroups}\n${body}`;
}

function run(source) {
  const directory = combineSource
    ? mkdtempSync(join(tmpdir(), "sagejs-global-arithmetic-"))
    : null;
  try {
    const filename = directory === null ? "-" : join(directory, "test.py");
    if (directory !== null) writeFileSync(filename, combinedSource(source));
    const result = spawnSync(sagejs, ["--python", filename], {
      cwd: root,
      encoding: "utf8",
      input: directory === null ? source : undefined,
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return result.stdout.trim();
  } finally {
    if (directory !== null) rmSync(directory, { recursive: true, force: true });
  }
}

test("global arithmetic internals preserve exact and incomplete proof states", () => {
  const output = run(String.raw`
from sagejs.number_fields.embeddings import archimedean_data, exact_signature
from sagejs.number_fields.units import RootsOfUnityResult, UnitCertificate, UnitCompletionCertificate, UnitSubgroupResult, bounded_unit_subgroup, real_quadratic_unit_group, roots_of_unity
from sagejs.number_fields.class_groups import analytic_class_number_formula_report, bounded_class_group

R = PolynomialRing(QQ, "x")
x = R.gen()

expected = [((2, 0), x**2 - 5), ((1, 1), x**3 - 2), ((0, 2), x**4 + 1)]
for signature, polynomial in expected:
    K = NumberField(polynomial, "a")
    data = archimedean_data(K)
    assert data.signature() == signature
    assert data.certificate.verify(K)
    assert len(data.embeddings) == signature[0] + signature[1]

K1 = NumberField(x - 1, "q")
units1 = bounded_unit_subgroup(K1)
classes1 = bounded_class_group(K1)
assert units1.complete and units1.unit_rank == 0
assert classes1.complete and classes1.order() == 1
report1 = analytic_class_number_formula_report(K1, 1.0, units1, classes1)
assert report1.inputs_complete and report1.compatible

K5 = NumberField(x**2 - 5, "a")
units5 = real_quadratic_unit_group(K5)
assert units5.complete and units5.unit_rank == 1
assert units5.verify_completion()
assert units5.certificates[0].verify(K5)
assert units5.certificates[0].norm == -1
assert 0.48 < units5.regulator().value < 0.49
assert roots_of_unity(K5).order == 2
forged_torsion = RootsOfUnityResult([K5(1), K5(-1)], K5(1), 2, True, "forged")
assert not forged_torsion.verify()
epsilon_squared = units5.generators[0]**2
forged_units = UnitSubgroupResult(
    K5,
    units5.torsion,
    [epsilon_squared],
    [UnitCertificate(epsilon_squared, 1, True, True)],
    1,
    True,
    "forged nonsaturated subgroup",
    units5.search_bound,
    units5.candidates_checked,
    UnitCompletionCertificate("real-quadratic-minimal-pell"),
)
assert not forged_units.verify_completion()

for polynomial, norm, lower, upper in [
    (x**2 - 2, -1, 0.88, 0.89),
    (x**2 - 3, 1, 1.31, 1.32),
    (x**2 - 13, -1, 1.19, 1.20),
]:
    units = real_quadratic_unit_group(NumberField(polynomial, "u"))
    assert units.complete and units.certificates[0].norm == norm
    assert lower < units.regulator().value < upper

K46 = NumberField(x**2 - 46, "u")
units46 = real_quadratic_unit_group(K46)
assert units46.complete and units46.search_bound == 7176
assert 10.79 < units46.regulator().value < 10.80

K8 = NumberField(x**2 - 2, "a")
try:
    real_quadratic_unit_group(K8, max_y=1)
    raise AssertionError("a bounded Pell search silently claimed completeness")
except ValueError:
    pass

Ki = NumberField(x**2 + 1, "i")
torsion = roots_of_unity(Ki)
assert torsion.complete and torsion.order == 4 and torsion.verify()
units_i = bounded_unit_subgroup(Ki)
assert units_i.complete and units_i.unit_rank == 0
assert units_i.verify_completion()
classes_i = bounded_class_group(Ki)
assert classes_i.complete and classes_i.order() == 1
assert classes_i.certificate.verify()
assert not classes_i.certificate.has_principal_element_witnesses
residue_i = 3.141592653589793 / 4
report = analytic_class_number_formula_report(Ki, residue_i, units_i, classes_i)
assert report.inputs_complete and report.compatible

K23 = NumberField(x**2 + x + 6, "a")
classes23 = bounded_class_group(K23)
assert exact_signature(K23) == (0, 1)
assert int(K23.discriminant()) == -23
assert classes23.complete and classes23.order() == 3

Kc = NumberField(x**3 - 2, "b")
bounded = bounded_unit_subgroup(Kc, coefficient_bound=0)
assert not bounded.complete and bounded.proof_status == "incomplete"
classes = bounded_class_group(Kc)
assert not classes.complete and classes.proof_status == "incomplete"
try:
    bounded.regulator()
    raise AssertionError("an incomplete search supplied a regulator")
except ValueError:
    pass

print("number-field-global-arithmetic-ok")
`);
  assert.equal(output, "number-field-global-arithmetic-ok");
});
