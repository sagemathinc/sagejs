"""Principal-relation and archimedean completion for row 19.

This composes retained transforms from the live first-HNF and terminal owners.
No PARI class-group output is an input. PARI 2.17.4 algorithm,
copyright (C) The PARI group; GPL-2.0-or-later.
"""

from __future__ import annotations

import hashlib
import json
import sys
from typing import Any

from .log_matrix_transform import pari_log_matrix_transform
from .row19_mixed_cubic_cleanarch import pari_cleanarch_mixed_cubic_row19
from .row19_class_group_generators import (
    DIMENSION,
    Row19ClassGroupFailure,
    _integers,
    _strings,
    compose_row19_class_group_generators,
)


SCHEMA = "sagejs.pari-class-group/row19-class-group-principal-owner-v1"
FIRST_SCHEMA = "sagejs.pari-class-group/row19-first-hnf-owner-v1"
FIRST_OWNER_SHA256 = "076d334e302d880b2a7da80366fe492d62b118e2a495f15c422908137aa66258"
TERMINAL_OWNER_SHA256 = (
    "f33fb0d7861a38f36b0b83249cd84598681949cc64362d670df8aef9908ebb76"
)
RAW_RELATIONS = 430
FACTOR_ROWS = 424
FIRST_RELATIONS = 423
PACKED_LOG_WIDTH = 14
FIRST_CLEANUP_SHA256 = (
    "21561a1e09fbab5047ad12fdeda5df59cf32d843220f40b06eb6dc987c50c410"
)
FIRST_HNF_SHA256 = "6631c549eb5f333864f8bb98203d25f4342c2663ea2cddf1e827383de4c104c8"
TERMINAL_HNF_SHA256 = "f963af0af29405005e122c5e564bada0d97e8a60f46b0806c9566e022a48abbf"
RELATIONS_SHA256 = "be374ea57267d3c1f1a977b05946296c46e782a8aecadcc87903a1ea5b7a8f1c"
GENERATORS_SHA256 = "fa6af51552da55f7180dc22119ef1ec95b0091fc89cb6143b74cfb18d152250d"


class Row19PrincipalOwnerFailure(Row19ClassGroupFailure):
    """The retained row-19 principal relation chain failed closed."""


def _digest(values: list[int]) -> str:
    payload = "\n".join(str(value) for value in values).encode()
    return hashlib.sha256(payload).hexdigest()


def _multiply_rectangular(
    left: list[int], rows: int, inner: int, right: list[int], columns: int
) -> list[int]:
    return [
        sum(left[k * rows + row] * right[column * inner + k] for k in range(inner))
        for column in range(columns)
        for row in range(rows)
    ]


def _unit_partition(
    h: list[int], rows: int, columns: int
) -> tuple[list[int], list[int]]:
    zero_columns = columns - rows
    units: list[int] = []
    nonunits: list[int] = []
    for index in range(rows):
        diagonal = h[(zero_columns + index) * rows + index]
        (units if abs(diagonal) == 1 else nonunits).append(index)
    return nonunits, units


def _column_product(
    records: list[int], record_columns: int, coefficients: list[int]
) -> list[int]:
    return [
        sum(
            records[column * FACTOR_ROWS + row] * coefficients[column]
            for column in range(record_columns)
        )
        for row in range(FACTOR_ROWS)
    ]


def _pre_hnffinal_permutation(
    published: list[int], dep_rows: int, nonunits: list[int], units: list[int]
) -> list[int]:
    rows = len(nonunits) + len(units)
    before = published.copy()
    nonunit_cursor = dep_rows
    unit_cursor = dep_rows + len(nonunits)
    nonunit_set = set(nonunits)
    for row in range(rows):
        if row in nonunit_set:
            before[dep_rows + row] = published[nonunit_cursor]
            nonunit_cursor += 1
        else:
            before[dep_rows + row] = published[unit_cursor]
            unit_cursor += 1
    return before


