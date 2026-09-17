"""Authenticated panel-row-8 C5 unit-lattice and cleanarch suffix.

PARI 2.17.4 algorithm, copyright (C) The PARI group;
GPL-2.0-or-later.

The native root begins at the immutable accepted-retry boundary.  It follows
`buchall`'s NULL `extract_full_lattice` branch, the integer and real LLL
reductions, composition, `cleanarchunit`, and `getfu`'s optional second real
LLL.  Pristine W0 values are comparison-only and are read by the authenticated
composer after this arithmetic call has returned.
"""

from collections.abc import Mapping, Sequence
import re
from typing import Any

from sagejs.native import Float64Buffer, IntegerBuffer, Int64Buffer, native

from .field3_mixed_unit_suffix import (
    pari_cleanarchunit_mixed_quartic,
    pari_field3_prepare_getfu,
)
from .log_matrix_transform import pari_log_matrix_transform
from .unit_lattice_reduction import (
    pari_unit_compose_rank_two,
    pari_unit_integer_lattice_rank_two,
    pari_unit_real_lattice_rank_two,
)
from .unit_lattice_selection import pari_unit_lattice_selection


ACCEPTED_SCHEMA = "sagejs.pari-class-group/panel8-accepted-retry-owner-v1"
OUTPUT_SCHEMA = "sagejs.pari-class-group/panel8-c5-unit-lattice-cleanarch-v1"
ACCEPTED_OWNER_SHA256 = (
    "b2e1a6a0d737880627d8829569c24447557c389690d2ec5a35a9e1c6c0430591"
)
FIELD_ID = (
    "generated-sha256-0857fab7114ab0045f1b91601101549c7b8d854c5c999b91afcb190cd2863363"
)
UNIT_COLUMNS = 9
PLACES = 3
PACKED_A = UNIT_COLUMNS * PLACES * 7


