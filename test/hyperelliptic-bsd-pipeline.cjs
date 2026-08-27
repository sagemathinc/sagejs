// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test(
  "BSD pipeline atomically assembles rank zero and replays persistence records",
  { timeout: 180_000 },
  async () => {
    const session = await createSage();
    try {
      const result = await session.evaluate(String.raw`
from sagejs.hyperelliptic_curves.bsd import (
    LeadingTermData,
    Provenance,
    RankEvidence,
    TamagawaData,
    TorsionData,
)
from sagejs.hyperelliptic_curves.bsd_pipeline import (
    BSDPipelineReport,
    compute_bsd_analytic_quotient,
)
R = PolynomialRing(QQ, "x")
x = R.gen()
# PARI corpus curve g2-N277-r0-nine.  This test isolates orchestration: its
# Neron period, Tamagawa number, and torsion order are explicitly labelled
# supplied fixture data while the global reduction/model binding is replayed.
C = HyperellipticCurve(R([-6,11,-19,14,-9,1]), R([1]))
source = Provenance("supplied", "pinned-rank-zero-pipeline-fixture")
global_data = C.global_reduction()
assert int(global_data.root_number) == 1
leading = LeadingTermData.supplied(0, 12, 1, provenance=source)
tamagawa = TamagawaData.supplied(
    {277: 1}, bad_primes=global_data.bad_primes, provenance=source
)
torsion = TorsionData(1, source)
report = compute_bsd_analytic_quotient(
    C,
    subgroup=(),
    rank=RankEvidence("supplied", 0, source),
    prec=80,
    overrides={
        "leading_term": leading,
        "period": "3.5",
        "period_provenance": source,
        "period_is_total": True,
        "real_component_factor": 1,
        "period_differential_basis": "supplied Neron basis",
        "tamagawa_data": tamagawa,
        "torsion_data": torsion,
    },
)
assert report.complete and report.missing_factors() == ()
assert report.leading_derivative().to_dict() == leading.derivative.to_dict()
assert report.leading_taylor_coefficient().to_dict() == leading.derivative.to_dict()
assert report.tamagawa_product() == 1
assert report.regulator().to_dict()["numerator"] == "1"
assert report.sha_over_index_squared().kind == "decimal"
assert report.diagnostics()["complete"]
assert report.verify()["verified"]
replayed = BSDPipelineReport.from_json(report.to_json())
assert replayed.to_dict() == report.to_dict() and replayed.verify()["verified"]
row = report.sqlite_record()
assert row["complete"] == 1 and row["pipeline_payload_json"] == report.to_json()
assert row["curve_sha256"] and row["pipeline_sha256"]
True
`);
      assert.equal(result.repr, "True");
    } finally {
      await session.close();
    }
  },
);

