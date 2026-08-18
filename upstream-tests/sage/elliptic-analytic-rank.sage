# Offline Sage/PARI oracle assertions for the Sage.js analytic-rank corpus.
#
# These are probable numerical ranks, not proofs that lower derivatives vanish.
# Run from the repository root with:
#   /path/to/sage upstream-tests/sage/elliptic-analytic-rank.sage

import json
from pathlib import Path

manifest_path = Path("test/data/elliptic-analytic-rank/curves.json")
manifest = json.loads(manifest_path.read_text())

for record in manifest["curves"]:
    if "core" not in record["tiers"]:
        continue
    curve = EllipticCurve([ZZ(value) for value in record["a_invariants"]])
    rank, derivative = curve.analytic_rank(
        algorithm="pari", leading_coefficient=True
    )
    expected_derivative = RDF(record["expected_leading_derivative"])
    assert str(curve.conductor()) == record["conductor"]
    assert curve.root_number() == record["root_number"]
    assert rank == record["expected_probable_analytic_rank"]
    assert abs(RDF(derivative) - expected_derivative) <= 5e-13 * max(
        1, abs(expected_derivative)
    )
    for zero_sum in record.get("zero_sum_upper_bounds", []):
        bound = curve.analytic_rank_upper_bound(
            max_Delta=zero_sum["delta"], adaptive=False
        )
        assert bound == zero_sum["bound"]
    print(
        record["id"],
        curve.conductor(),
        curve.root_number(),
        rank,
        derivative,
    )
