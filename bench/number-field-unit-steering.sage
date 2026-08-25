"""Warm prepared-field receipt for post-class-rank unit steering.

Run from the repository root with:

```
SAGEJS_USE_SOURCE=1 bin/sagejs bench/number-field-unit-steering.sage
```

The benchmark creates a fresh field for every observation, prepares its
maximal order outside the timer, and verifies the exact public result before
publishing timings.  It is deliberately small enough for focused lane use;
the central corpus runner remains the release performance authority.
"""

import json
import time


R = PolynomialRing(QQ, "x")
x = R.gen()
cases = (
    {
        "id": "quartic-fb0-unit-rank-2",
        "polynomial": x**4 - x - 1,
        "invariants": (),
        "unit_rank": 2,
        "torsion_order": 2,
        "regulator_rounding_cell": (
            (7563986649191381111, 2 * 10**19),
            (7563986649191381113, 2 * 10**19),
        ),
    },
    {
        "id": "c4-quintic-control",
        "polynomial": x**5 + x**3 - x**2 + 4 * x + 1,
        "invariants": (4,),
        "unit_rank": 2,
        "torsion_order": 2,
        "regulator_rounding_cell": (
            (11338080961483051, 2 * 10**15),
            (11338080961483053, 2 * 10**15),
        ),
    },
)

from sagejs.number_fields.class_unit_analytic import RationalEndpoint


receipt = {
    "schema": "sagejs.bench/number-field-unit-steering-v1",
    "boundary": "fresh-field/warm-runtime/prepared-maximal-order",
    "proof": False,
    "max_relation_attempts": 64,
    "samples_per_case": 3,
    "cases": [],
}
for case in cases:
    samples = []
    for _sample in range(receipt["samples_per_case"]):
        field = NumberField(case["polynomial"], "a")
        _order = field.maximal_order()
        started = time.perf_counter()
        result = field.class_unit_group(
            proof=False,
            max_relation_attempts=receipt["max_relation_attempts"],
        )
        elapsed = time.perf_counter() - started
        assert result.complete
        assert result.class_group().invariants() == case["invariants"]
        units = result.unit_group()
        assert units.unit_rank == case["unit_rank"]
        assert units.torsion.order == case["torsion_order"]
        regulator = result.regulator()
        lower_pair, upper_pair = case["regulator_rounding_cell"]
        rounded_lower = RationalEndpoint(lower_pair[0], lower_pair[1])
        rounded_upper = RationalEndpoint(upper_pair[0], upper_pair[1])
        assert rounded_lower <= regulator.lower <= regulator.upper <= rounded_upper
        resources = result.diagnostics["resources"]
        steering = resources["relation_steering"]
        samples.append(
            {
                "wall_seconds": elapsed,
                "relation_seconds": result.diagnostics["phase_timings"]["relations"],
                "attempts": resources["relation_attempts"],
                "candidates": resources["relation_candidates"],
                "relations": resources["relations"],
                "norm_screen_requests": steering["norm_screen_requests"],
                "norm_screen_rejects": steering["norm_screen_rejects"],
                "admitted_rows": steering["candidate_commits"],
                "dependency_transforms_selected": steering[
                    "dependency_transforms_selected"
                ],
            }
        )
    receipt["cases"].append({"id": case["id"], "samples": samples})

print(json.dumps(receipt, sort_keys=True))