def _correct_hnffinal_tails(
    transformed: list[int],
    raw_rows: int,
    total_columns: int,
    active_columns: int,
    rows: int,
    dep_rows: int,
    full_h: list[int],
    records: list[int],
    published_permutation: list[int],
) -> tuple[list[int], list[int], list[int]]:
    """Replay hnffinal's descending quotient updates on trailing provenance."""
    nonunits, units = _unit_partition(full_h, rows, active_columns)
    before = _pre_hnffinal_permutation(published_permutation, dep_rows, nonunits, units)
    zero_columns = active_columns - rows
    full_dep = [0] * (dep_rows * active_columns)
    for column in range(active_columns):
        provenance = transformed[column * raw_rows : (column + 1) * raw_rows]
        valuations = _column_product(records, raw_rows, provenance)
        for row in range(dep_rows):
            full_dep[column * dep_rows + row] = valuations[before[row] - 1]
    for column in range(active_columns, total_columns):
        start = column * raw_rows
        provenance = transformed[start : start + raw_rows]
        valuations = _column_product(records, raw_rows, provenance)
        logical = [valuations[before[row] - 1] for row in range(dep_rows + rows)]
        for row in range(rows - 1, -1, -1):
            pivot = full_h[(zero_columns + row) * rows + row]
            quotient = logical[dep_rows + row]
            if abs(pivot) != 1:
                quotient //= pivot
            if quotient == 0:
                continue
            active = transformed[
                (zero_columns + row) * raw_rows : (zero_columns + row + 1) * raw_rows
            ]
            for index in range(raw_rows):
                provenance[index] -= quotient * active[index]
            for index in range(dep_rows):
                logical[index] -= (
                    quotient * full_dep[(zero_columns + row) * dep_rows + index]
                )
            for index in range(rows):
                logical[dep_rows + index] -= (
                    quotient * full_h[(zero_columns + row) * rows + index]
                )
        transformed[start : start + raw_rows] = provenance
    return nonunits, units, before


def _first_relation_transform(first: dict[str, Any], records: list[int]) -> list[int]:
    """Rebuild the 423-column map after first hnfspec/hnffinal."""
    cleanup = _integers(
        first.get("ancestry", {}).get("cleanupTransform"),
        FIRST_RELATIONS * FIRST_RELATIONS,
        "first cleanup transform",
    )
    active_columns = int(first.get("dimensions", {}).get("activeColumns", -1))
    active_rows = int(first.get("dimensions", {}).get("activeRows", -1))
    if active_columns != 84 or active_rows != 78:
        raise Row19PrincipalOwnerFailure("first-HNF active dimensions changed")
    hnf_transform = _integers(
        first.get("ancestry", {}).get("transform"),
        active_columns * active_columns,
        "first HNF transform",
    )
    full_h = _integers(
        first.get("ancestry", {}).get("H"),
        active_rows * active_columns,
        "first full H",
    )
    transformed = cleanup.copy()
    transformed[: FIRST_RELATIONS * active_columns] = _multiply_rectangular(
        cleanup[: FIRST_RELATIONS * active_columns],
        FIRST_RELATIONS,
        active_columns,
        hnf_transform,
        active_columns,
    )
    published_permutation = _integers(
        first.get("result", {}).get("perm"), FACTOR_ROWS, "first permutation"
    )
    nonunits, units, unused_before = _correct_hnffinal_tails(
        transformed,
        FIRST_RELATIONS,
        FIRST_RELATIONS,
        active_columns,
        active_rows,
        7,
        full_h,
        records,
        published_permutation,
    )
    if len(nonunits) != 9 or len(units) != 69:
        raise Row19PrincipalOwnerFailure("first-HNF unit partition changed")
    zero_columns = active_columns - active_rows
    retained_columns = active_columns - len(units)
    output = [0] * (FIRST_RELATIONS * FIRST_RELATIONS)

    def copy(destination: int, source: int) -> None:
        output[destination * FIRST_RELATIONS : (destination + 1) * FIRST_RELATIONS] = (
            transformed[source * FIRST_RELATIONS : (source + 1) * FIRST_RELATIONS]
        )

    for column in range(zero_columns):
        copy(column, column)
    for destination, source in enumerate(nonunits):
        copy(zero_columns + destination, zero_columns + source)
    for destination, source in enumerate(units):
        copy(retained_columns + destination, zero_columns + source)
    for column in range(active_columns, FIRST_RELATIONS):
        copy(column, column)
    # Authenticate the whole first-stage relation owner, including every
    # quotient-corrected tail, before it can feed hnfadd.
    expected_h = _integers(first["result"]["W"], 81, "first W")
    expected_dep = _integers(first["result"]["dep"], 63, "first dep")
    expected_b = _integers(first["result"]["B"], 16 * 408, "first B")
    for column in range(FIRST_RELATIONS):
        values = _column_product(
            records,
            RAW_RELATIONS,
            output[column * FIRST_RELATIONS : (column + 1) * FIRST_RELATIONS] + [0] * 7,
        )
        logical = [values[index - 1] for index in published_permutation]
        expected = [0] * FACTOR_ROWS
        if 6 <= column < 15:
            source = column - 6
            expected[:7] = expected_dep[source * 7 : (source + 1) * 7]
            expected[7:16] = expected_h[source * 9 : (source + 1) * 9]
        elif column >= 15:
            source = column - 15
            expected[:16] = expected_b[source * 16 : (source + 1) * 16]
            expected[16 + source] = 1
        if logical != expected:
            raise Row19PrincipalOwnerFailure("first raw relation transform changed")
    return output


