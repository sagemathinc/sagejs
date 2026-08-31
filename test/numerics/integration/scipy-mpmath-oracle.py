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
    assert abs(sagejs.value - reference) <= 2e-9, name
    assert abs(sagejs.value - scipy_value) <= max(2e-9, 8.0 * scipy_error), name
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
    ]
    print(
        json.dumps(
            {
                "oracle": {"scipy": scipy.__version__, "mpmath": mpmath.__version__},
                "cases": cases,
            },
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
