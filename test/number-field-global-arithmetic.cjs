"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");

const root = join(__dirname, "..");
const combineSource = process.env.SAGEJS_GLOBAL_ARITHMETIC_COMBINED === "1";
const sagejs =
  process.env.SAGEJS_TEST_EXECUTABLE ||
  (combineSource
    ? join(
        root,
        "build",
        "sea",
        process.platform === "win32" ? "sagejs.exe" : "sagejs",
      )
    : join(root, "bin", "sagejs"));

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
from sagejs.number_fields.units import RootsOfUnityResult, UnitCertificate, UnitCompletionCertificate, UnitSubgroupResult, bounded_unit_subgroup, certified_small_cubic_unit_group, real_quadratic_unit_group, roots_of_unity
import hashlib
import json
from sagejs.number_fields.class_groups import MinkowskiPrincipalFactorBaseCertificate, analytic_class_number_formula_report, bounded_class_group, bounded_cubic_minkowski_class_number_one, certified_small_cubic_class_group

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

K59 = NumberField(x**3 + 2*x + 1, "c")
fast59 = bounded_cubic_minkowski_class_number_one(K59)
assert fast59.complete and fast59.order() == 1
assert fast59.minkowski_bound == 2
assert fast59.proof_status == "exact-minkowski-principal-factor-base"
certificate59 = fast59.certificate.arithmetic_certificate
assert isinstance(certificate59, MinkowskiPrincipalFactorBaseCertificate)
assert certificate59.verify()
assert len(certificate59.factor_base) == len(certificate59.witnesses) == 1
assert certificate59.candidates_checked == (5,)
assert certificate59.principal_relation_witnesses[0].evaluate() == K59.gen() + 1
payload59 = certificate59.to_dict()
detached59 = MinkowskiPrincipalFactorBaseCertificate.from_dict(K59, payload59)
assert detached59.to_dict() == payload59 and detached59.verify()
def rehash(payload):
    body = dict(payload)
    del body["content_sha256"]
    payload["content_sha256"] = hashlib.sha256(
        json.dumps(body, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()

for mutation in (
    "bound",
    "witness",
    "coverage",
    "replay-cap",
    "oversized-integer",
    "malformed-string",
):
    forged = json.loads(json.dumps(payload59))
    if mutation == "bound":
        forged["plan"]["bound"]["bound"] += 1
    elif mutation == "witness":
        forged["witnesses"][0]["factors"][0]["exponent"] = 2
    elif mutation == "coverage":
        forged["factor_base"] = []
        forged["witnesses"] = []
        forged["candidates_checked"] = []
    elif mutation == "replay-cap":
        forged["plan"]["caps"]["max_bound"] = 4097
    elif mutation == "oversized-integer":
        forged["witnesses"][0]["factors"][0]["exponent"] = 1 << 16384
    else:
        forged["proof_status"] += "\ud800"
    if mutation != "malformed-string":
        rehash(forged)
    try:
        MinkowskiPrincipalFactorBaseCertificate.from_dict(K59, forged)
        raise AssertionError("mutated Minkowski evidence passed detached replay")
    except ValueError:
        pass
bounded59 = bounded_cubic_minkowski_class_number_one(
    K59, max_reduction_candidates=1
)
assert not bounded59.complete and bounded59.certificate is None

# A nontrivial class group must decline the bounded class-number-one proof
# quickly and fall through to the general engine; it is never mislabeled as
# principal because the small exact search was exhausted.
K1083 = NumberField(x**3 - x**2 - 6*x - 12, "d")
bounded1083 = bounded_cubic_minkowski_class_number_one(K1083)
assert not bounded1083.complete and bounded1083.certificate is None
assert "principal-generator search exhausted" in bounded1083.reason

Km = NumberField(x**3 - x - 1, "a")
units_m = certified_small_cubic_unit_group(Km)
classes_m = certified_small_cubic_class_group(Km)
assert units_m.complete and units_m.unit_rank == 1
assert units_m.verify_completion()
assert units_m.certificates[0].verify(Km)
assert 0.2811 < units_m.regulator().value < 0.2813
assert classes_m.complete and classes_m.order() == 1
assert classes_m.minkowski_bound == 2
assert classes_m.certificate.verify(max_elements=1)
assert classes_m.has_principal_element_witnesses
assert classes_m.certificate.principal_ideal_witnesses[0].verify(Km)
report_m = analytic_class_number_formula_report(
    Km, 0.368409320715826821, units_m, classes_m
)
assert report_m.inputs_complete and report_m.compatible

class ForgedCompletion:
    def verify(self, _result):
        return True

forged_completion_units = UnitSubgroupResult(
    Km,
    units_m.torsion,
    list(units_m.generators),
    list(units_m.certificates),
    units_m.unit_rank,
    True,
    "forged completion interface",
    units_m.search_bound,
    units_m.candidates_checked,
    ForgedCompletion(),
)
assert not forged_completion_units.verify_completion()

Kr = NumberField(x**3 - x**2 - 2*x + 1, "a")
units_r = certified_small_cubic_unit_group(Kr)
classes_r = bounded_class_group(Kr)
assert units_r.complete and units_r.unit_rank == 2
assert units_r.verify_completion()
assert all(certificate.verify(Kr) for certificate in units_r.certificates)
assert 0.5253 < units_r.regulator().value < 0.5256
assert classes_r.complete and classes_r.order() == 1
assert classes_r.certificate.verify(max_elements=1)
assert classes_r.has_principal_element_witnesses
report_r = analytic_class_number_formula_report(
    Kr, 0.300259818355755650, units_r, classes_r
)
assert report_r.inputs_complete and report_r.compatible
saved_arithmetic_certificate = classes_r.certificate.arithmetic_certificate
classes_r.certificate.arithmetic_certificate = ForgedCompletion()
assert not classes_r.certificate.verify(max_elements=1)
classes_r.certificate.arithmetic_certificate = saved_arithmetic_certificate
assert units_m.completion_certificate.coefficient_bounds == (2, 2, 2)
assert units_m.candidates_checked == 125
assert units_r.completion_certificate.coefficient_bounds == (2, 2, 2)
assert units_r.candidates_checked == 125
try:
    certified_small_cubic_unit_group(Km, candidate_cap=124)
    raise AssertionError("a truncated unit box silently claimed saturation")
except ValueError:
    pass
try:
    certified_small_cubic_class_group(Km, max_minkowski_bound=1)
    raise AssertionError("a truncated Minkowski search silently claimed completeness")
except ValueError:
    pass

forged_cubic_unit = units_m.generators[0]**2
forged_cubic_units = UnitSubgroupResult(
    Km,
    units_m.torsion,
    [forged_cubic_unit],
    [UnitCertificate(forged_cubic_unit, 1, True, True)],
    1,
    True,
    "forged index-two unit subgroup",
    units_m.search_bound,
    units_m.candidates_checked,
    units_m.completion_certificate,
)
assert not forged_cubic_units.verify_completion()

print("number-field-global-arithmetic-ok")
`);
  assert.equal(output, "number-field-global-arithmetic-ok");
});

test("bounded cubic class numbers replay every quotient p-line", () => {
  const output = run(String.raw`
import hashlib
import json
from sagejs.number_fields.cubic_class_number import CubicClassNumberResult, CubicMinkowskiClassNumberCertificate, authenticated_cubic_class_number_result_matches, bounded_cubic_minkowski_class_number

R = PolynomialRing(QQ, "x")
x = R.gen()

# A trivial relation quotient proves class number one without p-lines.
K59 = NumberField(x**3 + 2*x + 1, "c")
generic59 = bounded_cubic_minkowski_class_number(K59)
assert generic59.complete and generic59.order() == 1
assert generic59.certificate.obstructions == []
assert generic59.certificate.verify()

# The nontrivial quotient is proved exact without units, a regulator, or hR.
K1083 = NumberField(x**3 - x**2 - 6*x - 12, "d")
classes1083 = bounded_cubic_minkowski_class_number(K1083)
assert classes1083.complete and classes1083.order() == 3
assert classes1083.proof_status == "exact-unconditional"
assert classes1083.presentation.invariants == (3,)
assert classes1083.diagnostics["quotient_order"] == 3
assert classes1083.diagnostics["projective_lines"] == 1
assert classes1083.diagnostics["residue_states"] <= 500000
assert classes1083.diagnostics["relation_search"]["relation_attempts"] > 0
assert set(classes1083.diagnostics["phase_timings"]) == {
    "factor_base", "relations", "norm_obstructions", "certificate_encoding", "total"
}
certificate1083 = classes1083.certificate
assert isinstance(certificate1083, CubicMinkowskiClassNumberCertificate)
assert len(certificate1083.obstructions) == 1
assert certificate1083.obstructions[0]["modulus"] == 19
assert certificate1083.verify()
try:
    certificate1083.verify(cancelled=lambda: True)
    raise AssertionError("detached cubic proof replay ignored cancellation")
except RuntimeError as error:
    assert str(error) == "class/unit computation cancelled"
caps_copy1083 = certificate1083.caps
caps_copy1083["max_quotient_order"] = 1
assert certificate1083.caps["max_quotient_order"] == 4096
payload1083 = certificate1083.to_dict()
detached1083 = CubicMinkowskiClassNumberCertificate.from_dict(K1083, payload1083)
assert detached1083.to_dict() == payload1083 and detached1083.class_number == 3
detached_result1083 = CubicClassNumberResult(
    K1083,
    True,
    detached1083.source,
    classes1083.minkowski_bound,
    certificate=detached1083,
    factor_base=classes1083.factor_base,
    relation_records=classes1083.relation_records,
    presentation=classes1083.presentation,
    diagnostics=classes1083.diagnostics,
)
assert not authenticated_cubic_class_number_result_matches(
    detached_result1083, K1083
)

def rehash(payload):
    body = dict(payload)
    del body["content_sha256"]
    payload["content_sha256"] = hashlib.sha256(
        json.dumps(body, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()

for mutation in ("norm-form", "coverage", "presentation", "replay-cap"):
    forged = json.loads(json.dumps(payload1083))
    if mutation == "norm-form":
        forged["obstructions"][0]["norm_form_coefficients"][0] += 1
    elif mutation == "coverage":
        forged["obstructions"] = []
    elif mutation == "presentation":
        forged["presentation"]["smith"][0][0] += 1
    else:
        forged["caps"]["max_residue_states"] = 20000001
    rehash(forged)
    try:
        CubicMinkowskiClassNumberCertificate.from_dict(K1083, forged)
        raise AssertionError("mutated cubic class-number evidence passed replay")
    except ValueError:
        pass

quotient_capped1083 = bounded_cubic_minkowski_class_number(
    K1083, max_quotient_order=2
)
assert not quotient_capped1083.complete
assert quotient_capped1083.presentation.order == 3
assert "quotient order" in quotient_capped1083.reason

cancel_polls = [0]
def cancelled1083():
    cancel_polls[0] += 1
    return True
try:
    bounded_cubic_minkowski_class_number(K1083, cancelled=cancelled1083)
    raise AssertionError("cubic class-number cancellation was ignored")
except RuntimeError as error:
    assert str(error) == "class/unit computation cancelled"
assert cancel_polls[0] == 1
print("cubic-class-number-p-lines-ok")
`);
  assert.equal(output, "cubic-class-number-p-lines-ok");
});
