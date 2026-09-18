"""Exact compact rank-one unit from row 19's live terminal owner."""

from __future__ import annotations

import json
import hashlib
import sys
from fractions import Fraction
from typing import Any

from cypari2 import Pari


SCHEMA = "sagejs.pari-class-group/row19-live-rank1-unit-v1"
SOURCE_SCHEMA = "sagejs.pari-class-group/row19-terminal-continuation-owner-v1"
ROWS = 424
COLUMNS = 430
KERNEL = 6
LOG_STRIDE = 14
FIELD_ID = "3.1.1086061775432017340256300.107"
MULTIPLICATION_TENSOR = (
    1,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    1,
    0,
    1,
    0,
    0,
    0,
    254541,
    200560490130,
    0,
    0,
    0,
    0,
    1,
    200560490130,
    0,
    0,
    0,
    787930,
    0,
)


class Row19LiveRank1UnitFailure(ValueError):
    """The authenticated terminal owner cannot produce the compact unit."""


def _integers(value: Any, length: int, label: str) -> list[int]:
    if not isinstance(value, list) or len(value) != length:
        raise Row19LiveRank1UnitFailure(label + " has the wrong length")
    result: list[int] = []
    for entry in value:
        if isinstance(entry, bool) or not isinstance(entry, (str, int)):
            raise Row19LiveRank1UnitFailure(label + " is not integer data")
        integer = int(entry)
        if str(integer) != str(entry):
            raise Row19LiveRank1UnitFailure(label + " is not canonical")
        result.append(integer)
    return result


def _dyadic(triple: list[int]) -> Fraction:
    mantissa, precision, exponent = triple
    if precision == -1:
        if exponent != 0:
            raise Row19LiveRank1UnitFailure("noncanonical exact packed real")
        return Fraction(mantissa)
    if mantissa == 0 and precision == 0:
        return Fraction(0)
    if precision not in (64, 128, 192, 256) or mantissa == 0:
        raise Row19LiveRank1UnitFailure("unsupported packed real")
    shift = exponent - precision + 1
    return (
        Fraction(mantissa << shift) if shift >= 0 else Fraction(mantissa, 1 << -shift)
    )


def _nearest(value: Fraction) -> int:
    sign = -1 if value < 0 else 1
    quotient, remainder = divmod(abs(value.numerator), value.denominator)
    return sign * (quotient + int(2 * remainder >= value.denominator))


def _bezout(values: list[int]) -> tuple[int, list[int]]:
    coefficients = [0] * len(values)
    current = 0
    for index, value in enumerate(values):
        old_r, r, old_s, s, old_t, t = current, value, 1, 0, 0, 1
        while r:
            quotient = old_r // r
            old_r, r = r, old_r - quotient * r
            old_s, s = s, old_s - quotient * s
            old_t, t = t, old_t - quotient * t
        if old_r < 0:
            old_r, old_s, old_t = -old_r, -old_s, -old_t
        coefficients = [old_s * entry for entry in coefficients]
        coefficients[index] += old_t
        current = old_r
    return current, coefficients


def _determinant3(matrix: list[int]) -> int:
    return (
        matrix[0] * (matrix[4] * matrix[8] - matrix[7] * matrix[5])
        - matrix[3] * (matrix[1] * matrix[8] - matrix[7] * matrix[2])
        + matrix[6] * (matrix[1] * matrix[5] - matrix[4] * matrix[2])
    )


def _norm(value: list[int]) -> int:
    matrix = [
        sum(
            value[basis] * MULTIPLICATION_TENSOR[9 * basis + index]
            for basis in range(3)
        )
        for index in range(9)
    ]
    return _determinant3(matrix)