def _terminal_relation_transform(
    first_transform: list[int], first: dict[str, Any], terminal: dict[str, Any]
) -> list[int]:
    """Append seven raw columns and replay the final hnffinal ordering."""
    records = _integers(
        terminal.get("relationIdentity", {}).get("records"),
        FACTOR_ROWS * RAW_RELATIONS,
        "terminal relations",
    )
    permutation = _integers(
        first.get("result", {}).get("perm"), FACTOR_ROWS, "first permutation"
    )
    b = _integers(first.get("result", {}).get("B"), 16 * 408, "first B")
    joined_columns = 424
    joined = [0] * (RAW_RELATIONS * joined_columns)
    for appended in range(7):
        vector = [0] * RAW_RELATIONS
        vector[FIRST_RELATIONS + appended] = 1
        for tail in range(408):
            coefficient = records[
                (FIRST_RELATIONS + appended) * FACTOR_ROWS + permutation[16 + tail] - 1
            ]
            if coefficient == 0:
                continue
            # `B` authenticates the same exact adjustment performed by hnfadd.
            if all(b[tail * 16 + row] == 0 for row in range(16)):
                raise Row19PrincipalOwnerFailure("active B tail unexpectedly vanished")
            old = first_transform[
                (15 + tail) * FIRST_RELATIONS : (16 + tail) * FIRST_RELATIONS
            ]
            for row, value in enumerate(old):
                vector[row] -= coefficient * value
        joined[appended * RAW_RELATIONS : (appended + 1) * RAW_RELATIONS] = vector
    for destination, source in enumerate(range(6, FIRST_RELATIONS), start=7):
        old = first_transform[source * FIRST_RELATIONS : (source + 1) * FIRST_RELATIONS]
        joined[destination * RAW_RELATIONS : (destination + 1) * RAW_RELATIONS] = (
            old + [0] * 7
        )

    final_transform = _integers(
        terminal.get("ancestry", {}).get("transform"), 256, "terminal HNF transform"
    )
    joined[: 16 * RAW_RELATIONS] = _multiply_rectangular(
        joined[: 16 * RAW_RELATIONS], RAW_RELATIONS, 16, final_transform, 16
    )
    full_h = _integers(terminal.get("ancestry", {}).get("H"), 256, "terminal full H")
    terminal_permutation = _integers(
        terminal.get("result", {}).get("perm"), FACTOR_ROWS, "terminal permutation"
    )
    nonunits, units, unused_before = _correct_hnffinal_tails(
        joined,
        RAW_RELATIONS,
        joined_columns,
        16,
        16,
        0,
        full_h,
        records,
        terminal_permutation,
    )
    if len(nonunits) != 9 or len(units) != 7:
        raise Row19PrincipalOwnerFailure("terminal unit partition changed")
    output = [0] * (RAW_RELATIONS * RAW_RELATIONS)

    def copy_new(destination: int, source: int) -> None:
        output[destination * RAW_RELATIONS : (destination + 1) * RAW_RELATIONS] = (
            joined[source * RAW_RELATIONS : (source + 1) * RAW_RELATIONS]
        )

    for column in range(6):
        old = first_transform[column * FIRST_RELATIONS : (column + 1) * FIRST_RELATIONS]
        output[column * RAW_RELATIONS : (column + 1) * RAW_RELATIONS] = old + [0] * 7
    for destination, source in enumerate(nonunits):
        copy_new(6 + destination, source)
    for destination, source in enumerate(units):
        copy_new(15 + destination, source)
    for destination, source in enumerate(range(16, joined_columns), start=22):
        copy_new(destination, source)
    expected_h = _integers(terminal["result"]["W"], 81, "terminal W")
    expected_b = _integers(terminal["result"]["B"], 9 * 415, "terminal B")
    for column in range(RAW_RELATIONS):
        values = _column_product(
            records,
            RAW_RELATIONS,
            output[column * RAW_RELATIONS : (column + 1) * RAW_RELATIONS],
        )
        logical = [values[index - 1] for index in terminal_permutation]
        expected = [0] * FACTOR_ROWS
        if 6 <= column < 15:
            source = column - 6
            expected[:9] = expected_h[source * 9 : (source + 1) * 9]
        elif column >= 15:
            source = column - 15
            expected[:9] = expected_b[source * 9 : (source + 1) * 9]
            expected[9 + source] = 1
        if logical != expected:
            raise Row19PrincipalOwnerFailure("terminal raw relation transform changed")
    return output


