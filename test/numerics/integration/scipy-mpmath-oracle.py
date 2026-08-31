#!/usr/bin/env python3
"""Differential integration oracle requiring SciPy and mpmath."""

from __future__ import annotations

import collections.abc
import hashlib
import json
import math
import sys
import typing
from pathlib import Path
from typing import Any

import mpmath
import scipy
from scipy.integrate import quad

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "src" / "lib"))

from sagejs.numerics.integration import integrate  # noqa: E402


def _case(
    name: str,
    function: Any,
    lower: float,
    upper: float,
    reference: float,
    *,
    scipy_points: list[float] | None = None,
    options: dict[str, Any] | None = None,
) -> dict[str, Any]:
    arguments = {} if options is None else options
    sagejs = integrate(
        function,
        lower,
        upper,
        absolute_tolerance=1e-11,
        relative_tolerance=1e-11,
        **arguments,
    )
    scipy_value, scipy_error = quad(
        function,
        lower,
        upper,
        epsabs=1e-11,
        epsrel=1e-11,
        points=scipy_points,
        limit=256,
    )
    assert sagejs.success, (name, sagejs.explain())
    assert sagejs.requested_tolerance is not None
    assert sagejs.error_estimate is not None
    assert sagejs.error_estimate <= sagejs.requested_tolerance, name
    reference_threshold = max(
        sagejs.requested_tolerance,
        64.0 * sys.float_info.epsilon * max(1.0, abs(reference)),
    )
    assert abs(sagejs.value - reference) <= reference_threshold, name
    assert abs(sagejs.value - scipy_value) <= max(
        reference_threshold, 8.0 * scipy_error
    ), name
    return {
        "id": name,
        "sagejs": sagejs.value,
        "sagejs_error_evidence": sagejs.error_estimate,
        "scipy": scipy_value,
        "scipy_error_estimate": scipy_error,
        "reference": reference,
        "difference": abs(sagejs.value - scipy_value),
        "sagejs_evaluations": sagejs.evaluations,
    }


def main() -> None:
    mpmath.mp.dps = 80
    cases = [
        _case("polynomial", lambda x: x**8 - 2.0 * x + 1.0, -2.0, 3.0, 20195.0 / 9.0),
        _case("sine", math.sin, 0.0, math.pi, 2.0),
        _case(
            "known_cusp",
            lambda x: abs(x - 0.3),
            0.0,
            1.0,
            0.29,
            scipy_points=[0.3],
            options={"breakpoints": [0.3]},
        ),
        _case(
            "log_endpoint",
            math.log,
            0.0,
            1.0,
            -1.0,
            options={"endpoint_singularities": "left"},
        ),
        _case(
            "beta_half",
            lambda x: 1.0 / math.sqrt(x * (1.0 - x)),
            0.0,
            1.0,
            float(mpmath.beta(mpmath.mpf("0.5"), mpmath.mpf("0.5"))),
            options={"endpoint_singularities": "both"},
        ),
        _case("exp_tail", lambda x: math.exp(-x), 0.0, math.inf, 1.0),
        _case("reversed_exp_tail", lambda x: math.exp(-x), math.inf, 0.0, -1.0),
        _case(
            "gaussian_line",
            lambda x: math.exp(-(x * x)),
            -math.inf,
            math.inf,
            float(mpmath.sqrt(mpmath.pi)),
        ),
        _case(
            "cauchy_line",
            lambda x: 1.0 / (1.0 + x * x),
            -math.inf,
            math.inf,
            float(mpmath.pi),
        ),
        _case(
            "oscillatory_sine",
            lambda x: math.sin(1000.0 * x),
            0.0,
            1.0,
            (1.0 - math.cos(1000.0)) / 1000.0,
        ),
        _case(
            "bracketed_narrow_peak",
            lambda x: math.exp(-(((x - 0.1) / 1e-4) ** 2)) / 1e-4,
            0.0,
            1.0,
            float(mpmath.sqrt(mpmath.pi)),
            scipy_points=[0.0995, 0.1, 0.1005],
            options={"breakpoints": [0.0995, 0.1, 0.1005]},
        ),
    ]
    divergent_odd = integrate(
        lambda x: x / (1.0 + x * x),
        -math.inf,
        math.inf,
        max_depth=12,
    )
    assert not divergent_odd.success
    assert divergent_odd.stop_reason in ("maximum_depth", "roundoff_detected")

    partial = integrate(
        lambda x: x,
        0.0,
        1.0,
        breakpoints=[0.5],
        max_evaluations=30,
    )
    assert not partial.success and partial.stop_reason == "maximum_evaluations"
    assert partial.value is None and len(partial.final_intervals) == 0

    scaled = integrate(lambda _x: 1e-308, -1e308, 1e308)
    assert scaled.success and abs(scaled.value - 2.0) <= 2e-14

    unmarked_peak = integrate(
        lambda x: math.exp(-(((x - 0.1) / 1e-4) ** 2)) / 1e-4,
        0.0,
        1.0,
    )
    assert unmarked_peak.success and unmarked_peak.value == 0.0
    print(
        json.dumps(
            {
                "oracle": {"scipy": scipy.__version__, "mpmath": mpmath.__version__},
                "cases": cases,
                "adversarial": {
                    "divergent_odd_stop": divergent_odd.stop_reason,
                    "partial_partition_atomic": partial.value is None,
                    "scaled_finite_value": scaled.value,
                    "unmarked_narrow_peak_demonstrates_finite_node_blind_spot": (
                        unmarked_peak.value
                    ),
                },
            },
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