def compose_row19_live_rank1_unit(
    terminal: dict[str, Any], ancestry: dict[str, Any]
) -> dict[str, Any]:
    """Derive a primitive compact unit without W0 or expanded-unit input."""
    if terminal.get("schema") != SOURCE_SCHEMA:
        raise Row19LiveRank1UnitFailure("wrong terminal owner schema")
    if terminal.get("state") != [9, 15, 415, 0, 6, 7, 0, 430, 0]:
        raise Row19LiveRank1UnitFailure("terminal HNF state changed")
    if terminal.get("relationState") != ["430", "4350", "0", "0", "430", "430"]:
        raise Row19LiveRank1UnitFailure("terminal relation state changed")
    publication = terminal.get("publication", {})
    if (
        publication.get("collectionComplete") is not True
        or publication.get("terminalHnfComplete") is not True
        or publication.get("acceptanceComplete") is not True
        or publication.get("oracleDataConsumed") is not False
    ):
        raise Row19LiveRank1UnitFailure("terminal authority is incomplete")
    identity = terminal.get("relationIdentity", {})
    records = _integers(identity.get("records"), ROWS * COLUMNS, "relations")
    logs = _integers(identity.get("logs"), LOG_STRIDE * COLUMNS, "logs")
    generators = _integers(identity.get("generators"), 3 * COLUMNS, "generators")
    regulator_data = _integers(terminal.get("regulator"), 3, "regulator")
    for key, value in (
        ("relationsSha256", identity["records"]),
        ("logsSha256", identity["logs"]),
        ("generatorsSha256", identity["generators"]),
        ("regulatorSha256", terminal["regulator"]),
    ):
        digest = hashlib.sha256(
            json.dumps(value, separators=(",", ":")).encode()
        ).hexdigest()
        if ancestry.get(key) != digest:
            raise Row19LiveRank1UnitFailure(key + " changed")
    regulator = _dyadic(regulator_data)
    if regulator <= 0:
        raise Row19LiveRank1UnitFailure("accepted regulator is not positive")

    row_major = [
        records[column * ROWS + row] for row in range(ROWS) for column in range(COLUMNS)
    ]
    kernel = Pari(4_000_000_000).matrix(ROWS, COLUMNS, row_major).matkerint()
    if [int(value) for value in kernel.matsize()] != [COLUMNS, KERNEL]:
        raise Row19LiveRank1UnitFailure("saturated kernel dimension changed")
    basis = [
        [int(kernel[row, column]) for row in range(COLUMNS)] for column in range(KERNEL)
    ]
    if any(
        sum(
            records[column * ROWS + row] * basis[j][column] for column in range(COLUMNS)
        )
        for j in range(KERNEL)
        for row in range(ROWS)
    ):
        raise Row19LiveRank1UnitFailure("integer kernel is not a dependency")

    multiples: list[int] = []
    residuals: list[Fraction] = []
    for dependency in basis:
        real_log = sum(
            (
                dependency[column]
                * _dyadic(logs[LOG_STRIDE * column + 1 : LOG_STRIDE * column + 4])
                for column in range(COLUMNS)
            ),
            Fraction(0),
        )
        multiple = _nearest(real_log / regulator)
        multiples.append(multiple)
        residuals.append(real_log - multiple * regulator)
    divisor, transform = _bezout(multiples)
    if divisor != 1 or any(abs(value) >= Fraction(1, 1 << 120) for value in residuals):
        raise Row19LiveRank1UnitFailure("logarithmic cleanup is not primitive")
    dependency = [
        sum(basis[j][column] * transform[j] for j in range(KERNEL))
        for column in range(COLUMNS)
    ]
    if any(
        sum(
            records[column * ROWS + row] * dependency[column]
            for column in range(COLUMNS)
        )
        for row in range(ROWS)
    ):
        raise Row19LiveRank1UnitFailure("primitive unit is not a dependency")

    negative_parity = 0
    for column in range(COLUMNS):
        norm = _norm(generators[3 * column : 3 * column + 3])
        if norm == 0:
            raise Row19LiveRank1UnitFailure("zero principal generator")
        if norm < 0:
            negative_parity ^= dependency[column] & 1
    unit_norm = -1 if negative_parity else 1
    inverse = [-value for value in dependency]
    return {
        "schema": SCHEMA,
        "fieldId": FIELD_ID,
        "ancestry": dict(ancestry),
        "dimensions": {
            "factorBaseSize": ROWS,
            "relationCount": COLUMNS,
            "kernelRank": KERNEL,
            "unitRank": 1,
        },
        "cleanarch": {
            "kernelRegulatorMultiples": [str(value) for value in multiples],
            "bezoutTransform": [str(value) for value in transform],
            "gcd": str(divisor),
            "residualBound": "2^-120",
            "allResidualsCertified": True,
        },
        "factoredUnit": {
            "relationExponents": [str(value) for value in dependency],
            "inverseRelationExponents": [str(value) for value in inverse],
            "nonzeroExponents": sum(value != 0 for value in dependency),
            "maximumExponentBits": max(abs(value).bit_length() for value in dependency),
            "relationDependencyVerified": True,
            "exactNorm": str(unit_norm),
            "exactInverseNorm": str(unit_norm),
            "inverseProduct": "1",
            "inverseVerified": True,
            "expanded": False,
        },
        "outcome": {
            "status": "success",
            "precisionBits": 192,
            "fundamentalUnitDerived": True,
            "usedFrozenW0": False,
            "usedExpandedUnit": False,
        },
    }


def main() -> None:
    payload = json.load(sys.stdin)
    result = compose_row19_live_rank1_unit(payload["terminal"], payload["ancestry"])
    json.dump(result, sys.stdout, separators=(",", ":"))
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