def _principal_witnesses(
    base: dict[str, Any], transform: list[int], terminal: dict[str, Any]
) -> list[dict[str, Any]]:
    records = _integers(
        terminal.get("relationIdentity", {}).get("records"),
        FACTOR_ROWS * RAW_RELATIONS,
        "terminal relations",
    )
    generators = _integers(
        terminal.get("relationIdentity", {}).get("generators"),
        3 * RAW_RELATIONS,
        "terminal principal generators",
    )
    m1 = [int(value) for value in base["presentation"]["matrices"]["M1"]]
    permutation = _integers(
        terminal.get("result", {}).get("perm"), FACTOR_ROWS, "terminal permutation"
    )
    result: list[dict[str, Any]] = []
    for index, generator in enumerate(base["generators"]):
        coefficients = [
            sum(
                transform[(6 + column) * RAW_RELATIONS + relation]
                * m1[index * DIMENSION + column]
                for column in range(DIMENSION)
            )
            for relation in range(RAW_RELATIONS)
        ]
        factor_exponents = [
            sum(
                records[relation * FACTOR_ROWS + row] * coefficients[relation]
                for relation in range(RAW_RELATIONS)
            )
            for row in range(FACTOR_ROWS)
        ]
        expected_exponents = [0] * FACTOR_ROWS
        request = [int(value) for value in generator["request"]]
        order = int(generator["order"])
        for coordinate, exponent in enumerate(request):
            expected_exponents[permutation[coordinate] - 1] = order * exponent
        if factor_exponents != expected_exponents:
            raise Row19PrincipalOwnerFailure(
                "principal witness does not equal the generator power"
            )
        support = [position for position, value in enumerate(coefficients) if value]
        if not support or any(
            generators[3 * relation : 3 * relation + 3] == [0, 0, 0]
            for relation in support
        ):
            raise Row19PrincipalOwnerFailure("principal witness has an invalid factor")
        result.append(
            {
                "complete": True,
                "exact": True,
                "rawRelationCoefficients": _strings(coefficients),
                "rawRelationCoefficientsSha256": _digest(coefficients),
                "factorBaseExponents": _strings(factor_exponents),
                "factorBaseExponentsSha256": _digest(factor_exponents),
                "generatorPowerFactorBaseExponents": _strings(expected_exponents),
                "generatorPowerFactorBaseEqualityExact": True,
                "famatGenerators": [
                    _strings(generators[3 * relation : 3 * relation + 3])
                    for relation in support
                ],
                "famatExponents": _strings(
                    [coefficients[relation] for relation in support]
                ),
                "factorCount": len(support),
                "identity": f"J_{index}^{generator['order']}=(alpha_{index})",
            }
        )
    return result