@native
def pari_panel8_c5_unit_lattice_cleanarch(
    packed_a: IntegerBuffer,
    relation_lattice: IntegerBuffer,
    regulator: IntegerBuffer,
    precision: int,
    selected: Int64Buffer,
    selection_state: Int64Buffer,
    selection_gathered: IntegerBuffer,
    selection_work: IntegerBuffer,
    selection_column: IntegerBuffer,
    selection_target: IntegerBuffer,
    selection_previous: IntegerBuffer,
    selection_trial: IntegerBuffer,
    selection_row_pivots: Int64Buffer,
    selection_heights: Int64Buffer,
    selection_hnf_state: Int64Buffer,
    integer_basis: IntegerBuffer,
    integer_transform: IntegerBuffer,
    integer_gram: IntegerBuffer,
    integer_mu: Float64Buffer,
    integer_mu_exponents: IntegerBuffer,
    integer_r: Float64Buffer,
    integer_r_exponents: IntegerBuffer,
    integer_s: Float64Buffer,
    integer_s_exponents: IntegerBuffer,
    integer_approximate: Float64Buffer,
    integer_float_gram: Float64Buffer,
    integer_alpha: IntegerBuffer,
    integer_column: IntegerBuffer,
    integer_column_exponents: IntegerBuffer,
    integer_normalized: Float64Buffer,
    integer_temporary: Float64Buffer,
    integer_dpe_scratch: Float64Buffer,
    integer_scratch: IntegerBuffer,
    integer_state: IntegerBuffer,
    real_triples: IntegerBuffer,
    real_integers: IntegerBuffer,
    real_form: IntegerBuffer,
    real_basis: IntegerBuffer,
    real_transform: IntegerBuffer,
    real_gram: IntegerBuffer,
    real_mu: Float64Buffer,
    real_mu_exponents: IntegerBuffer,
    real_r: Float64Buffer,
    real_r_exponents: IntegerBuffer,
    real_s: Float64Buffer,
    real_s_exponents: IntegerBuffer,
    real_approximate: Float64Buffer,
    real_float_gram: Float64Buffer,
    real_alpha: IntegerBuffer,
    real_column: IntegerBuffer,
    real_column_exponents: IntegerBuffer,
    real_normalized: Float64Buffer,
    real_temporary: Float64Buffer,
    real_dpe_scratch: Float64Buffer,
    real_integer_scratch: IntegerBuffer,
    real_state: IntegerBuffer,
    u1_work: IntegerBuffer,
    u2_work: IntegerBuffer,
    composed_work: IntegerBuffer,
    p_work: IntegerBuffer,
    au_work: IntegerBuffer,
    clean_scratch: IntegerBuffer,
    clean_work: IntegerBuffer,
    pi_cache: IntegerBuffer,
    agm_a: IntegerBuffer,
    agm_b: IntegerBuffer,
    agm_p: IntegerBuffer,
    agm_q: IntegerBuffer,
    agm_stack: IntegerBuffer,
    clean_state: Int64Buffer,
    matep: IntegerBuffer,
    arch: IntegerBuffer,
    final_a_work: IntegerBuffer,
    arch_real: IntegerBuffer,
    arch_imag: IntegerBuffer,
    clean_real: IntegerBuffer,
    clean_imag: IntegerBuffer,
    factor_work: IntegerBuffer,
    final_u_work: IntegerBuffer,
    output_u1: IntegerBuffer,
    output_u2: IntegerBuffer,
    output_u: IntegerBuffer,
    output_au: IntegerBuffer,
    output_clean: IntegerBuffer,
    output_factor: IntegerBuffer,
    output_final_a: IntegerBuffer,
    state: Int64Buffer,
) -> int:
    """Compute the rank-two suffix and transactionally publish exact states.

    `state` is status, precision, phase, selection result/live length, integer
    LLL status, first real LLL status, determinant U2, clean status, second
    real LLL status, determinant F, published, unit columns, places, rank, and
    accepted relation columns.
    """

    if precision != 192:
        raise ValueError("panel-8 C5 requires the accepted 192-bit precision")
    square = UNIT_COLUMNS * UNIT_COLUMNS
    if (
        len(packed_a) < PACKED_A
        or len(relation_lattice) < 2 * UNIT_COLUMNS
        or len(regulator) < 3
        or len(selected) < UNIT_COLUMNS
        or len(selection_state) < 7
        or len(selection_gathered) < 2 * UNIT_COLUMNS
        or len(selection_work) < 2 * UNIT_COLUMNS
        or len(selection_column) < 2
        or len(selection_target) < 2 * UNIT_COLUMNS
        or len(selection_previous) < 2 * UNIT_COLUMNS
        or len(selection_trial) < 2 * UNIT_COLUMNS
        or len(selection_row_pivots) < 2
        or len(selection_heights) < UNIT_COLUMNS
        or len(selection_hnf_state) < 15
        or len(integer_basis) < 2 * UNIT_COLUMNS
        or len(integer_transform) < square
        or len(integer_gram) < square
        or len(integer_mu) < square
        or len(integer_mu_exponents) < square
        or len(integer_r) < square
        or len(integer_r_exponents) < square
        or len(integer_s) < UNIT_COLUMNS
        or len(integer_s_exponents) < UNIT_COLUMNS
        or len(integer_approximate) < 2 * UNIT_COLUMNS
        or len(integer_float_gram) < square
        or len(integer_alpha) < UNIT_COLUMNS
        or len(integer_column) < UNIT_COLUMNS
        or len(integer_column_exponents) < UNIT_COLUMNS
        or len(integer_normalized) < UNIT_COLUMNS
        or len(integer_temporary) < UNIT_COLUMNS
        or len(integer_dpe_scratch) < UNIT_COLUMNS
        or len(integer_scratch) < UNIT_COLUMNS
        or len(integer_state) < 5
        or len(real_triples) < 18
        or len(u1_work) < 18
        or len(u2_work) < 4
        or len(composed_work) < 18
        or len(p_work) < 42
        or len(au_work) < 42
        or len(clean_scratch) < 42
        or len(clean_work) < 42
        or len(matep) < 42
        or len(arch) < 42
        or len(final_a_work) < 42
        or len(factor_work) < 4
        or len(final_u_work) < 18
        or len(output_u1) < 18
        or len(output_u2) < 4
        or len(output_u) < 18
        or len(output_au) < 42
        or len(output_clean) < 42
        or len(output_factor) < 4
        or len(output_final_a) < 42
        or len(state) < 16
    ):
        raise ValueError("short panel-8 C5 owner")
    for index in range(16):
        state[index] = 0
    state[0] = -1
    state[1] = precision
    state[12] = UNIT_COLUMNS
    state[13] = PLACES
    state[14] = 2
    state[15] = UNIT_COLUMNS

    status = pari_unit_lattice_selection(
        relation_lattice,
        2,
        UNIT_COLUMNS,
        selected,
        selection_state,
        selection_gathered,
        selection_work,
        selection_column,
        selection_target,
        selection_previous,
        selection_trial,
        selection_row_pivots,
        selection_heights,
        selection_hnf_state,
    )
    state[3] = status
    state[4] = selection_state[1]
    if status != 0 or selection_state[0] != 0 or selection_state[1] != 0:
        state[0] = 1
        return 1
    state[2] = 1
    status = pari_unit_integer_lattice_rank_two(
        relation_lattice,
        UNIT_COLUMNS,
        u1_work,
        integer_state,
        integer_basis,
        integer_transform,
        integer_gram,
        integer_mu,
        integer_mu_exponents,
        integer_r,
        integer_r_exponents,
        integer_s,
        integer_s_exponents,
        integer_approximate,
        integer_float_gram,
        integer_alpha,
        integer_column,
        integer_column_exponents,
        integer_normalized,
        integer_temporary,
        integer_dpe_scratch,
        integer_scratch,
    )
    state[5] = status
    if status != 0:
        state[0] = 2
        return 2
    pari_log_matrix_transform(packed_a, u1_work, PLACES, UNIT_COLUMNS, 2, False, p_work)
    for row in range(PLACES):
        for column_index in range(2):
            source = 7 * (column_index * PLACES + row) + 1
            target = 3 * (row * 2 + column_index)
            real_triples[target] = p_work[source]
            real_triples[target + 1] = p_work[source + 1]
            real_triples[target + 2] = p_work[source + 2]
    status = pari_unit_real_lattice_rank_two(
        real_triples,
        PLACES,
        real_integers,
        u2_work,
        real_form,
        real_basis,
        real_transform,
        real_gram,
        real_mu,
        real_mu_exponents,
        real_r,
        real_r_exponents,
        real_s,
        real_s_exponents,
        real_approximate,
        real_float_gram,
        real_alpha,
        real_column,
        real_column_exponents,
        real_normalized,
        real_temporary,
        real_dpe_scratch,
        real_integer_scratch,
        real_state,
    )
    state[6] = status
    if status != 0:
        state[0] = 3
        return 3
    determinant = u2_work[0] * u2_work[3] - u2_work[1] * u2_work[2]
    state[7] = determinant
    if determinant != 1 and determinant != -1:
        state[0] = 3
        return 3
    pari_unit_compose_rank_two(u1_work, UNIT_COLUMNS, u2_work, composed_work)
    pari_log_matrix_transform(
        packed_a, composed_work, PLACES, UNIT_COLUMNS, 2, False, au_work
    )
    status = pari_cleanarchunit_mixed_quartic(
        au_work,
        regulator,
        precision,
        pi_cache,
        agm_a,
        agm_b,
        agm_p,
        agm_q,
        agm_stack,
        clean_scratch,
        clean_work,
        clean_state,
    )
    state[8] = status
    if status != 0:
        state[0] = 4 + status
        return 4 + status
    state[2] = 2
    factor_work[0] = 1
    factor_work[1] = 0
    factor_work[2] = 0
    factor_work[3] = 1
    pari_field3_prepare_getfu(
        clean_work,
        factor_work,
        matep,
        arch,
        final_a_work,
        arch_real,
        arch_imag,
        clean_real,
        clean_imag,
    )
    for row in range(PLACES):
        for column_index in range(2):
            source = 7 * (column_index * PLACES + row) + 1
            target = 3 * (row * 2 + column_index)
            real_triples[target] = matep[source]
            real_triples[target + 1] = matep[source + 1]
            real_triples[target + 2] = matep[source + 2]
    status = pari_unit_real_lattice_rank_two(
        real_triples,
        PLACES,
        real_integers,
        factor_work,
        real_form,
        real_basis,
        real_transform,
        real_gram,
        real_mu,
        real_mu_exponents,
        real_r,
        real_r_exponents,
        real_s,
        real_s_exponents,
        real_approximate,
        real_float_gram,
        real_alpha,
        real_column,
        real_column_exponents,
        real_normalized,
        real_temporary,
        real_dpe_scratch,
        real_integer_scratch,
        real_state,
    )
    state[9] = status
    if status != 0:
        state[0] = 7
        return 7
    determinant = factor_work[0] * factor_work[3] - factor_work[1] * factor_work[2]
    state[10] = determinant
    if determinant != 1 and determinant != -1:
        state[0] = 7
        return 7
    pari_field3_prepare_getfu(
        clean_work,
        factor_work,
        matep,
        arch,
        final_a_work,
        arch_real,
        arch_imag,
        clean_real,
        clean_imag,
    )
    pari_unit_compose_rank_two(composed_work, UNIT_COLUMNS, factor_work, final_u_work)
    state[2] = 3
    for index in range(18):
        output_u1[index] = u1_work[index]
        output_u[index] = final_u_work[index]
    for index in range(4):
        output_u2[index] = u2_work[index]
        output_factor[index] = factor_work[index]
    for index in range(42):
        output_au[index] = au_work[index]
        output_clean[index] = clean_work[index]
        output_final_a[index] = final_a_work[index]
    state[0] = 0
    state[11] = 1
    return 0


