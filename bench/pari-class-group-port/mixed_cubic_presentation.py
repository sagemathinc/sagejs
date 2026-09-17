"""Source-derived presentation connector for mixed-signature cubic W0 rows.

The connector consumes retained principal relations, recomputes their
one-real/one-complex logarithms, reruns the translated PARI relation-HNF, and
derives the class presentation before consulting the terminal W0 answer.
It deliberately does not consume `fundamental_units`.
"""

from __future__ import annotations

from typing import Any, Mapping, Sequence

from .class_group_smith_transform import pari_class_group_smith_transform
from .field3_unit_transform_retention import _pari_reverse_hnffinal_selection
from .hnfspec_complete import pari_hnfspec_complete
from .panel1_presentation_authority import (
    _array_digest,
    _bareiss_determinant,
    _determinant3,
    _exported_integer,
    _exported_matrix,
    _exported_vector,
    _multiply_ideals,
    _packed_matrix,
    _packed_real,
    _prepared_triples,
    _same_lattice,
    _strings,
)
from .relation_log_embeddings import pari_append_relation_log_embeddings
from .prime_ideal_hnf import pari_prime_ideal_hnf
from .signed_prime_ideal_reduction import pari_cubic_mul_matrix


SCHEMA = "sagejs.pari-class-group/mixed-cubic-presentation-v1"
W0_SCHEMA = "sagejs.pari-class-group/development-default-driver-trace-v1"
DEGREE = 3
REAL_PLACES = 1
PLACES = 2
LOG_STRIDE = 14


class MixedCubicPresentationFailure(ValueError):
    """A mixed-cubic source owner failed closed."""


def _event(events: Sequence[Any], name: str, ordinal: int = 0) -> Mapping[str, Any]:
    selected = [
        entry
        for entry in events
        if isinstance(entry, Mapping) and entry.get("event") == name
    ]
    if ordinal < 0 or ordinal >= len(selected):
        raise MixedCubicPresentationFailure(f"missing W0 {name} event {ordinal}")
    return selected[ordinal]