def _full_factor_base(
    selected_projection: dict[str, Any], prefix: dict[str, Any]
) -> dict[str, Any]:
    """Attach the full ordered factor base used by witness exponent rows."""
    factor = prefix.get("factor", {})
    size = int(factor.get("KC", -1))
    if size != FACTOR_ROWS:
        raise Row19PrincipalOwnerFailure("row-19 factor-base size changed")
    ideals = _integers(factor.get("packetIdeals"), 9 * size, "factor-base ideals")
    norms = _integers(factor.get("packetNorms"), size, "factor-base norms")
    primes = _integers(factor.get("primes"), size, "factor-base primes")
    ramification = _integers(
        factor.get("ramification"), size, "factor-base ramification"
    )
    residue_degrees = _integers(
        factor.get("residueDegrees"), size, "factor-base residue degrees"
    )
    inert = _integers(factor.get("inert"), size, "factor-base inert flags")
    raw_generators = factor.get("generators")
    if not isinstance(raw_generators, list) or len(raw_generators) != size:
        raise Row19PrincipalOwnerFailure("factor-base generators changed")
    generators = [
        value
        for index, generator in enumerate(raw_generators)
        for value in _integers(generator, 3, f"factor-base generator {index}")
    ]
    tau = _integers(factor.get("tau"), 9 * size, "factor-base tau")
    selected_indices = _integers(
        factor.get("selectedIndices"), size, "factor-base selected indices"
    )
    projection = [
        *ideals,
        *norms,
        *primes,
        *ramification,
        *residue_degrees,
        *inert,
        *generators,
        *tau,
        *selected_indices,
    ]
    return {
        **selected_projection,
        "size": size,
        "idealHnfs": [
            _strings(ideals[9 * index : 9 * (index + 1)]) for index in range(size)
        ],
        "norms": _strings(norms),
        "rationalPrimes": _strings(primes),
        "ramificationIndices": _strings(ramification),
        "residueDegrees": _strings(residue_degrees),
        "inertFlags": _strings(inert),
        "generators": [
            _strings(generators[3 * index : 3 * (index + 1)]) for index in range(size)
        ],
        "tau": [_strings(tau[9 * index : 9 * (index + 1)]) for index in range(size)],
        "selectedCatalogIndices": _strings(selected_indices),
        "projectionSha256": _digest(projection),
        "principalWitnessExponentCoordinates": "idealHnfs",
    }


