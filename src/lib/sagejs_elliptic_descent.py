# Lazy FLINT/eclib elliptic-curve descent and saturation boundary.
#
# Copyright (C) 2026 Sage.js contributors
# License: GPL-3.0-only

from __future__ import annotations

from typing import Any

import sagejs as sage
import sagejs.runtime as runtime


def _untyped(value: Any) -> Any:
    return value


def _points(curve: Any, native: Any, name: str) -> Any:
    points = []
    for coordinates in runtime.reflect.get(native, name):
        points.append(
            curve(
                [
                    _untyped(sage.QQ)(coordinates[0], coordinates[2]),
                    _untyped(sage.QQ)(coordinates[1], coordinates[2]),
                ]
            )
        )
    return runtime.math_tuple(points)


def ec_rank_descent_data(curve: Any, saturate: bool = False) -> Any:
    if curve._base is not sage.QQ and curve._base is not sage.ZZ:
        raise NotImplementedError(
            "2-descent rank computation is only implemented over QQ"
        )

    arguments = []
    for coefficient in curve._ainvs:
        if hasattr(coefficient, "_denominator"):
            arguments.append(runtime.integer_bigint(coefficient._numerator))
            arguments.append(runtime.integer_bigint(coefficient._denominator))
        else:
            arguments.append(runtime.integer_bigint(coefficient))
            arguments.append(runtime.bigint(1))
    arguments.append(bool(saturate))

    backend = runtime.flint_backend()
    native = runtime.reflect.apply(
        runtime.reflect.get(backend, "ecRankData"), backend, arguments
    )
    if not bool(runtime.reflect.get(native, "success")):
        raise ArithmeticError("eclib 2-descent failed for this elliptic curve")

    attempted = bool(runtime.reflect.get(native, "saturationAttempted"))
    proven = bool(runtime.reflect.get(native, "saturationProven"))
    return runtime.math_tuple(
        [
            int(runtime.reflect.get(native, "rankLowerBound")),
            int(runtime.reflect.get(native, "rankUpperBound")),
            int(runtime.reflect.get(native, "twoSelmerRank")),
            bool(runtime.reflect.get(native, "certain")),
            _points(curve, native, "foundPoints"),
            attempted,
            proven,
            (
                int(runtime.reflect.get(native, "saturationIndex"))
                if attempted or proven
                else None
            ),
            runtime.math_tuple(
                [
                    int(prime)
                    for prime in runtime.reflect.get(native, "unsaturatedPrimes")
                ]
            ),
            (_points(curve, native, "generators") if attempted or proven else None),
        ]
    )


def ec_rank_data(curve: Any, saturate: bool = False) -> dict[str, Any]:
    data = curve._rank_descent_data(saturate)
    return {
        "rank_lower_bound": data[0],
        "rank_upper_bound": data[1],
        "two_selmer_rank": data[2],
        "certain": data[3],
        "found_points": data[4],
        "saturation_attempted": data[5],
        "saturation_proven": data[6],
        "saturation_index": data[7],
        "unsaturated_primes": data[8],
        "generators": data[9],
        "full_mordell_weil_basis": data[3] and data[6],
    }


def ec_saturated_gens(curve: Any) -> Any:
    data = curve._rank_descent_data(True)
    if not data[3]:
        raise ArithmeticError(
            "a full Mordell-Weil basis is not proven because the rank "
            "bounds do not coincide"
        )
    if not data[6]:
        raise ArithmeticError(
            "Mordell-Weil saturation failed at primes " + str(data[8])
        )
    return data[9]
