"""Final live rank-one unit result for development-panel row 19.

The owner consumed here already proves the primitive relation dependency.  This
suffix authenticates it against the live terminal relation/log/generator state,
checks the exact norm valuation and the regulator correspondence, and applies
PARI 2.17.4's flag-zero ``getfu`` size policy.  The latter returns
``not_given(LARGE)`` before factorback, so no expanded power-basis coordinate is
required or published.
"""

from __future__ import annotations

from fractions import Fraction
import hashlib
import json
import sys
from typing import Any


SCHEMA = "sagejs.pari-class-group/row19-live-unit-result-v1"
COMPACT_SCHEMA = "sagejs.pari-class-group/row19-live-rank1-unit-v1"
TERMINAL_SCHEMA = "sagejs.pari-class-group/row19-terminal-continuation-owner-v1"
FIELD_ID = "3.1.1086061775432017340256300.107"
ROWS = 424
COLUMNS = 430
LOG_STRIDE = 14
PRECISION = 192
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


class Row19LiveUnitResultFailure(ValueError):
    """The live row-19 unit owners do not support a final result."""


def _integers(value: Any, length: int, label: str) -> list[int]:
    if not isinstance(value, list) or len(value) != length:
        raise Row19LiveUnitResultFailure(label + " has the wrong length")
    result: list[int] = []
    for entry in value:
        if isinstance(entry, bool) or not isinstance(entry, (str, int)):
            raise Row19LiveUnitResultFailure(label + " is not integer data")
        integer = int(entry)
        if str(integer) != str(entry):
            raise Row19LiveUnitResultFailure(label + " is not canonical")
        result.append(integer)
    return result


def _hash(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, separators=(",", ":")).encode()).hexdigest()


def _dyadic(triple: list[int]) -> Fraction:
    mantissa, precision, exponent = triple
    if precision == -1:
        if exponent != 0:
            raise Row19LiveUnitResultFailure("noncanonical exact packed real")
        return Fraction(mantissa)
    if mantissa == 0 and precision == 0:
        return Fraction(0)
    if (
        precision not in (64, 128, 192, 256, 320)
        or mantissa == 0
        or abs(mantissa).bit_length() != precision
    ):
        raise Row19LiveUnitResultFailure("unsupported packed real")
    shift = exponent - precision + 1
    return (
        Fraction(mantissa << shift) if shift >= 0 else Fraction(mantissa, 1 << -shift)
    )


def _expo(value: Fraction) -> int:
    if value == 0:
        raise Row19LiveUnitResultFailure("zero has no finite PARI exponent")
    numerator, denominator = abs(value.numerator), value.denominator
    exponent = numerator.bit_length() - denominator.bit_length()
    if exponent >= 0:
        threshold = denominator << exponent
        if numerator < threshold:
            exponent -= 1
    elif numerator << -exponent < denominator:
        exponent -= 1
    return exponent


def _fraction(value: Fraction) -> list[str]:
    return [str(value.numerator), str(value.denominator)]


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


def _primes(limit: int) -> list[int]:
    sieve = bytearray(b"\x01") * (limit + 1)
    sieve[:2] = b"\x00\x00"
    for prime in range(2, int(limit**0.5) + 1):
        if sieve[prime]:
            sieve[prime * prime : limit + 1 : prime] = b"\x00" * (
                (limit - prime * prime) // prime + 1
            )
    return [index for index, value in enumerate(sieve) if value]


def _factor_small(value: int, primes: list[int]) -> dict[int, int]:
    remaining = abs(value)
    factors: dict[int, int] = {}
    for prime in primes:
        if prime * prime > remaining:
            break
        while remaining % prime == 0:
            factors[prime] = factors.get(prime, 0) + 1
            remaining //= prime
    if remaining != 1:
        factors[remaining] = factors.get(remaining, 0) + 1
    return factors