class Panel8C5Failure(ValueError):
    """An authenticated panel-8 C5 input or differential failed closed."""


def _mapping(value: Any, name: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise Panel8C5Failure(name + " is not an object")
    return value


def _sha256(value: Any, name: str) -> str:
    if not isinstance(value, str) or re.fullmatch(r"[0-9a-f]{64}", value) is None:
        raise Panel8C5Failure(name + " is not a canonical SHA-256 digest")
    return value


def _integers(value: Any, length: int, name: str) -> list[int]:
    if isinstance(value, (str, bytes)) or not isinstance(value, Sequence):
        raise Panel8C5Failure(name + " is not an integer owner")
    if len(value) != length:
        raise Panel8C5Failure(name + " has the wrong length")
    result = []
    for entry in value:
        if isinstance(entry, bool):
            raise Panel8C5Failure(name + " contains a boolean")
        try:
            integer = int(entry)
        except (TypeError, ValueError, OverflowError) as error:
            raise Panel8C5Failure(name + " contains a non-integer") from error
        if str(integer) != str(entry):
            raise Panel8C5Failure(name + " contains a noncanonical integer")
        result.append(integer)
    return result


def _packed_real(value: Mapping[str, Any]) -> list[int]:
    if value.get("kind") == "integer":
        return [int(value["value"]), -1, 0]
    if value.get("kind") != "real":
        raise Panel8C5Failure("pristine scalar component is not real")
    return [int(value["mantissa"]), int(value["precision"]), int(value["exponent"])]


def _packed_scalar(value: Mapping[str, Any]) -> list[int]:
    if value.get("kind") == "complex":
        return [2, *_packed_real(value["real"]), *_packed_real(value["imag"])]
    return [1, *_packed_real(value), 0, -1, 0]


def _packed_matrix(value: Any) -> list[int]:
    matrix = _mapping(value, "pristine packed matrix")
    if matrix.get("kind") != "matrix":
        raise Panel8C5Failure("pristine packed value is not a matrix")
    return [
        cell
        for column in matrix["values"]
        for entry in column["values"]
        for cell in _packed_scalar(entry)
    ]


def _integer_matrix(value: Any) -> list[int]:
    matrix = _mapping(value, "pristine integer matrix")
    if matrix.get("kind") != "matrix":
        raise Panel8C5Failure("pristine integer value is not a matrix")
    return [
        int(entry["value"]) for column in matrix["values"] for entry in column["values"]
    ]


def _zeros(length: int) -> list[int]:
    return [0] * length


def _floats(length: int) -> list[float]:
    return [0.0] * length


def compose_authenticated_panel8_c5(
    accepted_owner: Mapping[str, Any],
    pristine_bundle: Mapping[str, Any],
    accepted_owner_sha256: str,
    pristine_sha256: str,
) -> dict[str, Any]:
    """Compute C5, then compare its exact outputs with pristine event 489."""

    accepted = _mapping(accepted_owner, "accepted retry owner")
    pristine = _mapping(pristine_bundle, "pristine W0 trace")
    accepted_owner_sha256 = _sha256(accepted_owner_sha256, "accepted owner digest")
    pristine_sha256 = _sha256(pristine_sha256, "pristine W0 digest")
    if accepted.get("schema") != ACCEPTED_SCHEMA:
        raise Panel8C5Failure("wrong accepted retry schema")
    if accepted_owner_sha256 != ACCEPTED_OWNER_SHA256:
        raise Panel8C5Failure("wrong accepted retry authority")
    field = _mapping(accepted.get("field"), "accepted field")
    if (
        field.get("id") != FIELD_ID
        or field.get("panelIndex") != 8
        or field.get("degree") != 4
        or field.get("signature") != [2, 1]
        or field.get("unitRank") != 2
    ):
        raise Panel8C5Failure("accepted field identity changed")
    ancestry = _mapping(accepted.get("ancestry"), "accepted ancestry")
    if ancestry.get("preparedW0Sha256") != pristine_sha256:
        raise Panel8C5Failure("accepted owner is detached from pristine W0")
    comparison = _mapping(accepted.get("pristineComparison"), "pristine comparison")
    if (
        comparison.get("allThreeExactPrefixesCompared") is not True
        or comparison.get("terminalStateCompared") is not True
    ):
        raise Panel8C5Failure("accepted owner lacks terminal comparison latches")
    terminal = _mapping(accepted.get("terminal"), "accepted terminal")
    if (
        terminal.get("status") != "accepted"
        or terminal.get("classNumber") != "1"
        or terminal.get("classInvariants") != []
        or terminal.get("relationLatticeShape") != [9, 2]
        or terminal.get("hnfShape") != {"W": [0, 0], "B": [0, 143], "C": [3, 152]}
        or terminal.get("packedLogComponentsPerEntry") != 7
    ):
        raise Panel8C5Failure("accepted terminal boundary changed")
    transformed = _integers(
        terminal.get("transformedLogs"), 7 * 3 * 152, "transformed logs"
    )
    packed_a = transformed[:PACKED_A]
    relation_lattice = _integers(
        terminal.get("relationLattice"), 18, "relation lattice"
    )
    regulator = _integers(terminal.get("regulator"), 3, "accepted regulator")

    u1 = _zeros(18)
    u2 = _zeros(4)
    composed = _zeros(18)
    au = _zeros(42)
    clean = _zeros(42)
    factor = _zeros(4)
    final_a = _zeros(42)
    state = _zeros(16)
    status = pari_panel8_c5_unit_lattice_cleanarch(
        packed_a,
        relation_lattice,
        regulator,
        192,
        _zeros(9),
        _zeros(7),
        _zeros(18),
        _zeros(18),
        _zeros(2),
        _zeros(18),
        _zeros(18),
        _zeros(18),
        _zeros(2),
        _zeros(9),
        _zeros(15),
        _zeros(18),
        _zeros(81),
        _zeros(81),
        _floats(81),
        _zeros(81),
        _floats(81),
        _zeros(81),
        _floats(9),
        _zeros(9),
        _floats(18),
        _floats(81),
        _zeros(9),
        _zeros(9),
        _zeros(9),
        _floats(9),
        _floats(9),
        _floats(9),
        _zeros(9),
        _zeros(5),
        _zeros(18),
        _zeros(6),
        _zeros(3),
        _zeros(6),
        _zeros(4),
        _zeros(4),
        _floats(4),
        _zeros(4),
        _floats(4),
        _zeros(4),
        _floats(2),
        _zeros(2),
        _floats(6),
        _floats(4),
        _zeros(2),
        _zeros(3),
        _zeros(3),
        _floats(3),
        _floats(3),
        _floats(3),
        _zeros(3),
        _zeros(2),
        _zeros(18),
        _zeros(4),
        _zeros(18),
        _zeros(42),
        _zeros(42),
        _zeros(42),
        _zeros(42),
        _zeros(3),
        _zeros(1024),
        _zeros(1024),
        _zeros(1024),
        _zeros(1024),
        _zeros(2048),
        _zeros(6),
        _zeros(42),
        _zeros(42),
        _zeros(42),
        _zeros(18),
        _zeros(18),
        _zeros(18),
        _zeros(18),
        _zeros(4),
        _zeros(18),
        u1,
        u2,
        composed,
        au,
        clean,
        factor,
        final_a,
        state,
    )
    if status != 0 or state[11] != 1:
        raise Panel8C5Failure("panel-8 C5 arithmetic failed: " + str(state))

    # Only now, after the complete arithmetic call, may pristine event 489 be
    # read.  It is not an input to any mathematical leaf above.
    events = pristine.get("events")
    if not isinstance(events, list):
        raise Panel8C5Failure("pristine W0 lacks events")
    references = [
        event for event in events if event.get("event") == "fundamental_units"
    ]
    if len(references) != 1:
        raise Panel8C5Failure("pristine W0 has the wrong fundamental-unit events")
    reference = references[0]
    expected_u = _integer_matrix(reference.get("U"))
    expected_a = _packed_matrix(reference.get("A"))
    if composed != expected_u:
        raise Panel8C5Failure("computed unit transform differs from pristine W0")
    if final_a != expected_a:
        raise Panel8C5Failure("computed archimedean units differ from pristine W0")
    if (
        reference.get("CU") != {"kind": "matrix", "values": []}
        or reference.get("fu") is not None
    ):
        raise Panel8C5Failure("pristine flag-zero result boundary changed")
    if (
        _packed_real(_mapping(reference.get("regulator"), "pristine regulator"))
        != regulator
    ):
        raise Panel8C5Failure("computed boundary regulator differs from pristine W0")
    if factor != [1, 0, 0, 1]:
        raise Panel8C5Failure("computed getfu second factor is not identity")

    return {
        "schema": OUTPUT_SCHEMA,
        "field": dict(field),
        "precision": 192,
        "acceptedRetryOwnerSha256": accepted_owner_sha256,
        "pristineW0Sha256": pristine_sha256,
        "ancestry": {
            "acceptedRetryOwnerSha256": accepted_owner_sha256,
            "pristineW0Sha256": pristine_sha256,
            "acceptedRetry": dict(ancestry),
        },
        "relationLatticeShape": [9, 2],
        "relationLattice": [str(value) for value in relation_lattice],
        "regulator": [str(value) for value in regulator],
        "selection": {"result": "NULL", "selectedColumns": []},
        "u1Shape": [9, 2],
        "u1": [str(value) for value in u1],
        "u2Shape": [2, 2],
        "u2": [str(value) for value in u2],
        "uShape": [9, 2],
        "u": [str(value) for value in composed],
        "auShape": [3, 2],
        "au": [str(value) for value in au],
        "cleanAShape": [3, 2],
        "cleanA": [str(value) for value in clean],
        "getfuFactorShape": [2, 2],
        "getfuFactor": [str(value) for value in factor],
        "aShape": [3, 2],
        "a": [str(value) for value in final_a],
        "state": state,
        "pristineComparison": {
            "event": 489,
            "uCompared": True,
            "aCompared": True,
            "emptyCUCompared": True,
            "nullFuCompared": True,
            "regulatorCompared": True,
            "referenceReadAfterComputation": True,
        },
    }


__all__ = [
    "Panel8C5Failure",
    "compose_authenticated_panel8_c5",
    "pari_panel8_c5_unit_lattice_cleanarch",
]