def _archimedean(base: dict[str, Any], terminal: dict[str, Any]) -> dict[str, Any]:
    c = _integers(terminal.get("result", {}).get("C"), PACKED_LOG_WIDTH * 430, "C")
    # PARI does not pass retained HNF logs directly to class_group_gen.  It
    # first takes the 424-column suffix after the six unit columns and applies
    # cleanarch at the driver precision.  This correction is material: the
    # real product formula is normalized and complex arguments acquire the
    # 256-bit pi constant used by the pinned 192-bit request.
    suffix = c[6 * PACKED_LOG_WIDTH :]
    cleaned = [0] * len(suffix)
    clean_state = [0] * 4
    if pari_cleanarch_mixed_cubic_row19(
        suffix,
        424,
        192,
        [0] * 3,
        [0] * 512,
        [0] * 512,
        [0] * 512,
        [0] * 512,
        [0] * 1024,
        [0] * len(suffix),
        cleaned,
        clean_state,
    ) != 0 or clean_state[:3] != [0, 424, 424]:
        raise Row19PrincipalOwnerFailure("row-19 class cleanarch failed")
    class_logs = cleaned[: DIMENSION * PACKED_LOG_WIDTH]
    m1 = [int(value) for value in base["presentation"]["matrices"]["M1"]]
    m2 = [int(value) for value in base["presentation"]["matrices"]["M2"]]
    gd = [0] * (PACKED_LOG_WIDTH * DIMENSION)
    generator_arch = [0] * (PACKED_LOG_WIDTH * DIMENSION)
    pari_log_matrix_transform(class_logs, m1, 2, DIMENSION, DIMENSION, True, gd)
    pari_log_matrix_transform(
        class_logs, m2, 2, DIMENSION, DIMENSION, True, generator_arch
    )
    zero = [1, 0, -1, 0, 0, -1, 0]
    ga = zero * (2 * DIMENSION)
    if generator_arch != ga:
        raise Row19PrincipalOwnerFailure("row-19 M2 archimedean image is not zero")
    ge = [
        {"factorKinds": [], "factorValues": [], "factorExponents": []}
        for _ in range(DIMENSION)
    ]
    return {
        "Ge": ge,
        "Ga": _strings(ga),
        "GD": _strings(gd),
        "ga": _strings(ga),
        "clg2": {
            "components": ["Ur", "ga", "GD", "Ge", "M1", "M2"],
            "Ur": base["presentation"]["matrices"]["Ur"],
            "ga": _strings(ga),
            "GD": _strings(gd),
            "Ge": ge,
            "M1": base["presentation"]["matrices"]["M1"],
            "M2": base["presentation"]["matrices"]["M2"],
        },
        "cleanarch": {
            "precision": "192",
            "sourceColumns": 424,
            "publishedColumns": clean_state[2],
            "state": _strings(clean_state),
            "cleanedSuffixSha256": _digest(cleaned),
        },
    }