def compose_row19_live_unit_result(
    compact: dict[str, Any], terminal: dict[str, Any], ancestry: dict[str, Any]
) -> dict[str, Any]:
    """Close the live compact unit at PARI's source-required getfu boundary."""
    if compact.get("schema") != COMPACT_SCHEMA or compact.get("fieldId") != FIELD_ID:
        raise Row19LiveUnitResultFailure("wrong compact unit authority")
    if terminal.get("schema") != TERMINAL_SCHEMA:
        raise Row19LiveUnitResultFailure("wrong terminal authority")
    if terminal.get("state") != [9, 15, 415, 0, 6, 7, 0, 430, 0]:
        raise Row19LiveUnitResultFailure("terminal state changed")
    if terminal.get("publication", {}).get("oracleDataConsumed") is not False:
        raise Row19LiveUnitResultFailure("terminal authority consumed an oracle")
    if compact.get("ancestry", {}).get("terminalOwnerSha256") != ancestry.get(
        "terminalOwnerSha256"
    ):
        raise Row19LiveUnitResultFailure("compact unit is detached from terminal owner")

    identity = terminal.get("relationIdentity", {})
    records = _integers(identity.get("records"), ROWS * COLUMNS, "relations")
    logs = _integers(identity.get("logs"), LOG_STRIDE * COLUMNS, "logs")
    generators = _integers(identity.get("generators"), 3 * COLUMNS, "generators")
    regulator_data = _integers(terminal.get("regulator"), 3, "regulator")
    for key, value in (
        ("relationsSha256", identity.get("records")),
        ("logsSha256", identity.get("logs")),
        ("generatorsSha256", identity.get("generators")),
        ("regulatorSha256", terminal.get("regulator")),
    ):
        if ancestry.get(key) != _hash(value):
            raise Row19LiveUnitResultFailure(key + " changed")

    factored = compact.get("factoredUnit", {})
    exponents = _integers(factored.get("relationExponents"), COLUMNS, "unit exponents")
    inverse = _integers(
        factored.get("inverseRelationExponents"), COLUMNS, "inverse exponents"
    )
    if inverse != [-value for value in exponents]:
        raise Row19LiveUnitResultFailure("factored inverse changed")
    if any(
        sum(
            records[column * ROWS + row] * exponents[column]
            for column in range(COLUMNS)
        )
        for row in range(ROWS)
    ):
        raise Row19LiveUnitResultFailure("unit product is not the unit ideal")

    generator_norms = [
        _norm(generators[3 * column : 3 * column + 3]) for column in range(COLUMNS)
    ]
    if any(value == 0 for value in generator_norms):
        raise Row19LiveUnitResultFailure("zero principal generator")
    valuations: dict[int, int] = {}
    trial_primes = _primes(60_000)
    for norm, exponent in zip(generator_norms, exponents, strict=True):
        for prime, valuation in _factor_small(norm, trial_primes).items():
            valuations[prime] = valuations.get(prime, 0) + exponent * valuation
    if any(valuations.values()):
        raise Row19LiveUnitResultFailure("unit product has nonzero norm valuation")
    negative_parity = (
        sum(
            exponent & 1
            for norm, exponent in zip(generator_norms, exponents, strict=True)
            if norm < 0
        )
        & 1
    )
    exact_norm = -1 if negative_parity else 1
    if exact_norm != 1 or factored.get("exactNorm") != "1":
        raise Row19LiveUnitResultFailure("unit norm changed")

    combined: list[Fraction] = []
    for place in range(2):
        for part in range(2):
            offset = 7 * place + 1 + 3 * part
            combined.append(
                sum(
                    (
                        exponents[column]
                        * _dyadic(
                            logs[
                                LOG_STRIDE * column + offset : LOG_STRIDE * column
                                + offset
                                + 3
                            ]
                        )
                        for column in range(COLUMNS)
                    ),
                    Fraction(0),
                )
            )
    regulator = _dyadic(regulator_data)
    regulator_residual = combined[0] - regulator
    product_formula_residual = combined[0] + combined[2]
    if abs(regulator_residual) >= Fraction(1, 1 << 120):
        raise Row19LiveUnitResultFailure("unit log does not match regulator")
    if abs(product_formula_residual) >= Fraction(1, 1 << 160):
        raise Row19LiveUnitResultFailure("unit logs fail the product formula")

    # getfu's rank-one real LLL changes this column by at most a sign.  Its
    # fixarch scalar is -sum(real_i(A))/3; the complex place receives half of
    # that scalar.  expbitprec visits the real place first and returns LARGE
    # whenever its real exponent exceeds 20, before phases or factorback matter.
    scalar = -product_formula_residual / 3
    cleaned_real = [combined[0] + scalar, combined[2] + scalar / 2]
    real_exponents = [_expo(value) for value in cleaned_real]
    if real_exponents[0] <= 20:
        raise Row19LiveUnitResultFailure("getfu LARGE guard is not reached")

    return {
        "schema": SCHEMA,
        "fieldId": FIELD_ID,
        "ancestry": dict(ancestry),
        "compactAlgebraicUnit": {
            "representation": "signed-product-of-principal-relation-generators",
            "relationExponents": [str(value) for value in exponents],
            "inverseRelationExponents": [str(value) for value in inverse],
            "relationDependencyVerified": True,
            "principalIdeal": "1",
            "principalIdealVerified": True,
            "exactNorm": str(exact_norm),
            "exactInverseNorm": str(exact_norm),
            "inverseProduct": "1",
            "inverseVerified": True,
            "generatorNormsSha256": _hash([str(value) for value in generator_norms]),
            "distinctNormPrimes": len(valuations),
            "maximumNormPrime": str(max(valuations)),
            "allNormValuationsZero": True,
        },
        "logCertificate": {
            "unitReal": [_fraction(combined[0]), _fraction(combined[2])],
            "unitImaginary": [_fraction(combined[1]), _fraction(combined[3])],
            "regulator": _fraction(regulator),
            "regulatorResidual": _fraction(regulator_residual),
            "regulatorResidualBound": "2^-120",
            "productFormulaResidual": _fraction(product_formula_residual),
            "productFormulaResidualBound": "2^-160",
            "regulatorMatched": True,
            "productFormulaVerified": True,
        },
        "materialization": {
            "tag": "not_given",
            "reason": "LARGE",
            "precisionBits": PRECISION,
            "pariReasonCode": 2,
            "source": "PARI-2.17.4-buch2.c:getfu/RgM_expbitprec",
            "realExponents": real_exponents,
            "maximumAllowedRealExponent": 20,
            "firstRejectingPlace": 0,
            "rankOneLllAbsoluteFactor": 1,
            "expandedUnit": None,
            "expandedInverse": None,
            "expandedUnitsPublished": False,
            "compactFactoredUnitsRetained": True,
            "matchedFlagZero": True,
        },
        "outcome": {
            "status": "success",
            "correspondenceComplete": True,
            "publicComplete": True,
            "usedFrozenW0": False,
            "expandedCoordinatesRequired": False,
        },
    }


def main() -> None:
    payload = json.load(sys.stdin)
    result = compose_row19_live_unit_result(
        payload["compact"], payload["terminal"], payload["ancestry"]
    )
    json.dump(result, sys.stdout, separators=(",", ":"))
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
