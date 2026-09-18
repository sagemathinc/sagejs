"""Exact row-0 maps for fractional ideals supported on the retained factor base.

This module has no PARI runtime owner.  It reconstructs the cubic integral-
basis multiplication tensor from the retained polynomial and integral basis,
then uses the source-transparent native cubic ideal-product kernel.  Prime-
ideal valuations are obtained by exact containment in successive prime powers.
The complete raw Smith identity supplies a signed principal-relation witness.

The accepted domain is an arbitrary canonical integral/fractional cubic ideal
whose numerator and denominator factor completely over the 66 retained prime
ideals and whose intermediate cubic HNF modulus is below ``2**64``.  Inputs
outside that explicit native corridor fail closed.

PARI 2.17.4 ideal-HNF and Smith algorithms, copyright (C) The PARI group;
GPL-2.0-or-later.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
import hashlib
import json
from typing import Any

from .real_cubic_getfu_honesty import pari_monic_cubic_basis_tensor
from .signed_prime_ideal_reduction import pari_cubic_ideal_hnf_multiply


DEGREE = 3
ROWS = 73
COLUMNS = 66
WORD_LIMIT = 1 << 64


class Row0GeneralMapFailure(ValueError):
    """An input or retained owner failed the supported-ideal map contract."""


def _integers(value: Any, length: int, name: str) -> list[int]:
    if not isinstance(value, list) or len(value) != length:
        raise Row0GeneralMapFailure(name + " has the wrong shape")
    answer: list[int] = []
    for entry in value:
        if isinstance(entry, bool) or not isinstance(entry, (str, int)):
            raise Row0GeneralMapFailure(name + " is not integer data")
        integer = int(entry)
        if str(integer) != str(entry):
            raise Row0GeneralMapFailure(name + " is not canonical integer data")
        answer.append(integer)
    return answer


def _owner(payload: Mapping[str, Any], name: str, length: int) -> list[int]:
    storage = payload.get("storage")
    if not isinstance(storage, list):
        raise Row0GeneralMapFailure("retained storage is absent")
    matches = [entry for entry in storage if entry.get("name") == name]
    if len(matches) != 1:
        raise Row0GeneralMapFailure("retained owner " + name + " is absent")
    owner = matches[0]
    entries = owner.get("entries")
    if owner.get("logicalLength") != str(length):
        raise Row0GeneralMapFailure("retained owner " + name + " changed")
    return _integers(entries, length, name)


def _determinant3(matrix: Sequence[int]) -> int:
    return (
        matrix[0] * (matrix[4] * matrix[8] - matrix[5] * matrix[7])
        - matrix[1] * (matrix[3] * matrix[8] - matrix[5] * matrix[6])
        + matrix[2] * (matrix[3] * matrix[7] - matrix[4] * matrix[6])
    )


def _canonical_hnf(value: Sequence[Any], name: str) -> list[int]:
    matrix = _integers(list(value), 9, name)
    if matrix[3] != 0 or matrix[6] != 0 or matrix[7] != 0:
        raise Row0GeneralMapFailure(name + " is not upper triangular")
    if matrix[0] <= 0 or matrix[4] <= 0 or matrix[8] <= 0:
        raise Row0GeneralMapFailure(name + " has a nonpositive diagonal")
    if not (0 <= matrix[1] < matrix[0] and 0 <= matrix[2] < matrix[0]):
        raise Row0GeneralMapFailure(name + " is not column-HNF reduced in row zero")
    if not 0 <= matrix[5] < matrix[4]:
        raise Row0GeneralMapFailure(name + " is not column-HNF reduced in row one")
    if _determinant3(matrix) <= 0:
        raise Row0GeneralMapFailure(name + " is singular")
    return matrix


def _identity() -> list[int]:
    return [1, 0, 0, 0, 1, 0, 0, 0, 1]


def _prime_power(norm: int) -> tuple[int, int]:
    for exponent in range(1, DEGREE + 1):
        root = round(norm ** (1 / exponent))
        for prime in range(max(2, root - 2), root + 3):
            if prime**exponent != norm:
                continue
            if all(prime % divisor for divisor in range(2, int(prime**0.5) + 1)):
                return prime, exponent
    raise Row0GeneralMapFailure("factor-base norm is not a prime power")


def _contains(outer: Sequence[int], inner: Sequence[int]) -> bool:
    """Return whether the column lattice ``inner`` lies in ``outer``."""
    for column in range(3):
        vector = [inner[3 * row + column] for row in range(3)]
        coordinates = [0, 0, 0]
        for row in range(2, -1, -1):
            value = vector[row]
            for later in range(row + 1, 3):
                value -= outer[3 * row + later] * coordinates[later]
            diagonal = outer[3 * row + row]
            if value % diagonal:
                return False
            coordinates[row] = value // diagonal
    return True


def _multiply(
    source: Mapping[str, Any], left: Sequence[int], right: Sequence[int]
) -> list[int]:
    if left[0] * right[0] >= WORD_LIMIT:
        raise Row0GeneralMapFailure(
            "ideal product leaves the native word-modulus corridor"
        )
    output = [0] * 9
    try:
        pari_cubic_ideal_hnf_multiply(
            list(left),
            list(right),
            list(source["table"]),
            [0] * 27,
            [0] * 18,
            [0] * 30,
            [0] * 12,
            [0] * 3,
            [0] * 9,
            output,
        )
    except (ArithmeticError, ValueError) as error:
        raise Row0GeneralMapFailure("native cubic ideal product failed") from error
    return _canonical_hnf(output, "native ideal product")


def _power(source: Mapping[str, Any], ideal: Sequence[int], exponent: int) -> list[int]:
    answer = _identity()
    power = list(ideal)
    remaining = exponent
    while remaining:
        if remaining & 1:
            answer = _multiply(source, answer, power)
        remaining >>= 1
        if remaining:
            power = _multiply(source, power, power)
    return answer


def _row_times_matrix(
    row: Sequence[int], matrix: Sequence[int], width: int
) -> list[int]:
    if len(row) * width != len(matrix):
        raise Row0GeneralMapFailure("matrix product has incompatible dimensions")
    return [
        sum(row[inner] * matrix[inner * width + column] for inner in range(len(row)))
        for column in range(width)
    ]


def _digest(value: Any) -> str:
    raw = json.dumps(value, separators=(",", ":"), sort_keys=True).encode("ascii")
    return hashlib.sha256(raw).hexdigest()


def _lines_digest(value: Any) -> str:
    if not isinstance(value, list):
        raise Row0GeneralMapFailure("raw Smith material is not a list")
    return hashlib.sha256("\n".join(map(str, value)).encode("ascii")).hexdigest()


def _source(payload: Mapping[str, Any], proof: Mapping[str, Any]) -> dict[str, Any]:
    if (
        payload.get("field", {}).get("degree") != "3"
        or payload.get("classGroup", {}).get("classNumber") != "1"
        or proof.get("identity") != "U R V = D"
        or proof.get("diagonalFactors") != ["1"] * COLUMNS
    ):
        raise Row0GeneralMapFailure("wrong row-0 result or raw Smith proof")
    polynomial = _owner(payload, "replay-final_polynomial", 4)
    basis = _owner(payload, "replay-prep_zk", 9)
    table = [0] * 27
    pari_monic_cubic_basis_tensor(polynomial, basis, [0] * 32, table)
    ideals_flat = _owner(payload, "replay-packet_ideals", COLUMNS * 9)
    norms = _owner(payload, "replay-packet_norms", COLUMNS)
    ideals = [
        _canonical_hnf(ideals_flat[9 * index : 9 * (index + 1)], "factor-base ideal")
        for index in range(COLUMNS)
    ]
    prime_data = [_prime_power(norm) for norm in norms]
    for ideal, norm in zip(ideals, norms, strict=True):
        if _determinant3(ideal) != norm:
            raise Row0GeneralMapFailure("factor-base norm changed")
    relations = _owner(payload, "replay-relation_records", ROWS * COLUMNS)
    generators = _owner(payload, "replay-generators", ROWS * DEGREE)
    material = proof.get("material", {})
    hashes = proof.get("materialSha256", {})
    u = _integers(material.get("u"), ROWS * ROWS, "raw Smith U")
    v = _integers(material.get("v"), COLUMNS * COLUMNS, "raw Smith V")
    for name in ("u", "v", "d"):
        if hashes.get(name) != _lines_digest(material.get(name)):
            raise Row0GeneralMapFailure("raw Smith material digest changed")
    return {
        "basis": basis,
        "generators": generators,
        "ideals": ideals,
        "norms": norms,
        "polynomial": polynomial,
        "primeData": prime_data,
        "relations": relations,
        "table": table,
        "u": u,
        "v": v,
    }


def _rational_valuation(value: int, prime: int) -> int:
    exponent = 0
    while value % prime == 0:
        value //= prime
        exponent += 1
    return exponent


def _prime_valuation(
    source: Mapping[str, Any], ideal: Sequence[int], position: int, maximum: int
) -> int:
    prime_ideal = source["ideals"][position]
    value = 0
    power = _identity()
    while value < maximum:
        power = _multiply(source, power, prime_ideal)
        if not _contains(power, ideal):
            break
        value += 1
    return value


def _factor(source: Mapping[str, Any], ideal_hnf: Sequence[Any]) -> list[int]:
    ideal = _canonical_hnf(ideal_hnf, "input ideal")
    norm = _determinant3(ideal)
    residual = norm
    rational: dict[int, int] = {}
    for prime in dict.fromkeys(prime for prime, _ in source["primeData"]):
        exponent = _rational_valuation(residual, prime)
        if exponent:
            rational[prime] = exponent
            residual //= prime**exponent
    if residual != 1:
        raise Row0GeneralMapFailure("ideal norm has support outside the factor base")
    exponents = [0] * COLUMNS
    for prime, norm_valuation in rational.items():
        weighted = 0
        for index, (entry, residue_degree) in enumerate(source["primeData"]):
            if entry != prime:
                continue
            value = _prime_valuation(
                source, ideal, index, norm_valuation // residue_degree
            )
            exponents[index] = value
            weighted += residue_degree * value
        if weighted != norm_valuation:
            raise Row0GeneralMapFailure("factor-base prime group is incomplete")
    reconstructed = _identity()
    for prime_ideal, exponent in zip(source["ideals"], exponents, strict=True):
        if exponent:
            reconstructed = _multiply(
                source, reconstructed, _power(source, prime_ideal, exponent)
            )
    if reconstructed != ideal:
        raise Row0GeneralMapFailure(
            "prime-ideal factorization does not reconstruct input"
        )
    return exponents


def _rational_prime_exponents(source: Mapping[str, Any], prime: int) -> list[int]:
    rational = [prime, 0, 0, 0, prime, 0, 0, 0, prime]
    answer = [0] * COLUMNS
    weighted = 0
    for index, (entry, residue_degree) in enumerate(source["primeData"]):
        if entry != prime:
            continue
        value = _prime_valuation(source, rational, index, DEGREE // residue_degree)
        answer[index] = value
        weighted += value * residue_degree
    if weighted != DEGREE:
        raise Row0GeneralMapFailure("denominator prime decomposition is incomplete")
    return answer


def _relation_witness(source: Mapping[str, Any], exponents: Sequence[int]) -> list[int]:
    values = _integers(list(exponents), COLUMNS, "factor exponent tape")
    transformed = _row_times_matrix(values, source["v"], COLUMNS)
    coefficients = _row_times_matrix(
        transformed + [0] * (ROWS - COLUMNS), source["u"], ROWS
    )
    replay = [0] * COLUMNS
    for relation, coefficient in enumerate(coefficients):
        if coefficient == 0:
            continue
        offset = relation * COLUMNS
        for column in range(COLUMNS):
            replay[column] += coefficient * source["relations"][offset + column]
    if replay != values:
        raise Row0GeneralMapFailure("principal-relation witness failed exact replay")
    return coefficients


def _reduce(source: Mapping[str, Any], exponents: Sequence[int]) -> dict[str, Any]:
    values = _integers(list(exponents), COLUMNS, "factor exponent tape")
    coefficients = _relation_witness(source, values)
    support = [index for index, coefficient in enumerate(coefficients) if coefficient]
    return {
        "classCoordinates": [],
        "factorBaseExponents": values,
        "principalGeneratorRelationIndices": support,
        "principalGeneratorExponents": [coefficients[index] for index in support],
        "principalGenerators": [
            source["generators"][3 * index : 3 * index + 3] for index in support
        ],
        "principalRelationCoefficients": coefficients,
        "representativeFactorBaseExponents": [0] * COLUMNS,
    }


def factor_supported_ideal(
    payload: Mapping[str, Any], proof: Mapping[str, Any], ideal_hnf: Sequence[Any]
) -> dict[str, Any]:
    """Factor and reduce any integral ideal in the retained native corridor."""
    source = _source(payload, proof)
    return _reduce(source, _factor(source, ideal_hnf))


def factor_supported_fractional_ideal(
    payload: Mapping[str, Any],
    proof: Mapping[str, Any],
    numerator_hnf: Sequence[Any],
    denominator: Any,
) -> dict[str, Any]:
    """Factor ``numerator_hnf / denominator`` over the retained prime base."""
    if isinstance(denominator, bool) or not isinstance(denominator, (str, int)):
        raise Row0GeneralMapFailure("fractional denominator is not integer data")
    divisor = int(denominator)
    if str(divisor) != str(denominator) or divisor <= 0 or divisor >= WORD_LIMIT:
        raise Row0GeneralMapFailure(
            "fractional denominator is outside the native corridor"
        )
    source = _source(payload, proof)
    exponents = _factor(source, numerator_hnf)
    residual = divisor
    for prime in dict.fromkeys(prime for prime, _ in source["primeData"]):
        valuation = _rational_valuation(residual, prime)
        if not valuation:
            continue
        residual //= prime**valuation
        decomposition = _rational_prime_exponents(source, prime)
        for index, exponent in enumerate(decomposition):
            exponents[index] -= valuation * exponent
    if residual != 1:
        raise Row0GeneralMapFailure("denominator has support outside the factor base")
    result = _reduce(source, exponents)
    result["fractionalDenominator"] = divisor
    return result


def reduce_supported_exponents(
    payload: Mapping[str, Any], proof: Mapping[str, Any], exponents: Sequence[int]
) -> dict[str, Any]:
    """Reduce a signed retained-factor-base exponent tape."""
    return _reduce(_source(payload, proof), exponents)


def combine_supported(
    payload: Mapping[str, Any],
    proof: Mapping[str, Any],
    left: Sequence[int],
    right: Sequence[int],
) -> dict[str, Any]:
    """Combine two supported fractional ideals in exact factor coordinates."""
    left_values = _integers(list(left), COLUMNS, "left factor tape")
    right_values = _integers(list(right), COLUMNS, "right factor tape")
    return _reduce(
        _source(payload, proof),
        [a + b for a, b in zip(left_values, right_values, strict=True)],
    )


def replay_general_maps(
    payload: Mapping[str, Any], proof: Mapping[str, Any]
) -> dict[str, Any]:
    """Exercise integral/fractional factor, reduce, combine and rejection paths."""
    source = _source(payload, proof)
    identity = factor_supported_ideal(payload, proof, _identity())
    if identity["factorBaseExponents"] != [0] * COLUMNS:
        raise Row0GeneralMapFailure("identity ideal factorization changed")
    for index, ideal in enumerate(source["ideals"]):
        expected = [0] * COLUMNS
        expected[index] = 1
        if _factor(source, ideal) != expected:
            raise Row0GeneralMapFailure("factor-base prime round trip changed")
    left_ideal = _multiply(
        source,
        source["ideals"][0],
        _power(source, source["ideals"][5], 2),
    )
    right_ideal = _multiply(source, source["ideals"][6], source["ideals"][9])
    left = factor_supported_ideal(payload, proof, left_ideal)
    right = factor_supported_ideal(payload, proof, right_ideal)
    combined = combine_supported(
        payload, proof, left["factorBaseExponents"], right["factorBaseExponents"]
    )
    expected = [
        a + b
        for a, b in zip(
            left["factorBaseExponents"], right["factorBaseExponents"], strict=True
        )
    ]
    if combined["factorBaseExponents"] != expected:
        raise Row0GeneralMapFailure("combine law changed")
    denominator = source["primeData"][5][0]
    fractional = factor_supported_fractional_ideal(
        payload, proof, left_ideal, denominator
    )
    if fractional["classCoordinates"] != []:
        raise Row0GeneralMapFailure("fractional ideal acquired a nontrivial class")
    outside = max(prime for prime, _ in source["primeData"]) + 1
    while any(outside % divisor == 0 for divisor in range(2, int(outside**0.5) + 1)):
        outside += 1
    rejected = 0
    try:
        factor_supported_ideal(
            payload, proof, [outside, 0, 0, 0, outside, 0, 0, 0, outside]
        )
    except Row0GeneralMapFailure:
        rejected += 1
    try:
        factor_supported_fractional_ideal(payload, proof, _identity(), outside)
    except Row0GeneralMapFailure:
        rejected += 1
    if rejected != 2:
        raise Row0GeneralMapFailure("out-of-support input was accepted")
    body = {
        "schema": "sagejs.pari-class-group/row0-general-ideal-maps-v1",
        "domain": "arbitrary-fractional-cubic-ideal-hnf-supported-on-retained-factor-base-with-word-hnf-modulus",
        "classNumber": "1",
        "factorBaseSize": str(COLUMNS),
        "relationCount": str(ROWS),
        "maps": {"combine": True, "factor": True, "reduce": True},
        "factorBasePrimeRoundTrips": COLUMNS,
        "arbitraryIntegralProductsReplayed": 2,
        "fractionalPrincipalDenominatorRoundTrips": 1,
        "outOfSupportRejections": rejected,
        "exactRelationWitnessesReplayed": COLUMNS + 6,
        "nativeArithmetic": [
            "pari_monic_cubic_basis_tensor",
            "pari_cubic_ideal_hnf_multiply",
        ],
        "qualifiedTiming": False,
    }
    return {**body, "contentSha256": _digest(body)}


__all__ = [
    "Row0GeneralMapFailure",
    "combine_supported",
    "factor_supported_fractional_ideal",
    "factor_supported_ideal",
    "reduce_supported_exponents",
    "replay_general_maps",
]
