"""Exact row-14 class maps on the retained prime-ideal support.

The public factor boundary accepts an arbitrary integral quartic ideal in
column-major HNF form.  It succeeds exactly when every prime-ideal factor is
one of the 799 primes retained by the fresh row-14 transaction.  The prepared
local ``tau`` matrices come from the authenticated initial factor descriptors,
not from a class-group answer fixture.  Fractional ideals are represented by
an integral numerator HNF and a positive rational denominator.

The complete raw Smith identity ``U R V = D`` supplies quotient coordinates
and signed combinations of the 806 retained principal relations.  Reduction
uses two retained factor-base primes whose Smith coordinates are respectively
``(1, -2)`` and ``(0, 1)``; consequently every class has an explicit supported
integral representative.

PARI 2.17.4 valuation algorithm, copyright (C) The PARI group;
GPL-2.0-or-later.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
import hashlib
import json
from typing import Any

from .valuation import pari_prepared_hnf_valuation


ROWS = 806
COLUMNS = 799
DEGREE = 4
TAIL = 796
INVARIANTS = (8, 24)
REPRESENTATIVE_ROWS = (767, 796)
METADATA_SCHEMA = "sagejs.pari-class-group/row14-connected-factor-metadata-v1"
CAPSULE_SHA256 = "33d2606a151ecf0ba5a73c247ecf3f219ff84a2341048ebbbe374ecd9c7939b1"
PREPARED_AUTHORITY_SHA256 = (
    "6c8ac1e7e6a47a486de92cd180f9524a1be132d8fe1f7ccbd822166e77d4da92"
)
FACTOR_METADATA_SHA256 = (
    "fc9af22f4334ab2b13ab8c01e0f4b6900e5f9d24aa16b284fccb2047e7308751"
)


class Row14GeneralMapFailure(ValueError):
    """An input or retained owner failed the supported-ideal map contract."""


def _integers(value: Any, length: int, name: str) -> list[int]:
    if not isinstance(value, list) or len(value) != length:
        raise Row14GeneralMapFailure(name + " has the wrong shape")
    result: list[int] = []
    for entry in value:
        if isinstance(entry, bool) or not isinstance(entry, (str, int)):
            raise Row14GeneralMapFailure(name + " is not integer data")
        integer = int(entry)
        if str(integer) != str(entry):
            raise Row14GeneralMapFailure(name + " is not canonical integer data")
        result.append(integer)
    return result


def _owner(payload: Mapping[str, Any], name: str) -> list[Any]:
    storage = payload.get("storage")
    if not isinstance(storage, list):
        raise Row14GeneralMapFailure("retained storage is absent")
    matches = [entry for entry in storage if entry.get("name") == name]
    if len(matches) != 1:
        raise Row14GeneralMapFailure("retained owner " + name + " is absent")
    owner = matches[0]
    entries = owner.get("entries")
    if not isinstance(entries, list) or owner.get("logicalLength") != str(len(entries)):
        raise Row14GeneralMapFailure("retained owner " + name + " changed")
    return entries


def _determinant(matrix: Sequence[int]) -> int:
    """Fraction-free determinant for a four-by-four integer matrix."""
    if len(matrix) != DEGREE * DEGREE:
        raise Row14GeneralMapFailure("quartic ideal HNF has the wrong shape")
    work = [list(matrix[row * DEGREE : (row + 1) * DEGREE]) for row in range(DEGREE)]
    sign = 1
    denominator = 1
    for pivot in range(DEGREE - 1):
        selected = next(
            (row for row in range(pivot, DEGREE) if work[row][pivot] != 0), None
        )
        if selected is None:
            return 0
        if selected != pivot:
            work[pivot], work[selected] = work[selected], work[pivot]
            sign = -sign
        value = work[pivot][pivot]
        for row in range(pivot + 1, DEGREE):
            for column in range(pivot + 1, DEGREE):
                numerator = (
                    work[row][column] * value - work[row][pivot] * work[pivot][column]
                )
                if numerator % denominator:
                    raise Row14GeneralMapFailure("fraction-free determinant failed")
                work[row][column] = numerator // denominator
        denominator = value
    return sign * work[-1][-1]


def _transpose(matrix: Sequence[int]) -> list[int]:
    return [
        matrix[column * DEGREE + row]
        for row in range(DEGREE)
        for column in range(DEGREE)
    ]


def _row_times_matrix(
    row: Sequence[int], matrix: Sequence[int], width: int
) -> list[int]:
    if len(row) * width != len(matrix):
        raise Row14GeneralMapFailure("matrix product has incompatible dimensions")
    return [
        sum(row[inner] * matrix[inner * width + column] for inner in range(len(row)))
        for column in range(width)
    ]


def _source(
    payload: Mapping[str, Any],
    proof: Mapping[str, Any],
    metadata_owner: Mapping[str, Any],
) -> dict[str, Any]:
    metadata = metadata_owner.get("metadata", metadata_owner)
    authority = metadata.get("authority", {}) if isinstance(metadata, Mapping) else {}
    factor = metadata.get("factor", {}) if isinstance(metadata, Mapping) else {}
    if (
        payload.get("field", {}).get("degree") != "4"
        or payload.get("classGroup", {}).get("classNumber") != "192"
        or proof.get("completed", {}).get("fullSmithIdentity") is not True
        or proof.get("diagonalFactors") != ["1"] * 797 + ["8", "24"]
        or not isinstance(metadata, Mapping)
        or metadata.get("schema") != METADATA_SCHEMA
        or authority.get("capsuleSha256") != CAPSULE_SHA256
        or authority.get("preparedAuthoritySha256") != PREPARED_AUTHORITY_SHA256
        or authority.get("tauAuthority") != "authenticated-initial-factor-descriptor"
        or _digest(factor) != FACTOR_METADATA_SHA256
    ):
        raise Row14GeneralMapFailure("wrong row-14 result, Smith proof, or metadata")

    ideals = [
        _integers(value, 16, "factor-base ideal")
        for value in (
            _integers(_owner(payload, "factor-base-ideals"), COLUMNS * 16, "ideals")[
                offset : offset + 16
            ]
            for offset in range(0, COLUMNS * 16, 16)
        )
    ]
    primes = _integers(_owner(payload, "factor-base-primes"), COLUMNS, "primes")
    norms = _integers(_owner(payload, "factor-base-norms"), COLUMNS, "norms")
    metadata_ideals = _integers(
        factor.get("packetIdeals"), COLUMNS * 16, "packet ideals"
    )
    metadata_primes = _integers(
        factor.get("relationPrimes"), COLUMNS, "relation primes"
    )
    metadata_norms = _integers(factor.get("packetNorms"), COLUMNS, "packet norms")
    if (
        metadata_ideals != [entry for ideal in ideals for entry in ideal]
        or metadata_primes != primes
        or metadata_norms != norms
    ):
        raise Row14GeneralMapFailure(
            "prepared factor metadata differs from retained owners"
        )

    material = proof.get("material", {})
    u = _integers(material.get("u"), ROWS * ROWS, "raw Smith U")
    v = _integers(material.get("v"), COLUMNS * COLUMNS, "raw Smith V")
    if proof.get("materialSha256", {}).get("u") != _digest(
        material.get("u")
    ) or proof.get("materialSha256", {}).get("v") != _digest(material.get("v")):
        raise Row14GeneralMapFailure("raw Smith material digest changed")
    relations = _integers(
        _owner(payload, "raw-relation-records"), ROWS * COLUMNS, "relations"
    )
    if proof.get("source", {}).get("relationMatrixSha256") != _digest(
        [str(value) for value in relations]
    ):
        raise Row14GeneralMapFailure("raw relation owner differs from Smith proof")
    generators = _integers(
        _owner(payload, "principal-generators"), ROWS * DEGREE, "generators"
    )
    source = {
        "ideals": ideals,
        "primes": primes,
        "norms": norms,
        "ramification": _integers(factor.get("ramification"), COLUMNS, "ramification"),
        "residueDegrees": _integers(
            factor.get("residueDegrees"), COLUMNS, "residue degrees"
        ),
        "tau": _integers(factor.get("groupTau"), COLUMNS * 16, "tau"),
        "inert": _integers(factor.get("packetInert"), COLUMNS, "inert flags"),
        "groupOffsets": _integers(
            factor.get("groupOffsets"),
            len(factor.get("groupOffsets", [])),
            "group offsets",
        ),
        "groupCounts": _integers(
            factor.get("groupCounts"),
            len(factor.get("groupCounts", [])),
            "group counts",
        ),
        "groupComplete": _integers(
            factor.get("groupComplete"),
            len(factor.get("groupComplete", [])),
            "group complete",
        ),
        "relations": relations,
        "generators": generators,
        "u": u,
        "v": v,
    }
    if not (
        len(source["groupOffsets"])
        == len(source["groupCounts"])
        == len(source["groupComplete"])
    ):
        raise Row14GeneralMapFailure("rational-prime groups changed")
    return source


def _factor(source: Mapping[str, Any], ideal_hnf: Sequence[Any]) -> list[int]:
    # Public HNFs follow the retained class-ideal convention (columns).  The
    # valuation kernel follows the native row-major convention.
    external = _integers(list(ideal_hnf), 16, "input ideal")
    for row in range(DEGREE):
        if external[row * DEGREE + row] <= 0:
            raise Row14GeneralMapFailure("ideal HNF has a nonpositive diagonal")
        for column in range(row + 1, DEGREE):
            if external[row * DEGREE + column] != 0:
                raise Row14GeneralMapFailure("ideal HNF is not lower triangular")
        for column in range(row):
            entry = external[row * DEGREE + column]
            if entry < 0 or entry >= external[column * DEGREE + column]:
                raise Row14GeneralMapFailure("ideal HNF is not column reduced")
    ideal = _transpose(external)
    norm = abs(_determinant(ideal))
    if norm == 0:
        raise Row14GeneralMapFailure("zero ideal is not supported")
    residual = norm
    rational_valuations: dict[int, int] = {}
    for prime in dict.fromkeys(source["primes"]):
        value = 0
        while residual % prime == 0:
            residual //= prime
            value += 1
        if value:
            rational_valuations[prime] = value
    if residual != 1:
        raise Row14GeneralMapFailure("ideal norm has support outside the factor base")
    exponents = [0] * COLUMNS
    for prime, norm_valuation in rational_valuations.items():
        positions = [
            index for index, value in enumerate(source["primes"]) if value == prime
        ]
        weighted = 0
        for index in positions:
            value = pari_prepared_hnf_valuation(
                ideal,
                source["tau"][16 * index : 16 * (index + 1)],
                [0] * 16,
                [0] * 16,
                [0] * 4,
                [0] * 4,
                DEGREE,
                prime,
                source["ramification"][index],
                source["residueDegrees"][index],
                source["inert"][index],
            )
            if value < 0:
                raise Row14GeneralMapFailure("integral ideal has a negative valuation")
            exponents[index] = value
            weighted += source["residueDegrees"][index] * value
        if weighted != norm_valuation:
            raise Row14GeneralMapFailure("factor-base prime group is incomplete")
    if _factor_norm(source, exponents) != norm:
        raise Row14GeneralMapFailure(
            "prime-ideal factorization does not reconstruct norm"
        )
    return exponents


def _factor_norm(source: Mapping[str, Any], exponents: Sequence[int]) -> int:
    result = 1
    for norm, exponent in zip(source["norms"], exponents, strict=True):
        result *= norm**exponent
    return result


def _coordinates(source: Mapping[str, Any], exponents: Sequence[int]) -> list[int]:
    transformed = _row_times_matrix(exponents, source["v"], COLUMNS)
    return [transformed[TAIL + 1] % 8, transformed[TAIL + 2] % 24]


def _representative(coordinates: Sequence[int]) -> list[int]:
    # row 767 -> (1,-2), row 796 -> (0,1).
    result = [0] * COLUMNS
    result[REPRESENTATIVE_ROWS[0]] = coordinates[0]
    result[REPRESENTATIVE_ROWS[1]] = coordinates[1] + 2 * coordinates[0]
    return result


def _relation_witness(
    source: Mapping[str, Any], exponents: Sequence[int], representative: Sequence[int]
) -> list[int]:
    difference = [a - b for a, b in zip(exponents, representative, strict=True)]
    transformed = _row_times_matrix(difference, source["v"], COLUMNS)
    diagonal = [1] * 797 + [8, 24]
    if any(value % diagonal[index] for index, value in enumerate(transformed)):
        raise Row14GeneralMapFailure("representative has a different class")
    diagonal_coefficients = [
        transformed[index] // diagonal[index] for index in range(COLUMNS)
    ] + [0] * (ROWS - COLUMNS)
    coefficients = _row_times_matrix(diagonal_coefficients, source["u"], ROWS)
    replay = [0] * COLUMNS
    for relation, coefficient in enumerate(coefficients):
        if coefficient == 0:
            continue
        offset = relation * COLUMNS
        for column in range(COLUMNS):
            replay[column] += coefficient * source["relations"][offset + column]
    if replay != difference:
        raise Row14GeneralMapFailure("principal-relation witness failed exact replay")
    return coefficients


def _reduce(source: Mapping[str, Any], exponents: Sequence[int]) -> dict[str, Any]:
    values = _integers(list(exponents), COLUMNS, "factor exponent tape")
    coordinates = _coordinates(source, values)
    representative = _representative(coordinates)
    if _coordinates(source, representative) != coordinates:
        raise Row14GeneralMapFailure("supported class representative changed")
    coefficients = _relation_witness(source, values, representative)
    support = [index for index, value in enumerate(coefficients) if value]
    return {
        "classCoordinates": coordinates,
        "factorBaseExponents": values,
        "representativeFactorBaseExponents": representative,
        "representativeGeneratorPowers": coordinates,
        "principalRelationCoefficients": coefficients,
        "principalGeneratorRelationIndices": support,
        "principalGeneratorExponents": [coefficients[index] for index in support],
        "principalGenerators": [
            source["generators"][4 * index : 4 * (index + 1)] for index in support
        ],
    }


def factor_supported_ideal(
    payload: Mapping[str, Any],
    proof: Mapping[str, Any],
    metadata: Mapping[str, Any],
    ideal_hnf: Sequence[Any],
) -> dict[str, Any]:
    source = _source(payload, proof, metadata)
    return _reduce(source, _factor(source, ideal_hnf))


def factor_supported_fractional_ideal(
    payload: Mapping[str, Any],
    proof: Mapping[str, Any],
    metadata: Mapping[str, Any],
    numerator_hnf: Sequence[Any],
    denominator: Any,
) -> dict[str, Any]:
    if isinstance(denominator, bool) or not isinstance(denominator, (str, int)):
        raise Row14GeneralMapFailure("fractional denominator is not an integer")
    divisor = int(denominator)
    if str(divisor) != str(denominator) or divisor <= 0:
        raise Row14GeneralMapFailure(
            "fractional denominator is not positive canonical data"
        )
    source = _source(payload, proof, metadata)
    factors = _factor(source, numerator_hnf)
    residual = divisor
    for offset, count, complete in zip(
        source["groupOffsets"],
        source["groupCounts"],
        source["groupComplete"],
        strict=True,
    ):
        prime = source["primes"][offset]
        value = 0
        while residual % prime == 0:
            residual //= prime
            value += 1
        if not value:
            continue
        if complete != 1:
            raise Row14GeneralMapFailure(
                "denominator prime decomposition is incomplete"
            )
        for index in range(offset, offset + count):
            factors[index] -= source["ramification"][index] * value
    if residual != 1:
        raise Row14GeneralMapFailure("denominator has support outside the factor base")
    result = _reduce(source, factors)
    result["fractionalDenominator"] = divisor
    return result


def reduce_supported_exponents(
    payload: Mapping[str, Any],
    proof: Mapping[str, Any],
    metadata: Mapping[str, Any],
    exponents: Sequence[int],
) -> dict[str, Any]:
    return _reduce(_source(payload, proof, metadata), exponents)


def combine_supported(
    payload: Mapping[str, Any],
    proof: Mapping[str, Any],
    metadata: Mapping[str, Any],
    left: Sequence[int],
    right: Sequence[int],
) -> dict[str, Any]:
    left_values = _integers(list(left), COLUMNS, "left factor tape")
    right_values = _integers(list(right), COLUMNS, "right factor tape")
    source = _source(payload, proof, metadata)
    result = _reduce(
        source, [a + b for a, b in zip(left_values, right_values, strict=True)]
    )
    expected = [
        (a + b) % modulus
        for a, b, modulus in zip(
            _coordinates(source, left_values),
            _coordinates(source, right_values),
            INVARIANTS,
            strict=True,
        )
    ]
    if result["classCoordinates"] != expected:
        raise Row14GeneralMapFailure("combine class law failed")
    return result


def _canonical(value: Any) -> bytes:
    return json.dumps(value, separators=(",", ":"), sort_keys=True).encode("ascii")


def _digest(value: Any) -> str:
    return hashlib.sha256(_canonical(value)).hexdigest()


def replay_general_maps(
    payload: Mapping[str, Any], proof: Mapping[str, Any], metadata: Mapping[str, Any]
) -> dict[str, Any]:
    source = _source(payload, proof, metadata)
    identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
    if factor_supported_ideal(payload, proof, metadata, identity)[
        "classCoordinates"
    ] != [0, 0]:
        raise Row14GeneralMapFailure("identity ideal has a nonzero class")
    for index, ideal in enumerate(source["ideals"]):
        expected = [0] * COLUMNS
        expected[index] = 1
        if _factor(source, _transpose(ideal)) != expected:
            raise Row14GeneralMapFailure("factor-base prime round trip changed")
    left = [0] * COLUMNS
    right = [0] * COLUMNS
    left[REPRESENTATIVE_ROWS[0]] = 3
    right[REPRESENTATIVE_ROWS[1]] = 5
    combined = combine_supported(payload, proof, metadata, left, right)
    if combined["classCoordinates"] != [3, 23]:
        raise Row14GeneralMapFailure("combine result changed")
    complete = next(
        (
            offset
            for offset, status in zip(
                source["groupOffsets"], source["groupComplete"], strict=True
            )
            if status == 1
        ),
        None,
    )
    if complete is None:
        raise Row14GeneralMapFailure("no complete denominator prime group")
    rational_prime = source["primes"][complete]
    fractional = factor_supported_fractional_ideal(
        payload,
        proof,
        metadata,
        _transpose(source["ideals"][REPRESENTATIVE_ROWS[0]]),
        rational_prime,
    )
    if fractional["classCoordinates"] != _coordinates(
        source, [int(index == REPRESENTATIVE_ROWS[0]) for index in range(COLUMNS)]
    ):
        raise Row14GeneralMapFailure("principal denominator changed class")
    outside = max(source["primes"]) + 1
    while any(outside % prime == 0 for prime in range(2, int(outside**0.5) + 1)):
        outside += 1
    rejected = 0
    try:
        factor_supported_ideal(
            payload,
            proof,
            metadata,
            [outside, 0, 0, 0, 0, outside, 0, 0, 0, 0, outside, 0, 0, 0, 0, outside],
        )
    except Row14GeneralMapFailure:
        rejected += 1
    try:
        factor_supported_fractional_ideal(payload, proof, metadata, identity, outside)
    except Row14GeneralMapFailure:
        rejected += 1
    if rejected != 2:
        raise Row14GeneralMapFailure("out-of-support ideal was accepted")
    body = {
        "schema": "sagejs.pari-class-group/row14-general-ideal-maps-v1",
        "domain": "arbitrary-fractional-quartic-ideal-hnf-supported-on-retained-factor-base",
        "classNumber": "192",
        "factorBaseSize": str(COLUMNS),
        "relationCount": str(ROWS),
        "invariantFactors": ["8", "24"],
        "maps": {"combine": True, "factor": True, "reduce": True},
        "factorBasePrimeRoundTrips": COLUMNS,
        "fractionalPrincipalDenominatorRoundTrips": 1,
        "outOfSupportRejections": rejected,
        "exactRelationWitnessesReplayed": 4,
        "qualifiedTiming": False,
    }
    return {**body, "contentSha256": _digest(body)}


__all__ = [
    "Row14GeneralMapFailure",
    "combine_supported",
    "factor_supported_fractional_ideal",
    "factor_supported_ideal",
    "reduce_supported_exponents",
    "replay_general_maps",
]
