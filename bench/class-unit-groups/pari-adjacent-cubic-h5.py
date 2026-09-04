"""Benchmark the PARI-adjacent complex-cubic class-group slice.

The workload is the class-number-five field `x^3 + 9*x - 55`.  Both targets
use the same eight factor ideals, three reduced ideal lattices, twelve exact
candidate elements, ordinary relation authentication, and analytic proof.
`resident` fuses shell generation, prime-power containment, and stable HNF
selection in one native region.  `readable` disables only that fused region
and exercises the independent packed-source implementation.

Run with:

```sh
SAGEJS_PARI_ADJACENT_SAMPLES=7 \
  node bin/sagejs --python bench/class-unit-groups/pari-adjacent-cubic-h5.py
```
"""

from __future__ import annotations

import json
import os
import time

import sagejs.number_fields.cubic_class_number as cubic


SAMPLES = int(os.environ.get("SAGEJS_PARI_ADJACENT_SAMPLES", "5"))
WARMUPS = int(os.environ.get("SAGEJS_PARI_ADJACENT_WARMUPS", "1"))
ENFORCE = os.environ.get("SAGEJS_PARI_ADJACENT_ENFORCE") == "1"
if SAMPLES < 1 or WARMUPS < 0:
    raise ValueError("PARI-adjacent benchmark sample counts are invalid")

R = PolynomialRing(QQ, "x")
x = R.gen()
POLYNOMIAL = x**3 + 9 * x - 55
TARGETS = ("readable", "resident")
original_resident = cubic._resident_cubic_reduced_shell_relation_selection


def median(values: list[float]) -> float:
    ordered = sorted(values)
    return float(ordered[len(ordered) // 2])


def make_field(name: str):
    field = NumberField(POLYNOMIAL, name)
    field.maximal_order()
    return field


def disable_resident(*_args, **_kwargs):
    return None


def measure(target: str, name: str) -> tuple[float, dict[str, int]]:
    cubic._resident_cubic_reduced_shell_relation_selection = (
        original_resident if target == "resident" else disable_resident
    )
    field = make_field(name)
    started = time.perf_counter()
    answer = int(field.class_number(proof=False))
    elapsed = time.perf_counter() - started
    result = field.class_unit_group(proof=False)
    resources = result.diagnostics["resources"]
    assert answer == 5
    assert result.class_group().invariants() == (5,)
    assert result.proof_status == "exact-relations-conditional-grh"
    assert result.diagnostics["factor_base_size"] == 8
    assert resources["cubic_integral_sieve_candidates"] == 12
    assert resources["cubic_integral_sieve_relations"] == 5
    assert resources["cubic_integral_sieve_dependency_relations"] == 6
    assert resources["cubic_relation_selector_initial_rows"] == 3
    assert resources["cubic_relation_selector_candidate_rows"] == 12
    assert resources["cubic_relation_selector_total_rows"] == 15
    assert resources["cubic_relation_selector_columns"] == 8
    assert resources["cubic_relation_selector_deletion_trials"] == 8
    assert resources["cubic_relation_selector_hnf_calls"] == 9
    assert resources["cubic_relation_selector_native_boundary_calls"] == 1
    assert resources["relation_attempts"] == 0
    assert resources["relation_candidates"] == 0
    resident_uses = int(resources["cubic_reduced_ideal_resident_uses"])
    assert resident_uses == (1 if target == "resident" else 0)
    return elapsed, {
        "resident_uses": resident_uses,
        "resident_work": int(resources["cubic_reduced_ideal_resident_work"]),
        "factor_base_size": int(result.diagnostics["factor_base_size"]),
        "candidate_rows": int(resources["cubic_relation_selector_candidate_rows"]),
        "hnf_calls": int(resources["cubic_relation_selector_hnf_calls"]),
        "native_boundary_calls": int(
            resources["cubic_relation_selector_native_boundary_calls"]
        ),
    }


samples: dict[str, list[float]] = {target: [] for target in TARGETS}
diagnostics: dict[str, dict[str, int]] = {}
try:
    for warmup in range(WARMUPS):
        for target in TARGETS:
            measure(target, "pari_adjacent_warm_" + target + "_" + str(warmup))
    for sample in range(SAMPLES):
        order = TARGETS[sample % len(TARGETS) :] + TARGETS[: sample % len(TARGETS)]
        for target in order:
            elapsed, receipt = measure(
                target,
                "pari_adjacent_sample_" + target + "_" + str(sample),
            )
            samples[target].append(elapsed)
            diagnostics[target] = receipt
finally:
    cubic._resident_cubic_reduced_shell_relation_selection = original_resident

medians = {target: median(values) for target, values in samples.items()}
resident_ratio = medians["resident"] / medians["readable"]
if ENFORCE and resident_ratio > 1.25:
    raise AssertionError("the resident PARI-adjacent slice regressed by over 25%")

print(
    "RESULT",
    json.dumps(
        {
            "schema": "sagejs-pari-adjacent-cubic-class-group/v1",
            "polynomial": [-55, 9, 0, 1],
            "class_number": 5,
            "proof": False,
            "samples": samples,
            "medians": medians,
            "resident_over_readable": resident_ratio,
            "diagnostics": diagnostics,
        },
        sort_keys=True,
    ),
)
