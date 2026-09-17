"""Exact replay boundary for the live mixed-quartic compact units.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

The field-3 run retains every raw relation and principal generator, and the
unit suffix retains the 13-column logarithmic kernel and its final rank-two
transform.  What it does *not* retain is the integer transform from the 301
raw relations to those 13 kernel columns.  This module checks every identity
which crosses that boundary and reports the missing owner precisely.  A hash
identifies each immutable capture, but hashes and modular fingerprints are
never used as mathematical evidence.
"""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
from typing import Any, Mapping, Sequence


ROWS = 288
RELATIONS = 301
DEGREE = 4
PLACES = 3
ACCEPTED = 13
RANK = 2
AUTHORITY_SHA256 = "246bfe2af51c8be732308719773fc7d696f7dc1bf21958c91d96cd8fc448954c"
INITIAL_SHA256 = "81b9d3b237e781a697f0ae170554426b363ec2235297407be1deed38ebbbc6fe"
SUFFIX_SHA256 = "b3ccd8916527e8a7df4a7d10a2f5cb9e76865d5209532817ac65c1aaa178f5e7"


class Field3CompactUnitReplayFailure(ValueError):
    """The retained field-3 compact-unit evidence is inconsistent."""


def _load(path: str | Path, expected_sha256: str) -> Mapping[str, Any]:
    raw = Path(path).read_bytes()
    # This is artifact selection/provenance only.  Every mathematical identity
    # used below is recomputed from the selected full exact owners.
    if hashlib.sha256(raw).hexdigest() != expected_sha256:
        raise Field3CompactUnitReplayFailure("unexpected durable artifact")
    try:
        value = json.loads(raw)
    except (TypeError, ValueError, UnicodeError) as error:
        raise Field3CompactUnitReplayFailure("durable artifact is not JSON") from error
    if not isinstance(value, Mapping):
        raise Field3CompactUnitReplayFailure("durable artifact is not an object")
    return value


def _integers(value: Any, length: int, name: str) -> list[int]:
    if isinstance(value, (str, bytes)) or not isinstance(value, Sequence):
        raise Field3CompactUnitReplayFailure(name + " is not a sequence")
    if len(value) != length:
        raise Field3CompactUnitReplayFailure(name + " has the wrong length")
    answer: list[int] = []
    for entry in value:
        if isinstance(entry, bool):
            raise Field3CompactUnitReplayFailure(name + " contains a boolean")
        try:
            integer = int(entry)
        except (TypeError, ValueError, OverflowError) as error:
            raise Field3CompactUnitReplayFailure(
                name + " contains a non-integer"
            ) from error
        if str(integer) != str(entry):
            raise Field3CompactUnitReplayFailure(
                name + " contains a noncanonical integer"
            )
        answer.append(integer)
    return answer


def _packed(entries: Any, name: str) -> list[int]:
    if isinstance(entries, (str, bytes)) or not isinstance(entries, Sequence):
        raise Field3CompactUnitReplayFailure(name + " is not packed logarithms")
    answer: list[int] = []
    for entry in entries:
        if not isinstance(entry, Sequence) or len(entry) != 3:
            raise Field3CompactUnitReplayFailure(name + " has a malformed entry")
        kind = int(entry[0])
        if kind not in (1, 2):
            raise Field3CompactUnitReplayFailure(name + " has an invalid kind")
        answer.append(kind)
        for component in entry[1:]:
            answer.extend(_integers(component, 3, name + " component"))
    return answer


def _determinant4(matrix: Sequence[int]) -> int:
    """Fraction-free determinant of a column-major 4 by 4 matrix."""
    a = [[int(matrix[4 * column + row]) for column in range(4)] for row in range(4)]
    sign = 1
    denominator = 1
    for pivot_index in range(3):
        if a[pivot_index][pivot_index] == 0:
            swap = next(
                (row for row in range(pivot_index + 1, 4) if a[row][pivot_index]),
                None,
            )
            if swap is None:
                return 0
            a[pivot_index], a[swap] = a[swap], a[pivot_index]
            sign = -sign
        pivot = a[pivot_index][pivot_index]
        for row in range(pivot_index + 1, 4):
            for column in range(pivot_index + 1, 4):
                numerator = (
                    a[row][column] * pivot
                    - a[row][pivot_index] * a[pivot_index][column]
                )
                if numerator % denominator:
                    raise Field3CompactUnitReplayFailure("nonexact Bareiss division")
                a[row][column] = numerator // denominator
        denominator = pivot
    return sign * a[3][3]


def _multiplication_matrix(element: Sequence[int], tensor: Sequence[int]) -> list[int]:
    return [
        sum(element[basis] * tensor[16 * basis + entry] for basis in range(4))
        for entry in range(16)
    ]


def _real_value(mantissa: int, precision: int, exponent: int) -> float:
    if precision == -1:
        return float(mantissa)
    if mantissa == 0:
        return 0.0
    return math.ldexp(float(mantissa), exponent - (precision - 1))