def compose_row19_class_group_principal_owner(
    terminal: dict[str, Any],
    first: dict[str, Any],
    prepared: dict[str, Any],
    prefix: dict[str, Any],
    ancestry: dict[str, Any],
) -> dict[str, Any]:
    """Publish the full retained principal map and class-group internals."""
    if (
        first.get("schema") != FIRST_SCHEMA
        or ancestry.get("firstHnfOwnerSha256") != FIRST_OWNER_SHA256
        or terminal.get("authority", {}).get("firstHnfOwnerSha256")
        != FIRST_OWNER_SHA256
    ):
        raise Row19PrincipalOwnerFailure("wrong first-HNF owner")
    if (
        _digest([int(value) for value in first["ancestry"]["cleanupTransform"]])
        != FIRST_CLEANUP_SHA256
        or _digest([int(value) for value in first["ancestry"]["transform"]])
        != FIRST_HNF_SHA256
        or _digest([int(value) for value in terminal["ancestry"]["transform"]])
        != TERMINAL_HNF_SHA256
        or _digest([int(value) for value in terminal["relationIdentity"]["records"]])
        != RELATIONS_SHA256
        or _digest([int(value) for value in terminal["relationIdentity"]["generators"]])
        != GENERATORS_SHA256
    ):
        raise Row19PrincipalOwnerFailure("retained principal ancestry changed")
    base = compose_row19_class_group_generators(terminal, prepared, prefix, ancestry)
    records = _integers(
        terminal.get("relationIdentity", {}).get("records"),
        FACTOR_ROWS * RAW_RELATIONS,
        "terminal relations",
    )
    first_transform = _first_relation_transform(first, records)
    transform = _terminal_relation_transform(first_transform, first, terminal)
    witnesses = _principal_witnesses(base, transform, terminal)
    for generator, witness in zip(base["generators"], witnesses, strict=True):
        generator["principalWitness"] = witness
    archimedean = _archimedean(base, terminal)
    factor_base = _full_factor_base(base["factorBase"], prefix)
    return {
        "schema": SCHEMA,
        "ancestry": dict(ancestry),
        "presentation": base["presentation"],
        "factorBase": factor_base,
        "generators": base["generators"],
        "principalRelationTransform": {
            "rows": RAW_RELATIONS,
            "columns": RAW_RELATIONS,
            "entries": _strings(transform),
            "sha256": _digest(transform),
            "firstStageFullValuationReplayExact": True,
            "terminalFullValuationReplayExact": True,
        },
        "archimedean": archimedean,
        "remainingBoundary": {
            "name": "public class-and-unit result adapter",
            "details": [
                "join the independently computed rank-one unit owner",
                "package clg1/clg2 and unit data behind the opt-in public API",
                "retain the current analytic assumptions and incomplete-certification label",
            ],
        },
        "completion": {
            "smithComplete": True,
            "reducedClassGeneratorIdealsComplete": True,
            "principalRelationTransformComplete": True,
            "principalIdealOrderWitnessesComplete": True,
            "classArchimedeanAssemblyComplete": True,
            "unitsJoined": False,
            "oracleDataConsumed": False,
            "publicComplete": False,
        },
    }


def compose_fresh_row19_class_group_principal_owner(
    terminal: dict[str, Any],
    first: dict[str, Any],
    prepared: dict[str, Any],
    prefix: dict[str, Any],
    ancestry: dict[str, Any],
    expected_first_owner_sha256: str,
) -> dict[str, Any]:
    """Compose from a same-transaction first-HNF owner.

    The ordinary retained-owner entry point remains pinned to the reviewed
    historical digest.  This entry point substitutes only the exact digest of
    the private owner created by the calling transaction; all mathematical
    retained-state fingerprints below remain unchanged.
    """
    if (
        not isinstance(expected_first_owner_sha256, str)
        or len(expected_first_owner_sha256) != 64
        or ancestry.get("firstHnfOwnerSha256") != expected_first_owner_sha256
        or terminal.get("authority", {}).get("firstHnfOwnerSha256")
        != expected_first_owner_sha256
    ):
        raise Row19PrincipalOwnerFailure("wrong fresh first-HNF owner")
    patched_ancestry = dict(ancestry)
    patched_ancestry["firstHnfOwnerSha256"] = FIRST_OWNER_SHA256
    patched_ancestry["terminalOwnerSha256"] = TERMINAL_OWNER_SHA256
    patched_terminal = dict(terminal)
    patched_terminal["authority"] = dict(terminal.get("authority", {}))
    patched_terminal["authority"]["firstHnfOwnerSha256"] = FIRST_OWNER_SHA256
    owner = compose_row19_class_group_principal_owner(
        patched_terminal, first, prepared, prefix, patched_ancestry
    )
    owner["ancestry"] = dict(ancestry)
    return owner


def main() -> None:
    payload = json.load(sys.stdin)
    owner = compose_row19_class_group_principal_owner(
        payload["terminal"],
        payload["first"],
        payload["prepared"],
        payload["prefix"],
        payload["ancestry"],
    )
    json.dump(owner, sys.stdout, separators=(",", ":"))
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()


__all__ = [
    "Row19PrincipalOwnerFailure",
    "SCHEMA",
    "compose_row19_class_group_principal_owner",
    "compose_fresh_row19_class_group_principal_owner",
]
