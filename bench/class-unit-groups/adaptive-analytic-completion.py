"""Measure the public coarse-first analytic completion boundary.

Run one case per process for a cold sample::

    SAGEJS_USE_SOURCE=1 SAGEJS_ADAPTIVE_CASE=quintic \
        SAGEJS_ADAPTIVE_CACHE=cold ./bin/sagejs --python \
        bench/class-unit-groups/adaptive-analytic-completion.py

Use `warm` to seed an isomorphic field and prepare the measured maximal order
before starting the public-operation timer.  The script validates exact output
before emitting one compact JSON record.
"""

import json
import os
import time


case_name = os.environ.get("SAGEJS_ADAPTIVE_CASE", "quintic")
cache_state = os.environ.get("SAGEJS_ADAPTIVE_CACHE", "cold")
if case_name not in ("quintic", "quartic"):
    raise ValueError("the benchmark case must be quintic or quartic")
if cache_state not in ("cold", "warm"):
    raise ValueError("the benchmark cache state must be cold or warm")

R = PolynomialRing(QQ, "x")
x = R.gen()
if case_name == "quintic":
    polynomial = x**5 + x**3 - x**2 + 4 * x + 1
    expected_invariants = (4,)
    expected_status = "exact-relations-conditional-grh"
else:
    polynomial = x**4 - x - 1
    expected_invariants = ()
    expected_status = "exact-unconditional"

if cache_state == "warm":
    seed_field = NumberField(polynomial, "seed")
    seed_result = seed_field.class_unit_group(proof=False)
    if not seed_result.complete:
        raise ArithmeticError("the warmup class/unit computation did not complete")

field = NumberField(polynomial, "a")
if cache_state == "warm":
    field.maximal_order()
started = time.perf_counter_ns()
result = field.class_unit_group(proof=False)
elapsed = (time.perf_counter_ns() - started) / 1_000_000_000

group = result.class_group()
unit_group = result.unit_group()
if (
    not result.complete
    or result.proof_status != expected_status
    or group.invariants() != expected_invariants
    or group.order() != (1 if not expected_invariants else expected_invariants[0])
    or not group.verify()
    or not unit_group.complete
    or unit_group.unit_rank != 2
    or unit_group.torsion.order != 2
    or not result.regulator().rigorous
):
    raise ArithmeticError("adaptive analytic benchmark changed an exact result")

certificate = result.saturation_record._analytic_certificate
configuration = certificate.configuration["zeta"]
print(
    json.dumps(
        {
            "case": case_name,
            "cache_state": cache_state,
            "elapsed_seconds": elapsed,
            "analytic_seconds": result.diagnostics["phase_timings"].get(
                "analytic-index", 0
            ),
            "proof_status": result.proof_status,
            "class_invariants": list(group.invariants()),
            "unit_rank": unit_group.unit_rank,
            "torsion_order": unit_group.torsion.order,
            "zeta_absolute_error": configuration["absolute_error"],
            "zeta_absolute_error_history": configuration.get(
                "absolute_error_history", [configuration["absolute_error"]]
            ),
            "zeta_threshold": certificate.analytic_proof["zeta_log_residue"][
                "threshold"
            ],
        },
        separators=(",", ":"),
        sort_keys=True,
    )
)
