// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { join } = require("node:path");
const test = require("node:test");
const { spawnSagejsSync } = require("./helpers/sagejs-cli.cjs");

test("BF certificates cannot turn exact generation into unconditional unit completeness", { timeout: 300000 }, (t) => {
  const result = spawnSagejsSync(join(__dirname, ".."), ["--python", "-"], {
    encoding: "utf8", timeout: 290000,
    input: String.raw`
import json
import sagejs.number_fields.class_unit_analytic as analytic
import sagejs.number_fields.class_unit_groups as groups
from sagejs.number_fields.class_group_factor_base import minkowski_bound

R = PolynomialRing(QQ, "x")
x = R.gen()
f = x**3-x**2-2*x+1
K = NumberField(f, "a")
conditional = K.class_unit_group(proof=False, algorithm="buchmann-hecke")
assert conditional.complete
assert conditional.proof_status == "exact-relations-conditional-grh"
assert conditional.context.proof_state.to_dict()["assumptions"]
assert conditional.class_number() == 1
certificate = conditional.saturation_record._analytic_certificate
assert certificate.proof_status == "exact-relations-conditional-grh"
before = conditional.saturation_record.to_dict()
coordinates = conditional.unit_coordinate_map()
compact = coordinates.factored_exp((1, 2, -3))
assert coordinates.log(compact) == (1, 2, -3)

# A genuine exact generation checker for this field, not an always-true mock.
assert int(K.maximal_order().discriminant()) == 49
assert minkowski_bound(K.maximal_order()).bound == 1
generation_calls = []
def d49_generation(field, order, units, class_number, evidence, proof_status):
    generation_calls.append(proof_status)
    return (field is K and order is K.maximal_order()
        and int(order.discriminant()) == 49 and minkowski_bound(order).bound == 1
        and class_number == 1 and evidence["factor_base"] == [])
assert certificate.verify(K, K.maximal_order(), conditional.units(), generation_verifier=d49_generation)
assert generation_calls == ["exact-relations-conditional-grh"]

# The one-shot live-parent shortcut must enforce the same status boundary
# without trusting a mutable mirror or replaying the full analytic proof.
original_payload = certificate.to_dict()
live = analytic.UnitSaturationIndexCertificate(
    original_payload["field_order_identity"], original_payload["initial_units"],
    original_payload["configuration"], original_payload["index_bound"],
    original_payload["analytic_proof"], original_payload["generation_evidence"],
    "exact-relations-conditional-grh",
    _live_parent_token=analytic._LIVE_UNIT_INDEX_PARENT_TOKEN)
live._proof_status = "exact-unconditional"
assert live._consume_live_parent_payload(analytic._LIVE_UNIT_INDEX_PARENT_TOKEN) is None
live._proof_status = "exact-relations-conditional-grh"
live._body_snapshot["proof_status"] = "exact-unconditional"
assert live._consume_live_parent_payload(analytic._LIVE_UNIT_INDEX_PARENT_TOKEN) is None
live._body_snapshot["proof_status"] = "exact-relations-conditional-grh"
assert live._consume_live_parent_payload(analytic._LIVE_UNIT_INDEX_PARENT_TOKEN)["proof_status"] == "exact-relations-conditional-grh"
assert live._consume_live_parent_payload(analytic._LIVE_UNIT_INDEX_PARENT_TOKEN) is None

payload = certificate.to_dict()
payload["proof_status"] = "exact-unconditional"
payload["generation_evidence"]["proof_status"] = "exact-unconditional"
body = dict(payload)
del body["content_sha256"]
payload["content_sha256"] = analytic._content_hash(body)
try:
    analytic.UnitSaturationIndexCertificate.from_dict(payload)
    raise AssertionError("canonical rehashed unconditional BF certificate decoded")
except analytic.AnalyticCertificationError as error:
    assert "conditional on zeta GRH" in str(error)
try:
    analytic.UnitSaturationIndexCertificate(
        body["field_order_identity"], body["initial_units"], body["configuration"],
        body["index_bound"], body["analytic_proof"], body["generation_evidence"],
        "exact-unconditional", generation_verifier=d49_generation)
    raise AssertionError("unconditional BF certificate constructed")
except analytic.AnalyticCertificationError:
    pass
try:
    analytic.certify_unit_saturation_index(K, K.maximal_order(), conditional.units(),
        class_number=1, roots_of_unity=2, generation_evidence=body["generation_evidence"],
        generation_verifier=d49_generation, proof_status="exact-unconditional")
    raise AssertionError("unconditional BF certificate issued")
except analytic.AnalyticCertificationError:
    pass
certificate._proof_status = "exact-unconditional"
assert not certificate.verify(K, K.maximal_order(), conditional.units(), generation_verifier=d49_generation)
certificate._proof_status = "exact-relations-conditional-grh"
assert generation_calls == ["exact-relations-conditional-grh"]

def unsupported(field, **options):
    options.setdefault("algorithm", "buchmann-hecke")
    try:
        field.class_unit_group(proof=True, **options)
        raise AssertionError("generic BF proof=True was published")
    except NotImplementedError as error:
        assert "proof stage" in str(error)
        assert "unconditional analytic unit completeness" in str(error)

# Reject the cached upgrade before calling the unrelated Minkowski suffix.
original = groups.ClassUnitGroupEngine._unconditional_proof_pass
def forbidden(self, group):
    raise AssertionError("BF rejection reached the class-generation suffix")
groups.ClassUnitGroupEngine._unconditional_proof_pass = forbidden
try:
    unsupported(K)
    unsupported(NumberField(f, "b"), algorithm="buchmann-hecke")
    unsupported(NumberField(f, "c"))
finally:
    groups.ClassUnitGroupEngine._unconditional_proof_pass = original
assert K.class_unit_group(proof=False, algorithm="buchmann-hecke") is conditional
assert conditional.saturation_record.to_dict() == before
assert not conditional.context._live_artifacts.terminal_upgrade_reserved
assert not conditional.context._live_artifacts.terminal_upgrade_issued
assert coordinates.log(compact) == (1, 2, -3)
assert conditional.class_group().verify()

# An exact scalar class number does not certify units, and remains available.
S = NumberField(f, "s")
assert S.class_number(proof=True) == 1
unsupported(S)

# Auto may use an existing independent bounded exact theorem instead of BF.
# It must not upgrade or mutate the previously authenticated conditional token.
A = NumberField(f, "auto")
old = A.class_unit_group(proof=False)
old_map = old.unit_coordinate_map()
old_product = old_map.factored_exp((0, 1, -1))
auto = A.class_unit_group(proof=True)
assert auto.algorithm == "specialized"
assert auto.complete and auto.proof_status == "exact-unconditional"
assert auto.saturation_record is None
assert auto.unit_group().verify_completion()
box = auto.unit_group().completion_certificate
assert box.kind == "exact-log-fundamental-box"
assert box.candidate_cap == 100000 and box.exponent_cap == 8
assert len(box.coefficient_bounds) == 3
assert box.lattice_candidates <= box.candidate_cap
from sagejs.number_fields.class_groups import bounded_class_group
exact_classes = bounded_class_group(A)
assert exact_classes.complete and exact_classes.order() == 1
assert exact_classes.certificate.verify()
assert A.class_unit_group(proof=False) is old
assert old_map.log(old_product) == (0, 1, -1)
assert old.context.proof_state.to_dict()["assumptions"]

# Actually recognized non-BF rank-zero/rational/cubic routes remain exact.
for polynomial in (x**2+1, x-1, x**3-x-1):
    Q = NumberField(polynomial, "q")
    exact = Q.class_unit_group(proof=True)
    assert exact.complete and exact.proof_status == "exact-unconditional"
    assert type(exact.saturation_record) is not groups.ClassUnitSaturationRecord
    assert exact.unit_group().verify_completion()
# Standalone real quadratic unit/class services are exact, but their generic
# combined fallback is not an unconditional proof of the coupled result.
from sagejs.number_fields.units import real_quadratic_unit_group
Q = NumberField(x**2-5, "r")
assert Q.class_number(proof=True) == 1
assert real_quadratic_unit_group(Q).verify_completion()
unsupported(Q)
print(json.dumps({"status": "bf-proof-policy-ok", "auto_d49": {
    "unit_certificate": box.kind, "coefficient_bounds": box.coefficient_bounds,
    "candidate_cap": box.candidate_cap, "exponent_cap": box.exponent_cap,
    "lattice_candidates": box.lattice_candidates, "class_certificate": exact_classes.certificate.evidence_kind}}))
`,
  });
  assert.equal(result.status, 0, result.error?.message || result.stderr || result.stdout);
  const report = JSON.parse(result.stdout.trim());
  assert.equal(report.status, "bf-proof-policy-ok");
  assert.equal(report.auto_d49.unit_certificate, "exact-log-fundamental-box");
  t.diagnostic(JSON.stringify(report.auto_d49));
});