def _raw_relations_and_logs(
    hnf_event: Mapping[str, Any],
    prepared: Mapping[str, Any],
    rows: int,
) -> tuple[list[int], list[int], list[int], int]:
    witnesses = hnf_event.get("relationRecords")
    if not isinstance(witnesses, list) or not witnesses:
        raise MixedCubicPresentationFailure("retained relations are missing")
    columns = len(witnesses)
    records: list[int] = []
    generators: list[int] = []
    scalar_prefix = 0
    for column, witness in enumerate(witnesses):
        if not isinstance(witness, Mapping):
            raise MixedCubicPresentationFailure("relation witness is malformed")
        records.extend(_exported_vector(witness.get("R"), rows, "relation"))
        alpha = witness.get("m")
        if isinstance(alpha, Mapping) and alpha.get("kind") == "integer":
            if column != scalar_prefix:
                raise MixedCubicPresentationFailure("scalar relation prefix changed")
            generators.extend([_exported_integer(alpha, "principal generator"), 0, 0])
            scalar_prefix += 1
        else:
            generators.extend(
                _exported_vector(alpha, DEGREE, "principal generator")
            )
    matrix_m: list[int] = []
    matrix_p: list[int] = []
    matrix_e: list[int] = []
    embedding = prepared.get("embeddingM")
    if not isinstance(embedding, list) or len(embedding) != DEGREE**2:
        raise MixedCubicPresentationFailure("prepared embedding changed")
    for index, entry in enumerate(embedding):
        mantissa, precision, exponent = _packed_real(
            entry, f"prepared embedding[{index}]"
        )
        matrix_m.append(mantissa)
        matrix_p.append(precision)
        matrix_e.append(exponent)
    logs = [0] * (LOG_STRIDE * columns)
    metadata = [value for index in range(columns) for value in (index + 1, 0, 0)]
    completed = [0]
    pari_append_relation_log_embeddings(
        matrix_m,
        matrix_p,
        matrix_e,
        generators,
        metadata,
        columns,
        DEGREE,
        REAL_PLACES,
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
    if completed != [columns]:
        raise MixedCubicPresentationFailure("mixed-cubic log replay is incomplete")
    expected = _packed_matrix(
        hnf_event.get("exactEmbeddings"), PLACES, columns, "retained raw logs"
    )
    if logs != expected:
        raise MixedCubicPresentationFailure("source-derived raw logarithms changed")
    return records, generators, logs, scalar_prefix


def _smith(hnf: list[int], dimension: int) -> tuple[list[int], int, list[int]]:
    size = dimension * dimension
    matrices = [[0] * size for _ in range(10)]
    invariants = [0] * dimension
    class_number = [0]
    states = [[0] * 7 for _ in range(5)]
    status = pari_class_group_smith_transform(
        hnf,
        dimension,
        *matrices,
        invariants,
        class_number,
        [0] * dimension,
        [0] * size,
        [0] * (2 * size),
        *states,
    )
    if status != 0:
        raise MixedCubicPresentationFailure("source Smith replay failed")
    return [value for value in invariants if value > 1], class_number[0], states[-1]


def _factor_base_and_relations_dynamic(
    events: Sequence[Any],
    table: list[int],
    records: list[int],
    generators: list[int],
    terminal_permutation: Sequence[int],
) -> tuple[list[int], list[int], list[int]]:
    rows = len(terminal_permutation)
    columns = len(generators) // DEGREE
    factor = _event(events, "factor_base")
    class_input = _event(events, "class_group_input")
    descriptors = factor.get("LP")
    retained = class_input.get("Vbase")
    if not isinstance(descriptors, Mapping) or descriptors.get("kind") != "vector":
        raise MixedCubicPresentationFailure("factor descriptors changed")
    entries = descriptors.get("values")
    if not isinstance(entries, list) or len(entries) != rows:
        raise MixedCubicPresentationFailure("factor-base size changed")
    ideals: list[int] = []
    norms: list[int] = []
    descriptor_owner: list[int] = []
    for descriptor in entries:
        if not isinstance(descriptor, Mapping) or descriptor.get("kind") != "vector":
            raise MixedCubicPresentationFailure("factor descriptor changed")
        values = descriptor.get("values")
        if not isinstance(values, list) or len(values) != 5:
            raise MixedCubicPresentationFailure("factor descriptor width changed")
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
            raise MixedCubicPresentationFailure("factor ideal norm changed")
        descriptor_owner.extend(
            [prime, ramification, residue_degree, inert, *generator, *tau]
        )
        ideals.extend(ideal)
        norms.append(norm)
    if class_input.get("relationRecords") != _event(events, "hnf").get(
        "relationRecords"
    ):
        raise MixedCubicPresentationFailure("class input detached from relations")
    identity = [1, 0, 0, 0, 1, 0, 0, 0, 1]
    for column in range(columns):
        product = identity
        row = records[rows * column : rows * (column + 1)]
        if any(exponent < 0 or exponent > 8 for exponent in row):
            raise MixedCubicPresentationFailure("relation exponent left retained domain")
        for index, exponent in enumerate(row):
            for _ in range(exponent):
                product = _multiply_ideals(
                    product, ideals[9 * index : 9 * (index + 1)], table
                )
        principal = [0] * 9
        pari_cubic_mul_matrix(
            table,
            generators[DEGREE * column : DEGREE * (column + 1)],
            principal,
        )
        if not _same_lattice(product, principal):
            raise MixedCubicPresentationFailure(
                f"principal ideal replay failed at relation {column + 1}"
            )
    retained_entries = retained.get("values") if isinstance(retained, Mapping) else None
    if retained_entries != [entries[position - 1] for position in terminal_permutation]:
        raise MixedCubicPresentationFailure("Vbase detached from terminal permutation")
    width = 16
    ordered_descriptors = [
        value
        for position in terminal_permutation
        for value in descriptor_owner[(position - 1) * width : position * width]
    ]
    ordered_ideals = [
        value
        for position in terminal_permutation
        for value in ideals[(position - 1) * 9 : position * 9]
    ]
    ordered_norms = [norms[position - 1] for position in terminal_permutation]
    return ordered_descriptors, ordered_ideals, ordered_norms


def _source_presentation(
    records: list[int],
    logs: list[int],
    initial_permutation: list[int],
    rows: int,
    subfactor_count: int,
) -> dict[str, Any]:
    columns = len(records) // rows
    kernel = columns - rows
    size = rows * columns
    log_size = LOG_STRIDE * columns
    zero = lambda length: [0] * length
    args: list[Any] = [
        records,
        rows,
        columns,
        initial_permutation,
        subfactor_count,
        logs,
        PLACES,
        zero(size),
        zero(subfactor_count * columns),
        zero(columns * columns),
        zero(columns),
        zero(1),
        zero(13),
        zero((rows - subfactor_count) * columns),
        zero(subfactor_count * columns),
        zero(size),
        zero(10),
        zero(size),
        zero(columns),
        zero(rows),
        zero(rows),
        zero(rows + 1),
        zero(10),
        zero(rows),
        zero(size),
        zero(size),
        zero(size),
        zero(6),
        zero(log_size),
        zero(size),
        zero(columns * columns),
        zero(columns * columns),
        zero(columns + 1),
        zero(11),
        zero(size),
        zero(size),
        zero(log_size),
        zero(rows),
        zero(size),
        zero(size),
        zero(rows * (columns + rows)),
        zero(log_size),
        zero(7),
        zero(9),
        zero(160000),
        zero(32),
        zero(8),
        zero(8),
    ]
    if pari_hnfspec_complete(*args) != 0:
        raise MixedCubicPresentationFailure("source HNF replay did not complete")
    active_rows, _, active_columns, _, trailing_rows, _ = args[27]
    if active_rows + trailing_rows != rows or columns - active_columns != trailing_rows:
        raise MixedCubicPresentationFailure("source HNF active cut is inconsistent")

    selected = zero(columns * columns)
    for target in range(columns):
        selected[target * columns + target] = 1
    reversed_selection_work = zero(columns * columns)
    _pari_reverse_hnffinal_selection(
        selected,
        columns,
        columns,
        active_rows,
        0,
        active_columns,
        trailing_rows,
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
        reversed_selection_work,
        zero(active_rows * trailing_rows),
    )
    raw = zero(columns * columns)
    cleanup = args[9]
    for target in range(columns):
        for source in range(columns):
            raw[target * columns + source] = sum(
                cleanup[cleaned * columns + source]
                * selected[target * columns + cleaned]
                for cleaned in range(columns)
            )
    kernel_columns = [
        column
        for column in range(columns)
        if all(
            sum(
                records[source * rows + row] * raw[column * columns + source]
                for source in range(columns)
            )
            == 0
            for row in range(rows)
        )
    ]
    if len(kernel_columns) != kernel:
        raise MixedCubicPresentationFailure(
            f"source replay found {len(kernel_columns)} kernel columns, expected {kernel}"
        )
    presentation_columns = [
        column for column in range(columns) if column not in kernel_columns
    ]
    raw_to_kernel = [
        raw[column * columns + source]
        for column in kernel_columns
        for source in range(columns)
    ]
    for column in range(kernel):
        for row in range(rows):
            if sum(
                records[source * rows + row]
                * raw_to_kernel[column * columns + source]
                for source in range(columns)
            ):
                raise MixedCubicPresentationFailure("raw-to-kernel map is not a kernel")
    relation_map = [
        raw[column * columns + source]
        for column in presentation_columns
        for source in range(columns)
    ]
    presentation = [
        sum(
            records[source * rows + row]
            * relation_map[column * columns + source]
            for source in range(columns)
        )
        for column in range(rows)
        for row in range(rows)
    ]
    class_number = abs(_bareiss_determinant(presentation, rows))
    return {
        "rawToKernel": raw_to_kernel,
        "relationToPresentation": relation_map,
        "presentation": presentation,
        "classNumber": class_number,
        "transformedLogs": args[41],
        "terminalPermutation": args[3],
        "cleanupTransform": cleanup,
        "hnfState": args[43],
        "activeShape": [active_rows, active_columns],
        "activeRelation": args[24][: active_rows * active_columns],
        "activeFullHnf": args[29][: active_rows * active_columns],
        "activeTransform": args[30][: active_columns * active_columns],
        "activeDiagonal": args[37][:active_rows],
    }


def compose_one_pass_mixed_cubic_presentation(
    w0: Mapping[str, Any],
    ancestry: Mapping[str, Any],
    *,
    panel_index: int,
    field_id: str,
    subfactor_count: int,
) -> dict[str, Any]:
    """Compute one accepted mixed-cubic presentation from authenticated W0."""
    field = w0.get("field", {})
    if (
        w0.get("schema") != W0_SCHEMA
        or field.get("id") != field_id
        or field.get("panelIndex") != panel_index
        or field.get("degree") != DEGREE
        or field.get("signature") != [1, 1]
        or field.get("unitRank") != 1
    ):
        raise MixedCubicPresentationFailure("wrong mixed-cubic W0 authority")
    events = w0.get("events")
    if not isinstance(events, list):
        raise MixedCubicPresentationFailure("W0 events changed")
    hnfs = [entry for entry in events if entry.get("event") == "hnf"]
    acceptances = [entry for entry in events if entry.get("event") == "acceptance"]
    if len(hnfs) != 1 or len(acceptances) != 1 or acceptances[0].get("code") != 0:
        raise MixedCubicPresentationFailure("W0 is not a one-pass accepted owner")
    prepared = _event(events, "prepared")
    factor = _event(events, "factor_base")
    rows = len(_exported_vector(factor.get("perm"), len(factor["perm"]["values"]), "perm"))
    records, generators, logs, scalar_prefix = _raw_relations_and_logs(
        hnfs[0], prepared, rows
    )
    columns = len(generators) // DEGREE
    initial_permutation = _exported_vector(factor.get("perm"), rows, "initial perm")
    replay = _source_presentation(
        records, logs, initial_permutation, rows, subfactor_count
    )
    expected_c = _packed_matrix(hnfs[0].get("exactC"), PLACES, columns, "HNF C")
    expected_perm = _exported_vector(hnfs[0].get("perm"), rows, "HNF perm")
    if replay["transformedLogs"] != expected_c or replay["terminalPermutation"] != expected_perm:
        raise MixedCubicPresentationFailure("translated HNF differs from retained W0")
    exact_w_value = hnfs[0].get("exactW")
    smith_dimension = len(exact_w_value.get("values", []))
    exact_w = _exported_matrix(exact_w_value, smith_dimension, smith_dimension, "W")
    invariants, smith_order, smith_state = _smith(exact_w, smith_dimension)
    if smith_order != replay["classNumber"]:
        raise MixedCubicPresentationFailure("Smith order and full presentation differ")
    table = [int(value) for value in prepared.get("multiplicationTensor", [])]
    descriptors, ideals, norms = _factor_base_and_relations_dynamic(
        events, table, records, generators, replay["terminalPermutation"]
    )
    acceptance = acceptances[0]
    relation_lattice = _exported_matrix(
        acceptance.get("lattice"), 1, columns - rows, "rank-one lattice"
    )
    packed_regulator = _packed_real(acceptance.get("exactR"), "accepted regulator")
    final = _event(events, "result")
    expected_answer = {
        "classNumber": int(final.get("classNumber")),
        "invariants": [int(value) for value in final.get("invariants", [])],
    }
    computed_answer = {"classNumber": replay["classNumber"], "invariants": invariants}
    if computed_answer != expected_answer:
        raise MixedCubicPresentationFailure("computed presentation differs from final answer")
    embedding_m = _prepared_triples(prepared.get("embeddingM"), 9, "embeddingM")
    embedding_g = _prepared_triples(prepared.get("embeddingG"), 9, "embeddingG")
    kernel = columns - rows
    return {
        "schema": SCHEMA,
        "field": {
            "id": field_id,
            "panelIndex": panel_index,
            "polynomial": list(field.get("coefficients", [])),
            "signature": [1, 1],
            "discriminant": str(prepared.get("discriminant")),
            "index": str(prepared.get("index")),
            "basisDenominator": str(prepared.get("zkden")),
            "basis": [str(value) for value in prepared.get("zk", [])],
            "multiplicationTensor": _strings(table),
            "embeddingM": _strings(embedding_m),
            "embeddingG": _strings(embedding_g),
        },
        "ancestry": dict(ancestry),
        "dimensions": {
            "degree": 3,
            "places": 2,
            "factorBaseSize": rows,
            "relationCount": columns,
            "kernelRank": kernel,
            "unitRank": 1,
            "subfactorCount": subfactor_count,
        },
        "factorBase": {
            "descriptorWidth": 16,
            "descriptors": _strings(descriptors),
            "ideals": _strings(ideals),
            "norms": _strings(norms),
            "descriptorsSha256": _array_digest(descriptors),
            "idealsSha256": _array_digest(ideals),
        },
        "relations": {
            "matrix": _strings(records),
            "principalGenerators": _strings(generators),
            "packedLogs": _strings(logs),
            "scalarPrefixCount": scalar_prefix,
            "matrixSha256": _array_digest(records),
            "principalGeneratorsSha256": _array_digest(generators),
            "packedLogsSha256": _array_digest(logs),
        },
        "presentation": {
            "matrix": _strings(replay["presentation"]),
            "relationToPresentation": _strings(replay["relationToPresentation"]),
            "rawToKernel": _strings(replay["rawToKernel"]),
            "kernelLogs": _strings(replay["transformedLogs"][: LOG_STRIDE * kernel]),
            "relationLattice": _strings(relation_lattice),
            "packedRegulator": _strings(packed_regulator),
            "classNumber": str(replay["classNumber"]),
            "invariants": _strings(invariants),
            "matrixSha256": _array_digest(replay["presentation"]),
            "rawToKernelSha256": _array_digest(replay["rawToKernel"]),
        },
        "replay": {
            "terminalPermutation": _strings(replay["terminalPermutation"]),
            "cleanupTransform": _strings(replay["cleanupTransform"]),
            "activeShape": replay["activeShape"],
            "activeRelation": _strings(replay["activeRelation"]),
            "activeFullHnf": _strings(replay["activeFullHnf"]),
            "activeTransform": _strings(replay["activeTransform"]),
            "activeDiagonal": _strings(replay["activeDiagonal"]),
            "hnfState": replay["hnfState"],
            "smithState": smith_state,
            "allDescriptorsReconstructed": True,
            "allPrincipalRelationsReplayed": True,
            "rawRelationsTimesKernelZero": True,
            "computedBeforeExpectedComparison": True,
        },
        "comparison": {**expected_answer, "matches": True},
        "completion": {
            "presentationComplete": True,
            "classWitnessesComplete": False,
            "unitsComplete": False,
            "correspondenceComplete": False,
            "publicComplete": False,
        },
    }


__all__ = [
    "MixedCubicPresentationFailure",
    "SCHEMA",
    "compose_one_pass_mixed_cubic_presentation",
]
