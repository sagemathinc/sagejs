"""Exact terminal relation closure for authenticated panel row 8.

This ordinary Python owner replays the source 150+1+1 HNF schedule, retains
its global relation-column transformation, and checks every principal ideal
and norm against the prepared field embedded in W0.  C5 and C6 are ancestry
inputs only; in particular a PRECI C6 result is not promoted to public units.

PARI 2.17.4 algorithm, copyright (C) The PARI group;
GPL-2.0-or-later.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping, Sequence
from typing import Any

from .field3_relation_replay_map import (
    _determinant4,
    _principal_hnf,
    _quartic_hnf,
    _quartic_product,
)
from .field3_unit_transform_retention import _pari_reverse_hnffinal_selection
from .hnfadd import pari_hnfadd
from .hnfspec_complete import pari_hnfspec_complete
from .prime_ideal_hnf import pari_prime_ideal_hnf
from .quartic_signed_genback import pari_quartic_mul_matrix


SCHEMA = "sagejs.pari-class-group/panel8-terminal-closure-v1"
ACCEPTED_SCHEMA = "sagejs.pari-class-group/panel8-accepted-retry-owner-v1"
C5_SCHEMA = "sagejs.pari-class-group/panel8-c5-unit-lattice-cleanarch-v2"
C6_SCHEMA = "sagejs.pari-class-group/c6-getfu-not-given-v1"
W0_SCHEMA = "sagejs.pari-class-group/development-default-driver-trace-v1"
FIELD_ID = (
    "generated-sha256-0857fab7114ab0045f1b91601101549c7b8d854c5c999b91afcb190cd2863363"
)
ROWS = 143
COLUMNS = 152
INITIAL_COLUMNS = 150
KERNEL = 9
DEGREE = 4
PLACES = 3
LOG_STRIDE = 7 * PLACES


class Panel8TerminalClosureFailure(ValueError):
    """An authenticated terminal relation closure failed closed."""


def _integer(value: Any, label: str) -> int:
    if isinstance(value, bool) or not isinstance(value, (str, int)):
        raise Panel8TerminalClosureFailure(label + " is not an integer")
    try:
        result = int(value)
    except (ValueError, OverflowError) as error:
        raise Panel8TerminalClosureFailure(label + " is not an integer") from error
    if str(result) != str(value):
        raise Panel8TerminalClosureFailure(label + " is not canonical")
    return result


def _integers(value: Any, length: int, label: str) -> list[int]:
    if isinstance(value, (str, bytes)) or not isinstance(value, Sequence):
        raise Panel8TerminalClosureFailure(label + " is not a sequence")
    if len(value) != length:
        raise Panel8TerminalClosureFailure(label + " has the wrong length")
    return [_integer(entry, f"{label}[{index}]") for index, entry in enumerate(value)]


def _strings(value: Sequence[int]) -> list[str]:
    return [str(int(entry)) for entry in value]


def _digest(value: Any) -> str:
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


def _array_digest(value: Sequence[int]) -> str:
    return hashlib.sha256("\n".join(_strings(value)).encode()).hexdigest()


def _event(
    events: Sequence[Any], name: str, *, last: bool = False
) -> Mapping[str, Any]:
    selected = [
        entry
        for entry in events
        if isinstance(entry, Mapping) and entry.get("event") == name
    ]
    if not selected:
        raise Panel8TerminalClosureFailure("W0 lacks " + name)
    return selected[-1 if last else 0]


def _exported_integer(value: Any, label: str) -> int:
    if not isinstance(value, Mapping) or value.get("kind") != "integer":
        raise Panel8TerminalClosureFailure(label + " is not an exported integer")
    return _integer(value.get("value"), label)


def _exported_vector(value: Any, length: int, label: str) -> list[int]:
    if not isinstance(value, Mapping) or value.get("kind") not in {
        "column",
        "vector",
        "small-vector",
    }:
        raise Panel8TerminalClosureFailure(label + " is not an exported vector")
    entries = value.get("values")
    if not isinstance(entries, list) or len(entries) != length:
        raise Panel8TerminalClosureFailure(label + " has the wrong length")
    return [
        _exported_integer(entry, f"{label}[{index}]")
        if isinstance(entry, Mapping)
        else _integer(entry, f"{label}[{index}]")
        for index, entry in enumerate(entries)
    ]


def _zero(length: int) -> list[int]:
    return [0] * length


def _initial_hnf(
    records: list[int], logs: list[int], permutation: list[int]
) -> list[Any]:
    columns = INITIAL_COLUMNS
    size = ROWS * columns
    log_size = LOG_STRIDE * columns
    args: list[Any] = [
        records[:size],
        ROWS,
        columns,
        permutation,
        4,
        logs[:log_size],
        PLACES,
        _zero(size),
        _zero(4 * columns),
        _zero(columns * columns),
        _zero(columns),
        _zero(1),
        _zero(13),
        _zero((ROWS - 4) * columns),
        _zero(4 * columns),
        _zero(size),
        _zero(10),
        _zero(size),
        _zero(columns),
        _zero(ROWS),
        _zero(ROWS),
        _zero(ROWS + 1),
        _zero(10),
        _zero(ROWS),
        _zero(size),
        _zero(size),
        _zero(size),
        _zero(6),
        _zero(log_size),
        _zero(size),
        _zero(columns * columns),
        _zero(columns * columns),
        _zero(columns + 1),
        _zero(11),
        _zero(size),
        _zero(size),
        _zero(log_size),
        _zero(ROWS),
        _zero(size),
        _zero(size),
        _zero(ROWS * (columns + ROWS)),
        _zero(log_size),
        _zero(7),
        _zero(9),
        _zero(300000),
        _zero(64),
        _zero(8),
        _zero(8),
    ]
    if pari_hnfspec_complete(*args) != 0 or args[43] != [
        0,
        7,
        143,
        0,
        7,
        14,
        0,
        150,
        0,
    ]:
        raise Panel8TerminalClosureFailure("initial source HNF replay changed")
    return args


def _append_hnf(
    h: list[int],
    dep: list[int],
    b: list[int],
    logs: list[int],
    permutation: list[int],
    state: list[int],
    records: list[int],
    raw_logs: list[int],
    total: int,
) -> list[Any]:
    h_rows, b_columns = state[0], state[2]
    lig = ROWS - b_columns
    width = 1 + h_rows
    c_width = width + b_columns
    args: list[Any] = [
        h,
        h_rows,
        dep,
        b,
        b_columns,
        logs,
        total,
        PLACES,
        permutation,
        ROWS,
        records[ROWS * total : ROWS * (total + 1)],
        1,
        raw_logs[LOG_STRIDE * total : LOG_STRIDE * (total + 1)],
        _zero(lig),
        _zero(lig),
        _zero(LOG_STRIDE),
        _zero(LOG_STRIDE),
        _zero(lig * width),
        _zero(LOG_STRIDE * c_width),
        _zero(lig * width),
        _zero(width),
        _zero(lig),
        _zero(lig),
        _zero(lig),
        _zero(10),
        _zero(ROWS),
        _zero(lig * width),
        _zero(lig * width),
        _zero(lig * b_columns),
        _zero(lig * width),
        _zero(width * width),
        _zero(width * width),
        _zero(width + 1),
        _zero(11),
        _zero(lig * width),
        _zero(lig * b_columns),
        _zero(LOG_STRIDE * c_width),
        _zero(lig),
        _zero(LOG_STRIDE * c_width),
        _zero(lig * lig),
        _zero(lig * lig),
        _zero(lig * (b_columns + lig)),
        _zero(LOG_STRIDE * (total + 1)),
        _zero(7),
        _zero(9),
    ]
    if pari_hnfadd(*args) != 0:
        raise Panel8TerminalClosureFailure("source HNF append replay changed")
    return args


def _reverse_append(
    selected: list[int],
    targets: int,
    old_columns: int,
    stage: list[Any],
    raw_output: list[int],
) -> list[int]:
    """Pull terminal coefficients through one one-column `hnfadd`."""
    old_h, old_b = stage[1], stage[4]
    rows, dep_rows = ROWS - old_b, 0
    width = 1 + old_h
    zero_prefix = old_columns - old_h - old_b
    previous = _zero(old_columns * targets)
    work = _zero((width + old_b) * targets)
    for target in range(targets):
        source = target * (old_columns + 1)
        destination = target * old_columns
        previous[destination : destination + zero_prefix] = selected[
            source : source + zero_prefix
        ]
        work[target * (width + old_b) : (target + 1) * (width + old_b)] = selected[
            source + zero_prefix : source + old_columns + 1
        ]
    _pari_reverse_hnffinal_selection(
        work,
        width + old_b,
        targets,
        rows,
        dep_rows,
        width,
        old_b,
        stage[30],
        0,
        stage[29],
        0,
        stage[34],
        0,
        stage[28],
        0,
        stage[37],
        0,
        selected,
        _zero((rows + dep_rows) * old_b),
    )
    permutation = stage[8]
    new_relations = stage[10]
    for target in range(targets):
        wb = target * (width + old_b)
        pb = target * old_columns
        previous[pb + zero_prefix : pb + zero_prefix + old_h] = work[
            wb + 1 : wb + 1 + old_h
        ]
        previous[pb + zero_prefix + old_h : pb + old_columns] = work[
            wb + 1 + old_h : wb + width + old_b
        ]
        coefficient = work[wb]
        raw_output[target * COLUMNS + old_columns] = coefficient
        if coefficient:
            for tail in range(old_b):
                row = permutation[rows + dep_rows + tail] - 1
                previous[pb + zero_prefix + old_h + tail] -= (
                    new_relations[row] * coefficient
                )
    return previous


def _source_closure(
    records: list[int], logs: list[int], initial_perm: list[int]
) -> dict[str, Any]:
    first = _initial_hnf(records, logs, initial_perm)
    checkpoints = [_strings(first[41])]
    stages: list[list[Any]] = []
    h, dep, b, current_logs, state = (
        first[38],
        first[39],
        first[40],
        first[41],
        first[43],
    )
    for total in (150, 151):
        stage = _append_hnf(
            h, dep, b, current_logs, first[3], state, records, logs, total
        )
        stages.append(stage)
        checkpoints.append(_strings(stage[42]))
        h, dep, b, current_logs, state = (
            stage[39],
            stage[40],
            stage[41],
            stage[42],
            stage[44],
        )
    if state != [0, 9, 143, 0, 9, 0, 0, 152, 0]:
        raise Panel8TerminalClosureFailure("terminal source HNF state changed")

    targets = COLUMNS
    selected = _zero(COLUMNS * targets)
    raw = _zero(COLUMNS * targets)
    for target in range(targets):
        selected[target * COLUMNS + target] = 1
    selected = _reverse_append(selected, targets, 151, stages[1], raw)
    selected = _reverse_append(selected, targets, 150, stages[0], raw)

    work = _zero(INITIAL_COLUMNS * targets)
    _pari_reverse_hnffinal_selection(
        selected,
        INITIAL_COLUMNS,
        targets,
        14,
        0,
        21,
        129,
        first[30],
        0,
        first[29],
        0,
        first[34],
        0,
        first[26],
        0,
        first[37],
        0,
        work,
        _zero(14 * 129),
    )
    cleanup = first[9]
    for target in range(targets):
        for source in range(INITIAL_COLUMNS):
            raw[target * COLUMNS + source] = sum(
                cleanup[cleaned * INITIAL_COLUMNS + source]
                * selected[target * INITIAL_COLUMNS + cleaned]
                for cleaned in range(INITIAL_COLUMNS)
            )

    transform = raw[: KERNEL * COLUMNS]
    perm = list(first[3])
    inverse_perm = [0] * ROWS
    for position, physical in enumerate(perm):
        inverse_perm[physical - 1] = position
    right_inverse: list[int] = []
    for row in range(ROWS):
        terminal_column = KERNEL + inverse_perm[row]
        right_inverse.extend(
            raw[terminal_column * COLUMNS : (terminal_column + 1) * COLUMNS]
        )

    for column in range(KERNEL):
        for row in range(ROWS):
            if (
                sum(
                    records[source * ROWS + row] * transform[column * COLUMNS + source]
                    for source in range(COLUMNS)
                )
                != 0
            ):
                raise Panel8TerminalClosureFailure("R*T is not zero")
    for column in range(ROWS):
        for row in range(ROWS):
            value = sum(
                records[source * ROWS + row] * right_inverse[column * COLUMNS + source]
                for source in range(COLUMNS)
            )
            if value != int(row == column):
                raise Panel8TerminalClosureFailure("R*Q is not the identity")
    return {
        "transform": transform,
        "rightInverse": right_inverse,
        "terminalPermutation": perm,
        "checkpoints": checkpoints,
        "states": [first[43], stages[0][44], stages[1][44]],
    }


def _w0_exact_relations(
    accepted: Mapping[str, Any], w0: Mapping[str, Any]
) -> dict[str, Any]:
    events = w0.get("events")
    if not isinstance(events, list):
        raise Panel8TerminalClosureFailure("W0 events changed")
    prepared = _event(events, "prepared")
    tensor_value = prepared.get("multiplicationTensor")
    if not isinstance(tensor_value, list):
        raise Panel8TerminalClosureFailure("W0 multiplication tensor changed")
    tensor = [
        _exported_integer(value, "multiplication tensor")
        if isinstance(value, Mapping)
        else _integer(value, "multiplication tensor")
        for value in tensor_value
    ]
    if len(tensor) != DEGREE**3:
        raise Panel8TerminalClosureFailure("W0 multiplication tensor has wrong size")
    factor_event = _event(events, "factor_base")
    descriptors = factor_event.get("LP")
    if not isinstance(descriptors, Mapping) or descriptors.get("kind") != "vector":
        raise Panel8TerminalClosureFailure("W0 factor descriptors changed")
    entries = descriptors.get("values")
    if not isinstance(entries, list) or len(entries) != ROWS:
        raise Panel8TerminalClosureFailure("W0 factor-base size changed")
    ideals: list[int] = []
    norms: list[int] = []
    for index, descriptor in enumerate(entries):
        if not isinstance(descriptor, Mapping) or descriptor.get("kind") != "vector":
            raise Panel8TerminalClosureFailure("W0 factor descriptor changed")
        values = descriptor.get("values")
        if not isinstance(values, list) or len(values) != 5:
            raise Panel8TerminalClosureFailure("W0 factor descriptor width changed")
        prime = _exported_integer(values[0], "factor prime")
        generator = _exported_vector(values[1], DEGREE, "factor generator")
        residue_degree = _exported_integer(values[3], "factor residue degree")
        ideal = [0] * 16
        pari_prime_ideal_hnf(
            tensor, generator, DEGREE, prime, 0, [0] * 16, [0] * 16, [0] * 4, ideal
        )
        norm = prime**residue_degree
        if _quartic_hnf(ideal) != tuple(ideal) or abs(_determinant4(ideal)) != norm:
            raise Panel8TerminalClosureFailure("factor-base ideal replay failed")
        ideals.extend(ideal)
        norms.append(norm)

    terminal = accepted.get("terminal")
    if not isinstance(terminal, Mapping):
        raise Panel8TerminalClosureFailure("accepted terminal owner changed")
    records = _integers(terminal.get("relationRecords"), ROWS * COLUMNS, "relations")
    generators = _integers(terminal.get("generators"), DEGREE * COLUMNS, "generators")
    w0_hnf = _event(events, "hnf", last=True)
    witnesses = w0_hnf.get("relationRecords")
    if not isinstance(witnesses, list) or len(witnesses) != COLUMNS:
        raise Panel8TerminalClosureFailure("W0 terminal relation records changed")
    relation_norms: list[int] = []
    identity = (1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)
    for column, witness in enumerate(witnesses):
        if not isinstance(witness, Mapping):
            raise Panel8TerminalClosureFailure("W0 relation witness changed")
        row = _exported_vector(witness.get("R"), ROWS, "W0 relation")
        if row != records[ROWS * column : ROWS * (column + 1)]:
            raise Panel8TerminalClosureFailure("accepted relation detached from W0")
        exported = witness.get("m")
        if isinstance(exported, Mapping) and exported.get("kind") == "integer":
            alpha = [_exported_integer(exported, "principal generator"), 0, 0, 0]
        else:
            alpha = _exported_vector(exported, DEGREE, "principal generator")
        if alpha != generators[DEGREE * column : DEGREE * (column + 1)]:
            raise Panel8TerminalClosureFailure("accepted generator detached from W0")
        product = identity
        norm = 1
        for factor in range(ROWS):
            exponent = row[factor]
            if exponent < 0 or exponent > 8:
                raise Panel8TerminalClosureFailure(
                    "relation exponent left retained domain"
                )
            norm *= norms[factor] ** exponent
            ideal = ideals[16 * factor : 16 * (factor + 1)]
            for _ in range(exponent):
                product = _quartic_product(product, ideal, tensor)
        if product != _principal_hnf(alpha, tensor):
            raise Panel8TerminalClosureFailure(
                "principal ideal replay failed at relation " + str(column + 1)
            )
        multiplication = [0] * 16
        pari_quartic_mul_matrix(tensor, alpha, multiplication)
        if abs(_determinant4(multiplication)) != norm:
            raise Panel8TerminalClosureFailure(
                "principal norm replay failed at relation " + str(column + 1)
            )
        relation_norms.append(norm)
    return {
        "tensor": tensor,
        "ideals": ideals,
        "norms": norms,
        "records": records,
        "generators": generators,
        "relationNorms": relation_norms,
        "initialPermutation": _exported_vector(
            factor_event.get("perm"), ROWS, "initial HNF permutation"
        ),
    }


def compose_authenticated_panel8_terminal_closure(
    accepted: Mapping[str, Any],
    c5: Mapping[str, Any],
    c6: Mapping[str, Any],
    w0: Mapping[str, Any],
    ancestry: Mapping[str, Any],
) -> dict[str, Any]:
    """Replay and serialize panel 8's exact terminal relation closure."""
    if (
        accepted.get("schema") != ACCEPTED_SCHEMA
        or accepted.get("field", {}).get("id") != FIELD_ID
    ):
        raise Panel8TerminalClosureFailure("wrong accepted-retry authority")
    if c5.get("schema") != C5_SCHEMA or c5.get(
        "acceptedRetryOwnerSha256"
    ) != ancestry.get("acceptedRetryOwnerSha256"):
        raise Panel8TerminalClosureFailure("wrong C5 authority")
    if (
        c6.get("schema") != C6_SCHEMA
        or c6.get("status") != "not_given"
        or c6.get("reason") != "PRECI"
    ):
        raise Panel8TerminalClosureFailure("wrong C6 authority")
    if c6.get("ancestry", {}).get("c5OwnerSha256") != ancestry.get("c5OwnerSha256"):
        raise Panel8TerminalClosureFailure("C6 is detached from C5")
    if w0.get("schema") != W0_SCHEMA or w0.get("field", {}).get("id") != FIELD_ID:
        raise Panel8TerminalClosureFailure("wrong W0 authority")
    if accepted.get("ancestry", {}).get("preparedW0Sha256") != ancestry.get(
        "pristineW0Sha256"
    ):
        raise Panel8TerminalClosureFailure("accepted owner is detached from W0")
    exact = _w0_exact_relations(accepted, w0)
    terminal = accepted["terminal"]
    logs = _integers(terminal.get("packedLogEmbeddings"), LOG_STRIDE * COLUMNS, "logs")
    closure = _source_closure(exact["records"], logs, exact["initialPermutation"])
    wanted = [entry.get("transformedLogs") for entry in accepted.get("retryPasses", [])]
    if closure["checkpoints"] != wanted:
        raise Panel8TerminalClosureFailure("source-order packed-log ancestry changed")
    transform = closure["transform"]
    right_inverse = closure["rightInverse"]
    records = exact["records"]
    generators = exact["generators"]
    ideals = exact["ideals"]
    norms = exact["norms"]
    relation_norms = exact["relationNorms"]
    return {
        "schema": SCHEMA,
        "field": dict(accepted["field"]),
        "status": "closed",
        "ancestry": dict(ancestry),
        "dimensions": {
            "factorBaseSize": ROWS,
            "relationCount": COLUMNS,
            "kernelRank": KERNEL,
            "degree": DEGREE,
            "places": PLACES,
        },
        "relationClosure": {
            "transformShape": [COLUMNS, KERNEL],
            "transform": _strings(transform),
            "rightInverseShape": [COLUMNS, ROWS],
            "rightInverse": _strings(right_inverse),
            "terminalPermutation": _strings(closure["terminalPermutation"]),
            "relationTimesTransformZero": True,
            "relationTimesRightInverseIdentity": True,
            "transformSha256": _array_digest(transform),
            "rightInverseSha256": _array_digest(right_inverse),
        },
        "exactRelations": {
            "relationRecordsShape": [ROWS, COLUMNS],
            "relationRecords": _strings(records),
            "principalGeneratorsShape": [DEGREE, COLUMNS],
            "principalGenerators": _strings(generators),
            "factorBaseIdealsShape": [DEGREE, DEGREE, ROWS],
            "factorBaseIdeals": _strings(ideals),
            "factorBaseNorms": _strings(norms),
            "relationNorms": _strings(relation_norms),
            "relationRecordsSha256": _array_digest(records),
            "principalGeneratorsSha256": _array_digest(generators),
            "factorBaseIdealsSha256": _array_digest(ideals),
        },
        "replay": {
            "w0RelationsExact": True,
            "packedLogsSourceOrderExact": True,
            "principalIdealsExact": True,
            "principalNormsExact": True,
            "all152RelationsReplayed": True,
            "hnfStates": closure["states"],
            "packedLogCheckpointSha256": [
                _digest(value) for value in closure["checkpoints"]
            ],
        },
        "assumptions": {
            "pari2174Correspondence": True,
            "upstreamBoundsAssumed": True,
            "c6Materialization": "not_given(PRECI)",
            "publicCompletion": False,
        },
    }


__all__ = [
    "Panel8TerminalClosureFailure",
    "SCHEMA",
    "compose_authenticated_panel8_terminal_closure",
]