test(
  "BSD pipeline checkpoints incomplete arithmetic without claiming a quotient",
  { timeout: 180_000 },
  async () => {
    const session = await createSage();
    try {
      const result = await session.evaluate(String.raw`
import json
from sagejs.hyperelliptic_curves.bsd import (
    LeadingTermData,
    Provenance,
    RankEvidence,
    TamagawaData,
    TorsionData,
)
from sagejs.hyperelliptic_curves.bsd_pipeline import (
    BSDPipelineIncompleteError,
    BSDPipelineReport,
    _regulator_factor,
    compute_bsd_analytic_quotient,
)
R = PolynomialRing(QQ, "x")
x = R.gen()
C = HyperellipticCurve(R([-6,11,-19,14,-9,1]), R([1]))
source = Provenance("supplied", "pipeline-incomplete-fixture")
global_data = C.global_reduction()
common = {
    "leading_term": LeadingTermData.supplied(0, 12, 1, provenance=source),
    "tamagawa_data": TamagawaData.supplied(
        {277: 1}, bad_primes=global_data.bad_primes, provenance=source
    ),
    "torsion_data": TorsionData(1, source),
}
report = compute_bsd_analytic_quotient(C, prec=64, overrides=common)
assert not report.complete
assert "algebraic_rank" in report.missing_factors()
assert "period" in report.missing_factors()
assert report.to_dict()["claim"] == "no_bsd_quotient_claimed"
assert "quotient" not in report.to_dict()
try:
    report.sha_over_index_squared()
    raise AssertionError("an incomplete report exposed a quotient")
except BSDPipelineIncompleteError as error:
    assert error.report is report
row = report.sqlite_record()
assert row["complete"] == 0 and row["quotient_name"] == ""
assert json.loads(row["missing_factors_json"]) == list(report.missing_factors())
assert BSDPipelineReport.from_json(row["payload_json"]).to_dict() == report.to_dict()

bad = report.to_dict()
bad["complete"] = True
rejected = False
try:
    BSDPipelineReport.from_dict(bad)
except Exception:
    rejected = True
assert rejected

unsafe = dict(common)
unsafe.update({
    "period": "3.5",
    "period_provenance": source,
    "period_is_total": "false",
    "real_component_factor": 1,
    "period_differential_basis": "supplied Neron basis",
})
unsafe_report = compute_bsd_analytic_quotient(
    C, rank=0, prec=64, overrides=unsafe
)
assert unsafe_report.factor("period").status == "error"

# A positive-rank request without a verified rank-sized basis reports the
# precise subgroup/regulator capability instead of using analytic rank as
# algebraic proof or producing a quotient.
positive_curve = HyperellipticCurve(R([0,-1,-1]), R([1,1,0,1]))
positive_global = positive_curve.global_reduction()
positive = compute_bsd_analytic_quotient(
    positive_curve,
    rank=1,
    prec=64,
    overrides={
        "leading_term": LeadingTermData.supplied(1, 7, -1, provenance=source),
        "period": "2.0",
        "period_provenance": source,
        "period_is_total": True,
        "real_component_factor": 1,
        "period_differential_basis": "supplied Neron basis",
        "tamagawa_data": TamagawaData.supplied(
            {587: 1}, bad_primes=positive_global.bad_primes, provenance=source
        ),
        "torsion_data": TorsionData(1, source),
    },
)
assert not positive.complete
assert "subgroup" in positive.missing_factors()
assert "regulator" in positive.missing_factors()

class GenusThreePairingFixture:
    def __init__(self, complete):
        self.input_completeness = complete
        self.input_rigor = "non_rigorous_or_unverified"
        self.rank = 1
    def to_dict(self):
        return {
            "schema": "sagejs.hyperelliptic.height-pairing-matrix.v1",
            "rank": 1,
            "entries": (("2.5",),),
            "regulator": "2.5",
            "precision_bits": 64,
            "positive_definite": True,
            "rigorous": False,
            "input_completeness": self.input_completeness,
            "input_rigor": self.input_rigor,
            "provenance": {},
        }
class GenusThreeJacobianFixture:
    def __init__(self, complete):
        self.complete = complete
    def regulator(self, points, **options):
        assert len(points) == 1 and options["prec"] == 64
        return GenusThreePairingFixture(self.complete)
class GenusThreeCurveFixture:
    def __init__(self, complete):
        self.complete = complete
    def genus(self):
        return 3
    def jacobian(self):
        return GenusThreeJacobianFixture(self.complete)

rank_evidence = RankEvidence("supplied", 1, source)
computed_regulator, computed_row = _regulator_factor(
    GenusThreeCurveFixture("verified_complete"),
    ("P",),
    1,
    rank_evidence,
    ({"verified": True},),
    64,
    {},
)
assert computed_row.complete and computed_regulator.value.kind == "decimal"
assert not computed_regulator.value.rigorous
failed_regulator, failed_row = _regulator_factor(
    GenusThreeCurveFixture("not_verified_complete"),
    ("P",),
    1,
    rank_evidence,
    ({"verified": True},),
    64,
    {},
)
assert failed_regulator is None and failed_row.status == "incomplete"
True
`);
      assert.equal(result.repr, "True");
    } finally {
      await session.close();
    }
  },
);
