// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test(
  "public hyperelliptic BSD methods preserve atomic capability status",
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
R = PolynomialRing(QQ, "x")
C = HyperellipticCurve(R([-6,11,-19,14,-9,1]), R([1]))
G = C.global_reduction()
source = Provenance.supplied("public BSD integration fixture")

assert C.tamagawa_number(3) == 1
assert C.local_deficiency("infinity").decision is False
assert C.is_deficient("infinity") is False

common = {
    "leading_term": LeadingTermData.supplied(0, 12, int(G.root_number), provenance=source),
    "tamagawa_data": TamagawaData.supplied(
        {int(p): 1 for p in G.bad_primes},
        bad_primes=G.bad_primes,
        provenance=source,
    ),
    "torsion_data": TorsionData(1, source),
}
complete = C.bsd_analytic_quotient(
    subgroup=(),
    rank=RankEvidence("supplied", 0, source),
    prec=80,
    overrides={
        **common,
        "period": "3.5",
        "period_provenance": source,
        "period_is_total": True,
        "real_component_factor": 1,
        "period_differential_basis": "supplied Neron basis",
    },
)
assert complete.complete
assert complete.factor("period").complete
assert complete.sha_over_index_squared().is_positive()
assert complete.verify()["verified"]
assert complete.sqlite_record()["complete"] == 1

checkpoint = C.bsd_analytic_quotient(prec=64, overrides=common)
assert not checkpoint.complete
assert "algebraic_rank" in checkpoint.missing_factors()
assert "period" in checkpoint.missing_factors()
assert checkpoint.to_dict()["claim"] == "no_bsd_quotient_claimed"
assert checkpoint.sqlite_record()["complete"] == 0
True
`);
      assert.equal(result.repr, "True");
    } finally {
      await session.close();
    }
  },
);

test(
  "public Jacobian BSD arithmetic delegates retain structured results",
  { timeout: 180_000 },
  async () => {
    const session = await createSage();
    try {
      const result = await session.evaluate(String.raw`
R = PolynomialRing(QQ, "x")
x = R.gen()
C = HyperellipticCurve(x**5 - x + 1)
J = C.jacobian()
P = J([x, 1])

height = P.canonical_height(steps=6, precision=80)
pairing = J.height_pairing([P], steps=6, precision=80)
regulator = J.regulator([P], steps=6, precision=80)
bound = J.torsion_bound(primes=(3, 5))
saturation = J.saturate([P], use_height_pairing=False)

assert height.verify(P)
assert pairing.verify([P])
assert regulator.verify([P])
assert bound.upper_bound >= bound.lower_bound >= 1
assert saturation.verify()
assert not saturation.full_mordell_weil_group_proved
(
    height.status,
    pairing.rigorous,
    regulator.status,
    bound.status,
    saturation.global_saturation_proved,
)
`);
      assert.equal(
        result.repr,
        "('certified-enclosure', True, 'certified-positive', " +
          "'exact', False)",
      );
    } finally {
      await session.close();
    }
  },
);
