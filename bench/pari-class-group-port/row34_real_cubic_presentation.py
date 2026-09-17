"""Exact source-derived presentations for frozen panel rows 3 and 4.

The pristine W0 owner supplies prepared field state, retained principal
relations, and source observables.  This module recomputes the raw logarithms,
replays translated ``hnfspec_i``, reconstructs every factor ideal and
principal relation, and derives the non-unit presentation before consulting
the terminal class answer.

PARI 2.17.4 algorithm, copyright (C) The PARI group;
GPL-2.0-or-later.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

from .class_group_smith_transform import pari_class_group_smith_transform
from .field3_unit_transform_retention import _pari_reverse_hnffinal_selection
from .hnfspec_complete import pari_hnfspec_complete
from .hnfspec_cleanup import pari_hnfspec_cleanup
from .mixed_cubic_presentation import _factor_base_and_relations_dynamic
from .panel1_presentation_authority import (
    _array_digest,
    _exported_integer,
    _exported_matrix,
    _exported_vector,
    _packed_matrix,
    _packed_real,
    _prepared_triples,
    _strings,
)
from .relation_log_embeddings import pari_append_relation_log_embeddings


SCHEMA = "sagejs.pari-class-group/row34-real-cubic-presentation-v1"
W0_SCHEMA = "sagejs.pari-class-group/development-default-driver-trace-v1"
DEGREE = 3
PLACES = 3
LOG_STRIDE = 7 * PLACES
UNIT_RANK = 2
KERNEL_RANK = 7

FIELDS = {
    3: {
        "id": "generated-sha256-11997528676ebeb1c0636be2cb828b5ed5a527ea18eb3a4ace953984da507de9",
        "polynomial": ["20000000042", "-20000000022", "0", "1"],
        "factor_base": 668,
        "relations": 675,
        "subfactor": 4,
        "class_number": 6,
        "invariants": [6],
        "w_dimension": 2,
    },
    4: {
        "id": "generated-sha256-806defcf929c9cfff7467b8e7ea7b9f939cdd042bce8c1f5a310f5688904e3b9",
        "polynomial": ["20000000018", "-20000000010", "0", "1"],
        "factor_base": 560,
        "relations": 567,
        "subfactor": 4,
        "class_number": 2,
        "invariants": [2],
        "w_dimension": 1,
    },
}


class Row34PresentationFailure(ValueError):
    """A row-3/4 presentation failed closed."""


def _event(events: Sequence[Any], name: str) -> Mapping[str, Any]:
    selected = [
        value
        for value in events
        if isinstance(value, Mapping) and value.get("event") == name
    ]
    if len(selected) != 1:
        raise Row34PresentationFailure("W0 does not contain one " + name)
    return selected[0]


def _raw_relations_and_logs(
    hnf: Mapping[str, Any], prepared: Mapping[str, Any], rows: int, columns: int
) -> tuple[list[int], list[int], list[int], int]:
    witnesses = hnf.get("relationRecords")
    if not isinstance(witnesses, list) or len(witnesses) != columns:
        raise Row34PresentationFailure("retained relation count changed")
    records: list[int] = []
    generators: list[int] = []
    scalar_prefix = 0
    for column, witness in enumerate(witnesses):
        if not isinstance(witness, Mapping):
            raise Row34PresentationFailure("relation witness is malformed")
        records.extend(_exported_vector(witness.get("R"), rows, "relation"))
        alpha = witness.get("m")
        if isinstance(alpha, Mapping) and alpha.get("kind") == "integer":
            if column != scalar_prefix:
                raise Row34PresentationFailure("scalar relation prefix changed")
            generators.extend([_exported_integer(alpha, "principal generator"), 0, 0])
            scalar_prefix += 1
        else:
            generators.extend(_exported_vector(alpha, DEGREE, "principal generator"))
    embedding = prepared.get("embeddingM")
    if not isinstance(embedding, list) or len(embedding) != DEGREE**2:
        raise Row34PresentationFailure("prepared embedding changed")
    matrix_m: list[int] = []
    matrix_p: list[int] = []
    matrix_e: list[int] = []
    for index, entry in enumerate(embedding):
        mantissa, precision, exponent = _packed_real(
            entry, f"prepared embedding[{index}]"
        )
        matrix_m.append(mantissa)
        matrix_p.append(precision)
        matrix_e.append(exponent)
    logs = [0] * (LOG_STRIDE * columns)
    completed = [0]
    metadata = [value for index in range(columns) for value in (index + 1, 0, 0)]
    pari_append_relation_log_embeddings(
        matrix_m,
        matrix_p,
        matrix_e,
        generators,
        metadata,
        columns,
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
    if completed != [columns]:
        raise Row34PresentationFailure("relation-log replay is incomplete")
    expected = _packed_matrix(
        hnf.get("exactEmbeddings"), PLACES, columns, "retained raw logs"
    )
    if logs != expected:
        raise Row34PresentationFailure("source-derived raw logarithms changed")
    return records, generators, logs, scalar_prefix


def _smith(w: list[int], dimension: int) -> tuple[list[int], int, list[int]]:
    size = dimension * dimension
    matrices = [[0] * size for _ in range(10)]
    invariants = [0] * dimension
    class_number = [0]
    states = [[0] * 7 for _ in range(5)]
    if (
        pari_class_group_smith_transform(
            w,
            dimension,
            *matrices,
            invariants,
            class_number,
            [0] * dimension,
            [0] * size,
            [0] * (2 * size),
            *states,
        )
        != 0
    ):
        raise Row34PresentationFailure("source Smith replay failed")
    return [value for value in invariants if value > 1], class_number[0], states[-1]


def _source_replay(
    records: list[int],
    logs: list[int],
    permutation: list[int],
    rows: int,
    columns: int,
    subfactor_count: int,
) -> dict[str, Any]:
    size = rows * columns
    log_size = LOG_STRIDE * columns

    def zero(length: int) -> list[int]:
        return [0] * length

    # CUP capacity depends on the authenticated cleanup shape, not merely the
    # much larger raw matrix.  Run the same deterministic cleanup as a
    # preflight and derive the exact source workspace formula from its state.
    cleanup_state = zero(10)
    cleanup_sparse_state = zero(13)
    if pari_hnfspec_cleanup(
        records,
        rows,
        columns,
        permutation,
        subfactor_count,
        PLACES,
        zero(size),
        zero(subfactor_count * columns),
        zero(columns * columns),
        zero(columns),
        zero(1),
        cleanup_sparse_state,
        zero((rows - subfactor_count) * columns),
        zero(subfactor_count * columns),
        zero(size),
        cleanup_state,
    ) not in (0, 1):
        raise Row34PresentationFailure("source cleanup preflight failed")
    cup_rows = cleanup_state[3]
    cup_columns = cleanup_state[2] - 1
    if cup_rows < 0 or cup_columns < 0:
        raise Row34PresentationFailure("source cleanup dimensions changed")
    cup_capacity = 0
    if cup_rows >= 8 and cup_columns >= 8:
        cup_capacity = 8 * cup_rows * cup_columns * (cup_rows // 4 + 1)
    cup_frames = 3 * (cup_columns.bit_length() + 1)
    args: list[Any] = [
        records,
        rows,
        columns,
        permutation,
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
        zero(cup_capacity),
        zero(cup_frames),
        zero(8),
        zero(8),
    ]
    if pari_hnfspec_complete(*args) != 0:
        raise Row34PresentationFailure("source HNF replay did not complete")
    state = args[43]
    w_dimension = state[0]
    if state[7] != columns or state[8] != 0 or columns - rows != KERNEL_RANK:
        raise Row34PresentationFailure("source HNF terminal dimensions changed")

    # Only the seven exact kernel columns and the non-unit class columns are
    # transported back to raw relation order.  Reversing the hundreds of unit
    # presentation columns would add no class or unit authority.
    targets = KERNEL_RANK + w_dimension
    selected = zero(columns * targets)
    for target in range(targets):
        selected[target * columns + target] = 1
    _pari_reverse_hnffinal_selection(
        selected,
        columns,
        targets,
        args[27][0],
        0,
        args[27][2],
        args[27][4],
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
        zero(columns * targets),
        zero(args[27][0] * args[27][4]),
    )
    cleanup = args[9]
    raw = zero(columns * targets)
    for target in range(targets):
        for source in range(columns):
            raw[target * columns + source] = sum(
                cleanup[cleaned * columns + source]
                * selected[target * columns + cleaned]
                for cleaned in range(columns)
            )
    products = [
        [
            sum(
                records[source * rows + row] * raw[target * columns + source]
                for source in range(columns)
            )
            for row in range(rows)
        ]
        for target in range(targets)
    ]
    kernel_indices = [
        index for index, product in enumerate(products) if not any(product)
    ]
    class_indices = [index for index in range(targets) if index not in kernel_indices]
    if len(kernel_indices) != KERNEL_RANK or len(class_indices) != w_dimension:
        raise Row34PresentationFailure("bounded reverse transform changed dimensions")
    return {
        "state": state,
        "permutation": args[3],
        "w": args[38][: w_dimension * w_dimension],
        "dep": args[39],
        "b": args[40],
        "c": args[41],
        "kernelMap": [
            raw[index * columns + source]
            for index in kernel_indices
            for source in range(columns)
        ],
        "classMap": [
            raw[index * columns + source]
            for index in class_indices
            for source in range(columns)
        ],
        "classExponents": [
            value for index in class_indices for value in products[index]
        ],
        "cleanupSha256": _array_digest(cleanup),
    }


def compose_row34_real_cubic_presentation(
    w0: Mapping[str, Any], ancestry: Mapping[str, Any], panel_index: int
) -> dict[str, Any]:
    """Derive one frozen row-3/4 presentation without answer inputs."""
    config = FIELDS.get(panel_index)
    if config is None:
        raise Row34PresentationFailure("unsupported real-cubic panel row")
    field = w0.get("field", {})
    if (
        w0.get("schema") != W0_SCHEMA
        or field.get("panelIndex") != panel_index
        or field.get("id") != config["id"]
        or field.get("degree") != DEGREE
        or field.get("signature") != [3, 0]
        or field.get("unitRank") != UNIT_RANK
        or field.get("coefficients") != config["polynomial"]
    ):
        raise Row34PresentationFailure("wrong real-cubic W0 authority")
    events = w0.get("events")
    if not isinstance(events, list):
        raise Row34PresentationFailure("W0 events changed")
    hnfs = [entry for entry in events if entry.get("event") == "hnf"]
    acceptances = [entry for entry in events if entry.get("event") == "acceptance"]
    if len(hnfs) != 1 or len(acceptances) != 1 or acceptances[0].get("code") != 0:
        raise Row34PresentationFailure("W0 is not one accepted HNF pass")
    rows = int(config["factor_base"])
    columns = int(config["relations"])
    prepared = _event(events, "prepared")
    factor = _event(events, "factor_base")
    if factor.get("subfactorCount") != config["subfactor"]:
        raise Row34PresentationFailure("subfactor count changed")
    records, generators, logs, scalar_prefix = _raw_relations_and_logs(
        hnfs[0], prepared, rows, columns
    )
    replay = _source_replay(
        records,
        logs,
        _exported_vector(factor.get("perm"), rows, "initial permutation"),
        rows,
        columns,
        int(config["subfactor"]),
    )
    hnf = hnfs[0]
    w_dimension = int(config["w_dimension"])
    expected_w = _exported_matrix(hnf.get("exactW"), w_dimension, w_dimension, "W")
    expected_dep = _exported_matrix(hnf.get("exactDep"), 0, w_dimension, "dep")
    b_columns = rows - w_dimension
    expected_b = _exported_matrix(hnf.get("exactB"), w_dimension, b_columns, "B")
    expected_c = _packed_matrix(hnf.get("exactC"), PLACES, columns, "C")
    expected_perm = _exported_vector(hnf.get("perm"), rows, "HNF permutation")
    if (
        replay["w"] != expected_w
        or replay["dep"][: len(expected_dep)] != expected_dep
        or replay["b"][: len(expected_b)] != expected_b
        or replay["c"] != expected_c
        or replay["permutation"] != expected_perm
    ):
        raise Row34PresentationFailure("translated HNF differs from retained W0")

    # R*V consists of the non-unit W columns embedded at the first terminal
    # factor-base positions.  This proves that W presents the full quotient.
    expected_exponents = [0] * (rows * w_dimension)
    for column in range(w_dimension):
        for terminal_row in range(w_dimension):
            source_row = expected_perm[terminal_row] - 1
            expected_exponents[column * rows + source_row] = expected_w[
                column * w_dimension + terminal_row
            ]
    if replay["classExponents"] != expected_exponents:
        raise Row34PresentationFailure("raw class map does not present terminal W")
    invariants, class_number, smith_state = _smith(expected_w, w_dimension)
    computed = {"classNumber": class_number, "invariants": invariants}
    if computed != {
        "classNumber": config["class_number"],
        "invariants": config["invariants"],
    }:
        raise Row34PresentationFailure("source-derived class invariants changed")

    table = [int(value) for value in prepared.get("multiplicationTensor", [])]
    if len(table) != DEGREE**3:
        raise Row34PresentationFailure("multiplication tensor changed")
    descriptors, ideals, norms = _factor_base_and_relations_dynamic(
        events, table, records, generators, expected_perm
    )
    relation_lattice = _exported_matrix(
        acceptances[0].get("lattice"), UNIT_RANK, KERNEL_RANK, "unit lattice"
    )
    packed_regulator = _packed_real(acceptances[0].get("exactR"), "regulator")

    # The terminal answer is opened only after all source-derived arithmetic.
    final = _event(events, "result")
    expected_answer = {
        "classNumber": int(final.get("classNumber")),
        "invariants": [int(value) for value in final.get("invariants", [])],
    }
    if computed != expected_answer:
        raise Row34PresentationFailure(
            "computed presentation differs from final answer"
        )
    return {
        "schema": SCHEMA,
        "field": {
            "id": config["id"],
            "panelIndex": panel_index,
            "polynomial": config["polynomial"],
            "signature": [3, 0],
            "discriminant": str(prepared.get("discriminant")),
            "index": str(prepared.get("index")),
            "basisDenominator": str(prepared.get("zkden")),
            "basis": [str(value) for value in prepared.get("zk", [])],
            "multiplicationTensor": _strings(table),
            "embeddingM": _strings(
                _prepared_triples(prepared.get("embeddingM"), 9, "embeddingM")
            ),
            "embeddingG": _strings(
                _prepared_triples(prepared.get("embeddingG"), 9, "embeddingG")
            ),
        },
        "ancestry": dict(ancestry),
        "dimensions": {
            "degree": 3,
            "places": 3,
            "factorBaseSize": rows,
            "relationCount": columns,
            "kernelRank": KERNEL_RANK,
            "unitRank": UNIT_RANK,
            "classPresentationDimension": w_dimension,
            "subfactorCount": int(config["subfactor"]),
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
            "packedLogsSha256": _array_digest(logs),
            "scalarPrefixCount": scalar_prefix,
            "matrixSha256": _array_digest(records),
            "principalGeneratorsSha256": _array_digest(generators),
        },
        "presentation": {
            "terminalW": _strings(expected_w),
            "rawToKernel": _strings(replay["kernelMap"]),
            "rawToClassPresentation": _strings(replay["classMap"]),
            "classExponentMatrix": _strings(replay["classExponents"]),
            "relationLattice": _strings(relation_lattice),
            "packedRegulator": _strings(packed_regulator),
            "classNumber": str(class_number),
            "invariants": _strings(invariants),
            "terminalWSha256": _array_digest(expected_w),
            "rawToKernelSha256": _array_digest(replay["kernelMap"]),
            "rawToClassPresentationSha256": _array_digest(replay["classMap"]),
        },
        "replay": {
            "terminalPermutation": _strings(expected_perm),
            "hnfState": replay["state"],
            "smithState": smith_state,
            "cleanupTransformSha256": replay["cleanupSha256"],
            "allDescriptorsReconstructed": True,
            "allPrincipalRelationsReplayed": True,
            "rawRelationsTimesKernelZero": True,
            "rawRelationsTimesClassMapEqualsEmbeddedW": True,
            "computedBeforeExpectedComparison": True,
        },
        "comparison": {**expected_answer, "matches": True},
        "assumptions": {
            "pariCorrespondence": "PARI-2.17.4-buchall",
            "factorBaseSelection": "upstream-assumed",
            "grhAndRelationBounds": "upstream-assumed",
            "independentSageCertification": False,
        },
        "completion": {
            "presentationComplete": True,
            "classWitnessesComplete": False,
            "unitsComplete": False,
            "correspondenceComplete": False,
            "publicComplete": False,
        },
    }


__all__ = [
    "FIELDS",
    "Row34PresentationFailure",
    "SCHEMA",
    "compose_row34_real_cubic_presentation",
]