def _column_prefix(matrix: Sequence[int], source_rows: int, rows: int) -> list[int]:
    if len(matrix) % source_rows:
        raise Field3CompactUnitReplayFailure("integer matrix has the wrong shape")
    return [
        matrix[column * source_rows + row]
        for column in range(len(matrix) // source_rows)
        for row in range(rows)
    ]


def replay_field3_compact_units(
    authority_path: str | Path,
    initial_path: str | Path,
    suffix_path: str | Path,
    raw_to_accepted: Sequence[Any] | None = None,
) -> dict[str, Any]:
    """Replay the exact retained boundary, without invoking PARI.

    `raw_to_accepted`, when eventually retained, must be the column-major
    301 by 13 integer transform whose columns are the exact HNF kernel columns.
    Until it exists, returning an explicit incomplete result is the only honest
    outcome: neither exact units nor principal-ideal-one claims are published.
    """
    capture = _load(authority_path, AUTHORITY_SHA256)
    initial = _load(initial_path, INITIAL_SHA256)
    suffix = _load(suffix_path, SUFFIX_SHA256)
    try:
        owners = capture["authority"]["owners"]
        expected = initial["expected"][0]
    except (KeyError, IndexError, TypeError) as error:
        raise Field3CompactUnitReplayFailure("capture schema changed") from error
    if not isinstance(owners, Mapping) or not isinstance(expected, Mapping):
        raise Field3CompactUnitReplayFailure("capture owners changed")

    relation_state = _integers(owners["relationState"], 6, "relation state")
    hnf_state = _integers(owners["hnfState"], 9, "HNF state")
    if relation_state[0] != RELATIONS or relation_state[4:] != [RELATIONS, RELATIONS]:
        raise Field3CompactUnitReplayFailure("terminal relation generation changed")
    if hnf_state[0] != 2 or hnf_state[2] != 286 or hnf_state[7] != RELATIONS:
        raise Field3CompactUnitReplayFailure("terminal HNF dimensions changed")
    if RELATIONS - hnf_state[0] - hnf_state[2] != ACCEPTED:
        raise Field3CompactUnitReplayFailure("accepted unit-column count changed")

    relations = _integers(
        owners["relationRecords"], ROWS * RELATIONS, "relation matrix"
    )
    generators = _integers(
        owners["principalGenerators"], DEGREE * RELATIONS, "principal generators"
    )
    relation_logs = _integers(
        owners["relationLogs"], 7 * PLACES * RELATIONS, "relation logarithms"
    )
    packet_norms = _integers(owners["packetNorms"], ROWS, "factor-base norms")
    tensor = _integers(expected["basisTable"], DEGREE**3, "multiplication tensor")
    if tensor[:16] != [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]:
        raise Field3CompactUnitReplayFailure("multiplication identity changed")

    # Recompute the norm consequence of all 301 exact principal relations.
    # This is deliberately not promoted to an ideal-equality proof.
    for relation in range(RELATIONS):
        element = generators[4 * relation : 4 * relation + 4]
        element_norm = abs(_determinant4(_multiplication_matrix(element, tensor)))
        ideal_norm = 1
        for factor in range(ROWS):
            exponent = relations[relation * ROWS + factor]
            if exponent < 0:
                raise Field3CompactUnitReplayFailure(
                    "negative collected relation exponent"
                )
            if exponent:
                ideal_norm *= packet_norms[factor] ** exponent
        if element_norm != ideal_norm:
            raise Field3CompactUnitReplayFailure(
                f"principal relation norm mismatch at column {relation}"
            )

        # Rational scalar columns give an independent embedding/log binding.
        # The complex place is weighted twice, as in the retained Buchall logs.
        if element[0] > 0 and element[1:] == [0, 0, 0]:
            wanted = math.log(element[0])
            for place, weight in enumerate((1, 1, 2)):
                at = (relation * PLACES + place) * 7
                if relation_logs[at] != 1 or relation_logs[at + 4] != 0:
                    raise Field3CompactUnitReplayFailure(
                        "scalar logarithm kind changed"
                    )
                got = _real_value(*relation_logs[at + 1 : at + 4])
                if abs(got - weight * wanted) > 2.0**-45:
                    raise Field3CompactUnitReplayFailure(
                        f"principal generator/log mismatch at column {relation}"
                    )

    terminal_logs = _integers(
        capture["terminalHNF"][3], 7 * PLACES * RELATIONS, "terminal C"
    )
    suffix_a = _packed(suffix["A"], "suffix A")
    if len(suffix_a) != 15 * PLACES * 7:
        raise Field3CompactUnitReplayFailure("pristine suffix A shape changed")
    l_full = _integers(suffix["L"], 15 * RANK, "unit lattice")
    u1_full = _integers(suffix["U1"], 15 * RANK, "first unit transform")
    u2 = _integers(suffix["U2"], RANK * RANK, "second unit transform")
    u_full = _integers(suffix["U"], 15 * RANK, "unit transform")
    final_u_full = _integers(suffix["finalU"], 15 * RANK, "final unit transform")
    accepted_l = _column_prefix(l_full, 15, ACCEPTED)
    accepted_u1 = _column_prefix(u1_full, 15, ACCEPTED)
    accepted_u = _column_prefix(u_full, 15, ACCEPTED)
    accepted_final_u = _column_prefix(final_u_full, 15, ACCEPTED)
    composed: list[int] = []
    for column in range(RANK):
        for row in range(ACCEPTED):
            composed.append(
                accepted_u1[row] * u2[2 * column]
                + accepted_u1[ACCEPTED + row] * u2[2 * column + 1]
            )
    if composed != accepted_u or accepted_u != accepted_final_u:
        raise Field3CompactUnitReplayFailure("U1/U2/U/finalU composition changed")
    support = sorted(
        {
            row
            for column in range(RANK)
            for row in range(ACCEPTED)
            if accepted_final_u[column * ACCEPTED + row]
        }
    )
    for column in support:
        start = column * PLACES * 7
        stop = start + PLACES * 7
        if terminal_logs[start:stop] != suffix_a[start:stop]:
            raise Field3CompactUnitReplayFailure(
                "selected terminal HNF log and suffix A diverged"
            )
    if suffix["clean"] != suffix["finalA"]:
        raise Field3CompactUnitReplayFailure("flag-zero PRECI branch changed final A")
    if int(suffix["reason"]) != 3:
        raise Field3CompactUnitReplayFailure("expected pristine PRECI not_given branch")

    missing = {
        "name": "raw_to_accepted_relation_transform",
        "shape": [str(RELATIONS), str(ACCEPTED)],
        "layout": "column-major-raw-relations-by-accepted-columns",
        "required_entries": str(RELATIONS * ACCEPTED),
        "required_identities": [
            "relationRecords * transform == 0",
            "packedRelationLogs * transform == terminalAcceptedA",
        ],
        "must_be_retained_from": "the live hnfspec/hnfadd column-operation ancestry",
    }
    unmatched_suffix = [
        column
        for column in range(ACCEPTED)
        if terminal_logs[column * PLACES * 7 : (column + 1) * PLACES * 7]
        != suffix_a[column * PLACES * 7 : (column + 1) * PLACES * 7]
    ]
    if raw_to_accepted is None:
        return {
            "schema": "sagejs.pari-class-group/field3-compact-unit-replay-v1",
            "field": "x^4 - 2000022*x - 2000042",
            "source": {
                "authority_sha256": AUTHORITY_SHA256,
                "initial_sha256": INITIAL_SHA256,
                "suffix_sha256": SUFFIX_SHA256,
                "hashes_are_mathematical_authority": False,
            },
            "verified": {
                "principal_relation_norms": RELATIONS,
                "scalar_generator_log_bindings": sum(
                    generators[4 * i] > 0
                    and generators[4 * i + 1 : 4 * i + 4] == [0, 0, 0]
                    for i in range(RELATIONS)
                ),
                "terminal_packed_log_columns": len(support),
                "selected_log_support": [str(column) for column in support],
                "unmatched_unused_suffix_columns": [
                    str(column) for column in unmatched_suffix
                ],
                "compact_transform_shape": [str(ACCEPTED), str(RANK)],
                "compact_transform_entries": [str(value) for value in accepted_final_u],
                "lattice_entries": [str(value) for value in accepted_l],
                "regulator": list(suffix["R"]),
                "cleanarch_columns": len(suffix["clean"]) // PLACES,
                "getfu_decision": "PRECI-not_given",
                "expanded_units": None,
            },
            "terminal": {
                "status": "honest-partial-missing-exact-owner",
                "exact_units_verified": False,
                "principal_ideal_one_verified": False,
                "unit_saturation_verified": False,
                "missing_owner": missing,
                "additional_capture_gap": {
                    "name": "same_run_retained_unit_suffix",
                    "detail": (
                        "the pristine suffix agrees on selected columns 0 and 1, "
                        "but its unused columns 7 through 12 are from a different "
                        "relation generation"
                    ),
                },
            },
        }

    transform = _integers(
        raw_to_accepted, RELATIONS * ACCEPTED, "raw-to-accepted relation transform"
    )
    for column in range(ACCEPTED):
        for row in range(ROWS):
            value = sum(
                relations[relation * ROWS + row]
                * transform[column * RELATIONS + relation]
                for relation in range(RELATIONS)
            )
            if value:
                raise Field3CompactUnitReplayFailure(
                    "supplied relation transform is not a kernel"
                )
    # Exact packed-log replay is intentionally required before this branch can
    # publish units.  The existing source-faithful transformer is not duplicated
    # here; retaining the owner is the next implementation lane.
    raise Field3CompactUnitReplayFailure(
        "raw transform kernel passed, but packed-log and ideal replay are not yet connected"
    )


__all__ = [
    "Field3CompactUnitReplayFailure",
    "replay_field3_compact_units",
]
