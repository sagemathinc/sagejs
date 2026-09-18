"""Adapt same-run row-20 owners to the exact C7 correspondence replay."""

from typing import Any

from .row20_c7_closure import compose_authenticated_row20_c7


def _integer(value: int | str) -> dict[str, str]:
    return {"kind": "integer", "value": str(value)}


def _vector(values: list[int | str], kind: str = "column") -> dict[str, Any]:
    return {"kind": kind, "values": [_integer(value) for value in values]}


def _packed_scalar(values: list[int | str]) -> dict[str, Any]:
    kind, rm, rp, re, im, ip, ie = [int(value) for value in values]
    real = (
        _integer(rm)
        if rp == -1
        else {"kind": "real", "mantissa": str(rm), "precision": rp, "exponent": re}
    )
    if kind == 1:
        return real
    imaginary = (
        _integer(im)
        if ip == -1
        else {"kind": "real", "mantissa": str(im), "precision": ip, "exponent": ie}
    )
    return {"kind": "complex", "real": real, "imag": imaginary}


def _packed_matrix(values: list[int | str], columns: int, rows: int) -> dict[str, Any]:
    packed = [int(value) for value in values]
    if len(packed) != columns * rows * 7:
        raise ValueError("fresh packed matrix has the wrong shape")
    return {
        "kind": "matrix",
        "values": [
            {
                "kind": "column",
                "values": [
                    _packed_scalar(
                        packed[
                            7 * (column * rows + row) : 7 * (column * rows + row + 1)
                        ]
                    )
                    for row in range(rows)
                ],
            }
            for column in range(columns)
        ],
    }


def compose_fresh_row20_closure(
    prepared: dict[str, Any],
    factor: dict[str, Any],
    live: dict[str, Any],
    acceptance: dict[str, Any],
    units: dict[str, Any],
    ancestry: dict[str, str],
) -> dict[str, Any]:
    """Run the existing exact correspondence proof on live-only projections."""
    descriptors = factor["factorBase"]["descriptors"]
    lp = []
    for descriptor in descriptors:
        lp.append(
            {
                "kind": "vector",
                "values": [
                    _integer(descriptor[0]),
                    _vector(descriptor[3:8]),
                    _integer(descriptor[1]),
                    _integer(descriptor[2]),
                    {"kind": "matrix", "values": []},
                ],
            }
        )
    records = [
        {
            "R": _vector(live["relationRecords"][7 * column : 7 * (column + 1)]),
            "m": _vector(live["principalGenerators"][5 * column : 5 * (column + 1)]),
        }
        for column in range(14)
    ]
    regulator = {
        "kind": "real",
        "mantissa": str(acceptance["regulator"][0]),
        "precision": int(acceptance["regulator"][1]),
        "exponent": int(acceptance["regulator"][2]),
    }
    synthetic = {
        "schema": "sagejs.pari-class-group/development-default-driver-trace-v1",
        "field": {
            "id": "5.1.1000000.1",
            "degree": 5,
            "signature": [1, 2],
            "unitRank": 2,
            "coefficients": ["-12", "-5", "0", "0", "0", "1"],
        },
        "prepared": {
            "multiplicationTensor": prepared["basis_table"],
            "rootsOfUnity": {
                "kind": "vector",
                "values": [_integer(prepared["analytic_roots_of_unity"]), _integer(-1)],
            },
        },
        "events": [
            {
                "event": "factor_base",
                "LP": {"kind": "vector", "values": lp},
                "perm": _vector(factor["factorBase"]["permutation"], "small-vector"),
            },
            {
                "event": "hnf",
                "relationRecords": records,
                "exactEmbeddings": _packed_matrix(live["rawLogs"], 14, 3),
                "exactC": _packed_matrix(live["compactLogs"], 14, 3),
            },
            {"event": "acceptance", "exactR": regulator},
        ],
    }
    c6 = dict(units)
    c6["schema"] = "sagejs.pari-class-group/row20-successful-c6-v1"
    c6["ancestry"] = {"pristineW0Sha256": ancestry["freshInputSha256"]}
    adapted_ancestry = dict(ancestry)
    adapted_ancestry["pristineW0Sha256"] = ancestry["freshInputSha256"]
    return compose_authenticated_row20_c7(c6, synthetic, adapted_ancestry)


__all__ = ["compose_fresh_row20_closure"]
