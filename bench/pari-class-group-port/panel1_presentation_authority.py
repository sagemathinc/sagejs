"""Authenticated exact presentation authority for frozen panel row 1.

The W0 trace supplies a prepared field, prime descriptors, and retained
principal-relation witnesses.  This module reconstructs those objects and
reruns the ordinary Python translations of PARI's relation HNF and Smith
presentation.  The final class answer is used only as a post-computation
comparison.

PARI 2.17.4 algorithm, copyright (C) The PARI group;
GPL-2.0-or-later.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping, Sequence
from typing import Any

from .class_group_smith_transform import pari_class_group_smith_transform
from .field3_unit_transform_retention import _pari_reverse_hnffinal_selection
from .hnfspec_complete import pari_hnfspec_complete
from .prime_ideal_hnf import pari_prime_ideal_hnf
from .relation_log_embeddings import pari_append_relation_log_embeddings
from .signed_prime_ideal_reduction import (
    pari_cubic_ideal_hnf_multiply,
    pari_cubic_mul_matrix,
)


SCHEMA = "sagejs.pari-class-group/panel1-presentation-authority-v1"
W0_SCHEMA = "sagejs.pari-class-group/development-default-driver-trace-v1"
FIELD_ID = (
    "generated-sha256-dec56e7e41f5f60071249da2e66871ed837a3c6e65d821c328e7b4c57adaff3f"
)
DEGREE = 3
PLACES = 3
ROWS = 51
COLUMNS = 58
KERNEL = 7
UNIT_RANK = 2
LOG_STRIDE = 7 * PLACES
SUBFACTOR_COUNT = 3


class Panel1PresentationFailure(ValueError):
    """The authenticated row-1 presentation failed closed."""


def _integer(value: Any, label: str) -> int:
    if isinstance(value, bool) or not isinstance(value, (str, int)):
        raise Panel1PresentationFailure(label + " is not an integer")
    try:
        result = int(value)
    except (ValueError, OverflowError) as error:
        raise Panel1PresentationFailure(label + " is not an integer") from error
    if str(result) != str(value):
        raise Panel1PresentationFailure(label + " is not canonical")
    return result


def _integers(value: Any, length: int, label: str) -> list[int]:
    if isinstance(value, (str, bytes)) or not isinstance(value, Sequence):
        raise Panel1PresentationFailure(label + " is not a sequence")
    if len(value) != length:
        raise Panel1PresentationFailure(label + " has the wrong length")
    return [_integer(entry, f"{label}[{index}]") for index, entry in enumerate(value)]


def _strings(value: Sequence[int]) -> list[str]:
    return [str(int(entry)) for entry in value]


def _digest(value: Any) -> str:
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


def _array_digest(value: Sequence[int]) -> str:
    return hashlib.sha256("\n".join(_strings(value)).encode()).hexdigest()


def _event(events: Sequence[Any], name: str) -> Mapping[str, Any]:
    selected = [
        entry
        for entry in events
        if isinstance(entry, Mapping) and entry.get("event") == name
    ]
    if len(selected) != 1:
        raise Panel1PresentationFailure("W0 does not contain one " + name)
    return selected[0]


def _exported_integer(value: Any, label: str) -> int:
    if not isinstance(value, Mapping) or value.get("kind") != "integer":
        raise Panel1PresentationFailure(label + " is not an exported integer")
    return _integer(value.get("value"), label)


def _exported_vector(value: Any, length: int, label: str) -> list[int]:
    if not isinstance(value, Mapping) or value.get("kind") not in {
        "column",
        "vector",
        "small-vector",
    }:
        raise Panel1PresentationFailure(label + " is not an exported vector")
    entries = value.get("values")
    if not isinstance(entries, list) or len(entries) != length:
        raise Panel1PresentationFailure(label + " has the wrong length")
    return [
        _exported_integer(entry, f"{label}[{index}]")
        if isinstance(entry, Mapping)
        else _integer(entry, f"{label}[{index}]")
        for index, entry in enumerate(entries)
    ]


def _exported_matrix(value: Any, rows: int, columns: int, label: str) -> list[int]:
    if not isinstance(value, Mapping) or value.get("kind") != "matrix":
        raise Panel1PresentationFailure(label + " is not an exported matrix")
    entries = value.get("values")
    if not isinstance(entries, list) or len(entries) != columns:
        raise Panel1PresentationFailure(label + " has the wrong column count")
    return [
        cell
        for column, entry in enumerate(entries)
        for cell in _exported_vector(entry, rows, f"{label}[{column}]")
    ]


def _packed_real(value: Any, label: str) -> list[int]:
    if not isinstance(value, Mapping):
        raise Panel1PresentationFailure(label + " is not an exported scalar")
    if value.get("kind") == "integer":
        return [_exported_integer(value, label), -1, 0]
    if value.get("kind") != "real":
        raise Panel1PresentationFailure(label + " is not real")
    return [
        _integer(value.get("mantissa"), label + " mantissa"),
        _integer(value.get("precision"), label + " precision"),
        _integer(value.get("exponent"), label + " exponent"),
    ]


def _packed_scalar(value: Any, label: str) -> list[int]:
    if isinstance(value, Mapping) and value.get("kind") == "complex":
        return [
            2,
            *_packed_real(value.get("real"), label + " real"),
            *_packed_real(value.get("imag"), label + " imaginary"),
        ]
    return [1, *_packed_real(value, label), 0, -1, 0]


def _packed_matrix(value: Any, rows: int, columns: int, label: str) -> list[int]:
    if not isinstance(value, Mapping) or value.get("kind") != "matrix":
        raise Panel1PresentationFailure(label + " is not a packed matrix")
    entries = value.get("values")
    if not isinstance(entries, list) or len(entries) != columns:
        raise Panel1PresentationFailure(label + " has the wrong column count")
    result: list[int] = []
    for column, entry in enumerate(entries):
        if not isinstance(entry, Mapping) or entry.get("kind") != "column":
            raise Panel1PresentationFailure(label + " has a malformed column")
        cells = entry.get("values")
        if not isinstance(cells, list) or len(cells) != rows:
            raise Panel1PresentationFailure(label + " has the wrong row count")
        for row, cell in enumerate(cells):
            result.extend(_packed_scalar(cell, f"{label}[{column},{row}]"))
    return result


def _prepared_triples(value: Any, length: int, label: str) -> list[int]:
    if not isinstance(value, list) or len(value) != length:
        raise Panel1PresentationFailure(label + " has the wrong shape")
    return [
        cell
        for index, entry in enumerate(value)
        for cell in _packed_real(entry, f"{label}[{index}]")
    ]


def _determinant3(matrix: Sequence[int]) -> int:
    return (
        matrix[0] * (matrix[4] * matrix[8] - matrix[5] * matrix[7])
        - matrix[1] * (matrix[3] * matrix[8] - matrix[5] * matrix[6])
        + matrix[2] * (matrix[3] * matrix[7] - matrix[4] * matrix[6])
    )


def _adjugate3(matrix: Sequence[int]) -> list[int]:
    return [
        matrix[4] * matrix[8] - matrix[5] * matrix[7],
        matrix[2] * matrix[7] - matrix[1] * matrix[8],
        matrix[1] * matrix[5] - matrix[2] * matrix[4],
        matrix[5] * matrix[6] - matrix[3] * matrix[8],
        matrix[0] * matrix[8] - matrix[2] * matrix[6],
        matrix[2] * matrix[3] - matrix[0] * matrix[5],
        matrix[3] * matrix[7] - matrix[4] * matrix[6],
        matrix[1] * matrix[6] - matrix[0] * matrix[7],
        matrix[0] * matrix[4] - matrix[1] * matrix[3],
    ]


def _matrix3_product(left: Sequence[int], right: Sequence[int]) -> list[int]:
    return [
        sum(left[3 * row + k] * right[3 * k + column] for k in range(3))
        for row in range(3)
        for column in range(3)
    ]


def _same_lattice(left: Sequence[int], right: Sequence[int]) -> bool:
    determinant = _determinant3(left)
    if determinant == 0 or abs(determinant) != abs(_determinant3(right)):
        return False
    return all(
        value % determinant == 0 for value in _matrix3_product(_adjugate3(left), right)
    )


def _multiply_ideals(
    left: Sequence[int], right: Sequence[int], table: Sequence[int]
) -> list[int]:
    output = [0] * 9
    pari_cubic_ideal_hnf_multiply(
        list(left),
        list(right),
        list(table),
        [0] * 27,
        [0] * 18,
        [0] * 30,
        [0] * 12,
        [0] * 3,
        [0] * 9,
        output,
    )
    return output


def _bareiss_determinant(matrix: Sequence[int], size: int) -> int:
    work = [
        [int(matrix[column * size + row]) for column in range(size)]
        for row in range(size)
    ]
    sign = 1
    previous = 1
    for column in range(size - 1):
        pivot_row = column
        while pivot_row < size and work[pivot_row][column] == 0:
            pivot_row += 1
        if pivot_row == size:
            return 0
        if pivot_row != column:
            work[column], work[pivot_row] = work[pivot_row], work[column]
            sign = -sign
        pivot = work[column][column]
        for row in range(column + 1, size):
            for target in range(column + 1, size):
                numerator = (
                    work[row][target] * pivot - work[row][column] * work[column][target]
                )
                if numerator % previous:
                    raise Panel1PresentationFailure("Bareiss division is not exact")
                work[row][target] = numerator // previous
        previous = pivot
    return sign * work[-1][-1]


def _raw_relations_and_logs(
    hnf_event: Mapping[str, Any], prepared: Mapping[str, Any]
) -> tuple[list[int], list[int], list[int]]:
    witnesses = hnf_event.get("relationRecords")
    if not isinstance(witnesses, list) or len(witnesses) != COLUMNS:
        raise Panel1PresentationFailure("retained relation count changed")
    records: list[int] = []
    generators: list[int] = []
    scalar_prefix = 0
    for column, witness in enumerate(witnesses):
        if not isinstance(witness, Mapping):
            raise Panel1PresentationFailure("relation witness is malformed")
        records.extend(_exported_vector(witness.get("R"), ROWS, "relation"))
        alpha = witness.get("m")
        if isinstance(alpha, Mapping) and alpha.get("kind") == "integer":
            if column != scalar_prefix:
                raise Panel1PresentationFailure("scalar relation prefix changed")
            generators.extend([_exported_integer(alpha, "principal generator"), 0, 0])
            scalar_prefix += 1
        else:
            generators.extend(_exported_vector(alpha, DEGREE, "principal generator"))
    matrix_m: list[int] = []
    matrix_p: list[int] = []
    matrix_e: list[int] = []
    embedding = prepared.get("embeddingM")
    if not isinstance(embedding, list) or len(embedding) != DEGREE**2:
        raise Panel1PresentationFailure("prepared embedding changed")
    for index, entry in enumerate(embedding):
        mantissa, precision, exponent = _packed_real(
            entry, f"prepared embedding[{index}]"
        )
        matrix_m.append(mantissa)
        matrix_p.append(precision)
        matrix_e.append(exponent)
    metadata = [value for index in range(COLUMNS) for value in (index + 1, 0, 0)]
    logs = [0] * (LOG_STRIDE * COLUMNS)
    completed = [0]
    pari_append_relation_log_embeddings(
        matrix_m,
        matrix_p,
        matrix_e,
        generators,
        metadata,
        COLUMNS,
        DEGREE,
        DEGREE,
        192,
        completed,
        logs,
        [0] * DEGREE,
        [0] * LOG_STRIDE,
        [0] * 3,
        [0] * 3,
        [0] * 64,
        [0] * 64,
        [0] * 64,
        [0] * 64,
        [0] * 128,
        scalar_prefix,
    )
    if completed != [COLUMNS]:
        raise Panel1PresentationFailure("relation-log replay is incomplete")
    return records, generators, logs


def _source_presentation(
    records: list[int], logs: list[int], permutation: list[int]
) -> dict[str, Any]:
    size = ROWS * COLUMNS
    log_size = LOG_STRIDE * COLUMNS
    zero = lambda length: [0] * length
    args: list[Any] = [
        records,
        ROWS,
        COLUMNS,
        permutation,
        SUBFACTOR_COUNT,
        logs,
        PLACES,
        zero(size),
        zero(SUBFACTOR_COUNT * COLUMNS),
        zero(COLUMNS * COLUMNS),
        zero(COLUMNS),
        zero(1),
        zero(13),
        zero((ROWS - SUBFACTOR_COUNT) * COLUMNS),
        zero(SUBFACTOR_COUNT * COLUMNS),
        zero(size),
        zero(10),
        zero(size),
        zero(COLUMNS),
        zero(ROWS),
        zero(ROWS),
        zero(ROWS + 1),
        zero(10),
        zero(ROWS),
        zero(size),
        zero(size),
        zero(size),
        zero(6),
        zero(log_size),
        zero(size),
        zero(COLUMNS * COLUMNS),
        zero(COLUMNS * COLUMNS),
        zero(COLUMNS + 1),
        zero(11),
        zero(size),
        zero(size),
        zero(log_size),
        zero(ROWS),
        zero(size),
        zero(size),
        zero(ROWS * (COLUMNS + ROWS)),
        zero(log_size),
        zero(7),
        zero(9),
        zero(160000),
        zero(32),
        zero(8),
        zero(8),
    ]
    if pari_hnfspec_complete(*args) != 0:
        raise Panel1PresentationFailure("source HNF replay did not complete")
    if args[27] != [6, 0, 13, 6, 45, 0] or args[43] != [
        1,
        8,
        50,
        0,
        7,
        5,
        0,
        58,
        0,
    ]:
        raise Panel1PresentationFailure("source HNF state changed")

    targets = COLUMNS
    selected = zero(COLUMNS * targets)
    for target in range(targets):
        selected[target * COLUMNS + target] = 1
    work = zero(COLUMNS * targets)
    _pari_reverse_hnffinal_selection(
        selected,
        COLUMNS,
        targets,
        6,
        0,
        13,
        45,
        args[30],
        0,
        args[29],
        0,
        args[34],
        0,
        args[26],
        0,
        args[37],
        0,
        work,
        zero(6 * 45),
    )
    raw = zero(COLUMNS * targets)
    cleanup = args[9]
    for target in range(targets):
        for source in range(COLUMNS):
            raw[target * COLUMNS + source] = sum(
                cleanup[cleaned * COLUMNS + source]
                * selected[target * COLUMNS + cleaned]
                for cleaned in range(COLUMNS)
            )

    kernel = raw[: KERNEL * COLUMNS]
    for column in range(KERNEL):
        for row in range(ROWS):
            if sum(
                records[source * ROWS + row] * kernel[column * COLUMNS + source]
                for source in range(COLUMNS)
            ):
                raise Panel1PresentationFailure("raw-to-kernel map is not a kernel")
    relation_to_presentation = raw[KERNEL * COLUMNS :]
    presentation = [
        sum(
            records[source * ROWS + row]
            * relation_to_presentation[column * COLUMNS + source]
            for source in range(COLUMNS)
        )
        for column in range(ROWS)
        for row in range(ROWS)
    ]
    class_number = abs(_bareiss_determinant(presentation, ROWS))

    # Rerun the source-transparent Smith path on the non-unit HNF block.  No
    # class answer is supplied to this computation.
    smith_buffers = [[0] for _ in range(10)]
    invariants = [0]
    computed_order = [0]
    smith_states = [
        [0] * 5,
        [0] * 5,
        [0] * 6,
        [0] * 6,
        [0] * 7,
    ]
    if (
        pari_class_group_smith_transform(
            [args[38][0]],
            1,
            *smith_buffers,
            invariants,
            computed_order,
            [0],
            [0],
            [0] * 2,
            *smith_states,
        )
        != 0
    ):
        raise Panel1PresentationFailure("source Smith replay failed")
    if computed_order != [class_number]:
        raise Panel1PresentationFailure("full presentation and Smith order differ")
    nontrivial = [value for value in invariants if value > 1]
    return {
        "rawToTerminal": raw,
        "rawToKernel": kernel,
        "relationToPresentation": relation_to_presentation,
        "presentation": presentation,
        "classNumber": class_number,
        "invariants": nontrivial,
        "transformedLogs": args[41],
        "terminalPermutation": args[3],
        "cleanupTransform": cleanup,
        "activeRelation": args[24][: 6 * 13],
        "activeFullHnf": args[29][: 6 * 13],
        "activeTransform": args[30][: 13 * 13],
        "activeDiagonal": args[37][:6],
        "hnfState": args[43],
        "smithState": smith_states[-1],
    }


def _factor_base_and_relations(
    events: Sequence[Any],
    table: list[int],
    records: list[int],
    generators: list[int],
    terminal_permutation: Sequence[int],
) -> tuple[list[int], list[int], list[int]]:
    factor = _event(events, "factor_base")
    class_input = _event(events, "class_group_input")
    descriptors = factor.get("LP")
    retained = class_input.get("Vbase")
    if not isinstance(descriptors, Mapping) or descriptors.get("kind") != "vector":
        raise Panel1PresentationFailure("factor descriptors changed")
    entries = descriptors.get("values")
    if not isinstance(entries, list) or len(entries) != ROWS:
        raise Panel1PresentationFailure("factor-base size changed")
    ideals: list[int] = []
    norms: list[int] = []
    descriptor_owner: list[int] = []
    for index, descriptor in enumerate(entries):
        if not isinstance(descriptor, Mapping) or descriptor.get("kind") != "vector":
            raise Panel1PresentationFailure("factor descriptor changed")
        values = descriptor.get("values")
        if not isinstance(values, list) or len(values) != 5:
            raise Panel1PresentationFailure("factor descriptor width changed")
        prime = _exported_integer(values[0], "factor prime")
        generator = _exported_vector(values[1], DEGREE, "factor generator")
        ramification = _exported_integer(values[2], "factor ramification")
        residue_degree = _exported_integer(values[3], "factor residue degree")
        tau = _exported_matrix(values[4], DEGREE, DEGREE, "factor tau")
        inert = int(residue_degree == DEGREE)
        ideal = [0] * 9
        pari_prime_ideal_hnf(
            table,
            generator,
            DEGREE,
            prime,
            inert,
            [0] * 9,
            [0] * 9,
            [0] * 3,
            ideal,
        )
        norm = prime**residue_degree
        if abs(_determinant3(ideal)) != norm:
            raise Panel1PresentationFailure("factor ideal norm changed")
        descriptor_owner.extend(
            [prime, ramification, residue_degree, inert, *generator, *tau]
        )
        ideals.extend(ideal)
        norms.append(norm)

    class_relations = class_input.get("relationRecords")
    hnf_relations = _event(events, "hnf").get("relationRecords")
    if class_relations != hnf_relations:
        raise Panel1PresentationFailure("class input detached from retained relations")
    identity = [1, 0, 0, 0, 1, 0, 0, 0, 1]
    for column in range(COLUMNS):
        product = identity
        row = records[ROWS * column : ROWS * (column + 1)]
        if any(exponent < 0 or exponent > 8 for exponent in row):
            raise Panel1PresentationFailure("relation exponent left retained domain")
        for factor_ideal, exponent in zip(
            (ideals[9 * index : 9 * (index + 1)] for index in range(ROWS)),
            row,
            strict=True,
        ):
            for _ in range(exponent):
                product = _multiply_ideals(product, factor_ideal, table)
        principal = [0] * 9
        pari_cubic_mul_matrix(
            table,
            generators[DEGREE * column : DEGREE * (column + 1)],
            principal,
        )
        if not _same_lattice(product, principal):
            raise Panel1PresentationFailure(
                "principal ideal replay failed at relation " + str(column + 1)
            )
    if not isinstance(retained, Mapping) or retained.get("kind") != "vector":
        raise Panel1PresentationFailure("Vbase descriptors changed")
    retained_entries = retained.get("values")
    if not isinstance(retained_entries, list) or retained_entries != [
        entries[position - 1] for position in terminal_permutation
    ]:
        raise Panel1PresentationFailure("Vbase detached from terminal permutation")
    descriptor_width = 16
    vbase_descriptors = [
        value
        for position in terminal_permutation
        for value in descriptor_owner[
            (position - 1) * descriptor_width : position * descriptor_width
        ]
    ]
    vbase_ideals = [
        value
        for position in terminal_permutation
        for value in ideals[(position - 1) * 9 : position * 9]
    ]
    vbase_norms = [norms[position - 1] for position in terminal_permutation]
    return vbase_descriptors, vbase_ideals, vbase_norms


def compose_authenticated_panel1_presentation(
    w0: Mapping[str, Any], ancestry: Mapping[str, Any]
) -> dict[str, Any]:
    """Compute and serialize the row-1 presentation from authenticated W0."""
    if (
        w0.get("schema") != W0_SCHEMA
        or w0.get("field", {}).get("id") != FIELD_ID
        or w0.get("field", {}).get("panelIndex") != 1
    ):
        raise Panel1PresentationFailure("wrong W0 field authority")
    events = w0.get("events")
    if not isinstance(events, list):
        raise Panel1PresentationFailure("W0 events changed")
    prepared = _event(events, "prepared")
    if prepared.get("polynomial") != ["20018", "-20010", "0", "1"]:
        raise Panel1PresentationFailure("prepared polynomial changed")
    table = _integers(prepared.get("multiplicationTensor"), 27, "multiplication tensor")
    hnf_event = _event(events, "hnf")
    records, generators, logs = _raw_relations_and_logs(hnf_event, prepared)
    factor_event = _event(events, "factor_base")
    permutation = _exported_vector(
        factor_event.get("perm"), ROWS, "initial HNF permutation"
    )
    replay = _source_presentation(records, logs, permutation)
    expected_logs = _packed_matrix(
        hnf_event.get("exactC"), PLACES, COLUMNS, "retained HNF logs"
    )
    if replay["transformedLogs"] != expected_logs:
        raise Panel1PresentationFailure("source packed-log replay changed")
    expected_w = _exported_matrix(hnf_event.get("exactW"), 1, 1, "retained W")
    if expected_w != [replay["classNumber"]]:
        raise Panel1PresentationFailure(
            "retained W detached from computed presentation"
        )
    descriptors, ideals, norms = _factor_base_and_relations(
        events, table, records, generators, replay["terminalPermutation"]
    )

    acceptance = _event(events, "acceptance")
    relation_lattice = _exported_matrix(
        acceptance.get("lattice"), UNIT_RANK, KERNEL, "acceptance lattice"
    )
    packed_regulator = _packed_real(acceptance.get("exactR"), "acceptance regulator")
    final = _event(events, "result")
    expected_answer = {
        "classNumber": _integer(final.get("classNumber"), "final class number"),
        "invariants": _integers(final.get("invariants"), 1, "final invariants"),
    }
    computed_answer = {
        "classNumber": replay["classNumber"],
        "invariants": replay["invariants"],
    }
    if computed_answer != expected_answer:
        raise Panel1PresentationFailure(
            "computed presentation differs from final answer"
        )

    embedding_m = _prepared_triples(
        prepared.get("embeddingM"), DEGREE**2, "prepared embeddingM"
    )
    embedding_g = _prepared_triples(
        prepared.get("embeddingG"), DEGREE**2, "prepared embeddingG"
    )
    rounded_value = prepared.get("roundedEmbedding")
    if not isinstance(rounded_value, list) or len(rounded_value) != DEGREE**2:
        raise Panel1PresentationFailure("rounded embedding has the wrong shape")
    rounded = [
        _exported_integer(value, f"rounded embedding[{index}]")
        for index, value in enumerate(rounded_value)
    ]
    root_intervals = [[-142, -141], [1, 2], [140, 141]]
    polynomial = [20018, -20010, 0, 1]
    for left, right in root_intervals:
        left_value = sum(
            coefficient * left**power for power, coefficient in enumerate(polynomial)
        )
        right_value = sum(
            coefficient * right**power for power, coefficient in enumerate(polynomial)
        )
        if left_value == 0 or right_value == 0 or (left_value < 0) == (right_value < 0):
            raise Panel1PresentationFailure("root interval is not sign-certified")
    kernel_logs = replay["transformedLogs"][: LOG_STRIDE * KERNEL]
    return {
        "schema": SCHEMA,
        "field": {
            "id": FIELD_ID,
            "polynomial": ["20018", "-20010", "0", "1"],
            "signature": [3, 0],
            "discriminant": str(prepared.get("discriminant")),
            "index": str(prepared.get("index")),
            "basisDenominator": str(prepared.get("zkden")),
            "basis": [str(value) for value in prepared.get("zk", [])],
            "multiplicationTensor": _strings(table),
            "tensorLayout": "output-major,column-major integral-basis multiplication",
            "embeddingM": _strings(embedding_m),
            "embeddingG": _strings(embedding_g),
            "roundedEmbedding": _strings(rounded),
            "rootIntervals": [
                [str(left), str(right)] for left, right in root_intervals
            ],
            "rootIdentity": "prepared embeddingG columns in W0 order",
        },
        "ancestry": dict(ancestry),
        "dimensions": {
            "degree": DEGREE,
            "places": PLACES,
            "factorBaseSize": ROWS,
            "relationCount": COLUMNS,
            "kernelRank": KERNEL,
            "unitRank": UNIT_RANK,
        },
        "factorBase": {
            "descriptorWidth": 16,
            "descriptors": _strings(descriptors),
            "idealShape": [DEGREE, DEGREE, ROWS],
            "ideals": _strings(ideals),
            "norms": _strings(norms),
            "descriptorsSha256": _array_digest(descriptors),
            "idealsSha256": _array_digest(ideals),
        },
        "relations": {
            "matrixShape": [ROWS, COLUMNS],
            "matrix": _strings(records),
            "principalGeneratorsShape": [DEGREE, COLUMNS],
            "principalGenerators": _strings(generators),
            "packedLogsShape": [PLACES, COLUMNS, 7],
            "packedLogs": _strings(logs),
            "matrixSha256": _array_digest(records),
            "principalGeneratorsSha256": _array_digest(generators),
            "packedLogsSha256": _array_digest(logs),
        },
        "presentation": {
            "matrixShape": [ROWS, ROWS],
            "matrix": _strings(replay["presentation"]),
            "relationToPresentationShape": [COLUMNS, ROWS],
            "relationToPresentation": _strings(replay["relationToPresentation"]),
            "rawToKernelShape": [COLUMNS, KERNEL],
            "rawToKernel": _strings(replay["rawToKernel"]),
            "kernelLogsShape": [PLACES, KERNEL, 7],
            "kernelLogs": _strings(kernel_logs),
            "relationLatticeShape": [UNIT_RANK, KERNEL],
            "relationLattice": _strings(relation_lattice),
            "packedRegulator": _strings(packed_regulator),
            "classNumber": str(replay["classNumber"]),
            "invariants": _strings(replay["invariants"]),
            "matrixSha256": _array_digest(replay["presentation"]),
            "rawToKernelSha256": _array_digest(replay["rawToKernel"]),
        },
        "replay": {
            "cleanupTransformShape": [COLUMNS, COLUMNS],
            "cleanupTransform": _strings(replay["cleanupTransform"]),
            "activeRelationShape": [6, 13],
            "activeRelation": _strings(replay["activeRelation"]),
            "activeFullHnfShape": [6, 13],
            "activeFullHnf": _strings(replay["activeFullHnf"]),
            "activeTransformShape": [13, 13],
            "activeTransform": _strings(replay["activeTransform"]),
            "activeDiagonal": _strings(replay["activeDiagonal"]),
            "terminalPermutation": _strings(replay["terminalPermutation"]),
            "cleanupTransformSha256": _array_digest(replay["cleanupTransform"]),
            "activeRelationSha256": _array_digest(replay["activeRelation"]),
            "activeFullHnfSha256": _array_digest(replay["activeFullHnf"]),
            "activeTransformSha256": _array_digest(replay["activeTransform"]),
            "hnfState": replay["hnfState"],
            "smithState": replay["smithState"],
            "all51DescriptorsReconstructed": True,
            "all58PrincipalRelationsReplayed": True,
            "rawRelationsTimesKernelZero": True,
            "computedBeforeExpectedComparison": True,
        },
        "comparison": {
            "expectedClassNumber": str(expected_answer["classNumber"]),
            "expectedInvariants": _strings(expected_answer["invariants"]),
            "matches": True,
        },
    }


__all__ = [
    "Panel1PresentationFailure",
    "SCHEMA",
    "compose_authenticated_panel1_presentation",
]
