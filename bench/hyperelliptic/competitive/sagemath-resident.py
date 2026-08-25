#!/usr/bin/env python3
"""Resident JSONL baseline for the overlapping SageMath contracts."""

import json
import os
import resource
import sys
import time

from sage.all import GF, QQ, HyperellipticCurve, PolynomialRing
from sage.env import SAGE_VERSION


def polynomial(ring, values):
    return ring([int(value) for value in values])


def prepare(case):
    model = case["model"]
    base = QQ if model.get("base") == "QQ" else GF(int(model["prime"]))
    ring = PolynomialRing(base, "x")
    curve = HyperellipticCurve(
        polynomial(ring, model["f"]), polynomial(ring, model["h"])
    )
    kind = case["kind"]
    if kind.startswith("jacobian_"):
        jacobian = curve.jacobian()
        left = jacobian(
            [polynomial(ring, case["left"]["u"]), polynomial(ring, case["left"]["v"])]
        )
        right = None
        if "right" in case:
            right = jacobian(
                [
                    polynomial(ring, case["right"]["u"]),
                    polynomial(ring, case["right"]["v"]),
                ]
            )
        return curve, ring, jacobian, left, right
    if kind == "group_structure":
        return curve, ring, curve.jacobian()
    return curve, ring


def operate(case, state):
    kind = case["kind"]
    if kind == "jacobian_add":
        return state[3] + state[4]
    if kind == "jacobian_validate":
        return state[3]
    if kind == "jacobian_double":
        return state[3] + state[3]
    if kind == "jacobian_scalar":
        return int(case["scalar"]) * state[3]
    if kind == "group_structure":
        return state[2].abelian_group().invariants()
    if kind == "local_factor":
        return state[0].frobenius_polynomial()
    raise NotImplementedError(f"SageMath runner has no comparable {kind} contract")


def encode(case, value):
    kind = case["kind"]
    if kind.startswith("jacobian_"):
        u_value, v_value = value.uv()
        if case["model"].get("base") == "QQ":
            return {
                "u": [str(item) for item in u_value.list()],
                "v": [str(item) for item in v_value.list()],
            }
        prime = int(case["model"]["prime"])
        return {
            "u": [str(int(item) % prime) for item in u_value.list()],
            "v": [str(int(item) % prime) for item in v_value.list()],
        }
    if kind == "group_structure":
        return [str(item) for item in value]
    if kind == "local_factor":
        # Sage's Frobenius characteristic polynomial is reciprocal to the
        # det(1-T Frob) convention; descending characteristic coefficients
        # are the normalized ascending local coefficients.
        return [str(item) for item in reversed(value.list())]
    raise NotImplementedError


def run_case(case, defaults, overrides):
    if case["kind"].startswith("unsupported_"):
        return {
            "id": case["id"],
            "status": "unsupported",
            "reason": "capability-only Sage.js regression cell",
        }
    supported = {
        "jacobian_add",
        "jacobian_double",
        "jacobian_scalar",
        "jacobian_validate",
        "group_structure",
        "local_factor",
    }
    if case["kind"] not in supported:
        return {
            "id": case["id"],
            "status": "unsupported",
            "reason": f"SageMath runner has no comparable {case['kind']} contract",
        }
    timing = case.get("timing", {})
    repetitions = int(
        overrides.get("repetitions", timing.get("repetitions", defaults["repetitions"]))
    )
    warmups = int(overrides.get("warmups", timing.get("warmups", defaults["warmups"])))
    repeated_size = int(
        overrides.get("batch_size", timing.get("batch_size", defaults["batch_size"]))
    )
    cold = []
    cold_cpu = []
    first = None
    for _ in range(repetitions):
        wall = time.perf_counter()
        cpu = time.process_time()
        state = prepare(case)
        result = encode(case, operate(case, state))
        cold_cpu.append(1000 * (time.process_time() - cpu))
        cold.append(1000 * (time.perf_counter() - wall))
        if first is None:
            first = result
        else:
            assert result == first
    state = prepare(case)
    for _ in range(warmups):
        operate(case, state)
    warm = []
    warm_cpu = []
    for _ in range(repetitions):
        wall = time.perf_counter()
        cpu = time.process_time()
        result = encode(case, operate(case, state))
        warm_cpu.append(1000 * (time.process_time() - cpu))
        warm.append(1000 * (time.perf_counter() - wall))
        assert result == first
    loops = []
    loops_cpu = []
    for _ in range(repetitions):
        wall = time.perf_counter()
        cpu = time.process_time()
        value = None
        for _inner in range(repeated_size):
            value = operate(case, state)
        result = encode(case, value)
        loops_cpu.append(1000 * (time.process_time() - cpu))
        loops.append(1000 * (time.perf_counter() - wall))
        assert result == first
    return {
        "id": case["id"],
        "status": "ok",
        "result": first,
        "result_mode": "exact",
        "object_cold_samples_ms": cold,
        "object_cold_cpu_samples_ms": cold_cpu,
        "warm_samples_ms": warm,
        "warm_cpu_samples_ms": warm_cpu,
        "repeated_warm_loop_samples_ms": loops,
        "repeated_warm_loop_cpu_samples_ms": loops_cpu,
        "repeated_warm_loop_size": repeated_size,
        "warm_mode": timing.get("warm_mode", "warm-arithmetic"),
    }


def handle(request):
    with open(os.path.abspath(request["cases_path"]), encoding="utf8") as stream:
        corpus = json.load(stream)
    selected = set(request.get("case_ids", ()))
    defaults = corpus["defaults"]
    overrides = request.get("defaults", {})
    cases = [case for case in corpus["cases"] if not selected or case["id"] in selected]
    rows = []
    for case in cases:
        try:
            rows.append(run_case(case, defaults, overrides))
        except NotImplementedError as error:
            rows.append(
                {"id": case["id"], "status": "unsupported", "reason": str(error)}
            )
    return {
        "schema": "sagejs.hyperelliptic-competitive-backend.v1",
        "backend": {
            "id": "sagemath",
            "version": SAGE_VERSION,
            "python": sys.version.split()[0],
            "max_rss_kib": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
        },
        "rows": rows,
    }


for line in sys.stdin:
    if line.strip():
        try:
            print(json.dumps(handle(json.loads(line)), sort_keys=True), flush=True)
        except Exception as error:
            print(
                json.dumps(
                    {
                        "schema": "sagejs.hyperelliptic-competitive-error.v1",
                        "error": repr(error),
                    }
                ),
                flush=True,
            )
